-- Billplz Payment Order incentives: the academy receives a government grant per
-- student and has to pay it out to each student's own bank account.
--
-- The money side dictates the shape.
--
-- Bank details are admin-or-self, deliberately NOT app.is_staff. A trainer
-- manages students but has no business reading account numbers, and RLS is
-- row-level — there is no column-level policy to fall back on, so the row has
-- to be unreachable in the first place.
--
-- A payout SNAPSHOTS the bank fields at the moment recipients are set. Where
-- the money actually went must stay readable after the student edits their
-- account, or a transfer that failed cannot be traced back to an account
-- number that no longer exists anywhere.
--
-- Clients get no DML on incentive_payouts at all — the appointments precedent.
-- Rows are minted by set_incentive_recipients and mutated only by the edge
-- functions under the service role: "who has been paid" is not a fact a browser
-- may assert.
--
-- app.claim_incentive_payouts is the load-bearing one. It is a single
-- UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED) RETURNING, so two
-- concurrent billplz-disburse invocations — a retry, a double click, the resume
-- loop racing itself — can never hand the same payout to Billplz twice. Read,
-- then write, would be a race that costs real money.
-- Full note: docs/billplz-incentives.md

create type public.incentive_batch_status as enum
  ('draft', 'sending', 'sent', 'cancelled');

create type public.incentive_payout_status as enum
  ('pending', 'sending', 'processing', 'completed', 'failed', 'cancelled');

-- ---------------------------------------------------------------------------
-- Billplz credentials live beside the ToyyibPay ones: metadata here, the keys
-- themselves in Vault. Two keys, not one — the API Secret Key authenticates the
-- request and the X Signature Key signs every payment-order checksum, so a
-- connection is only good when both are right.
-- ---------------------------------------------------------------------------
alter table public.academy_payment_settings
  add column if not exists billplz_has_secret    boolean not null default false,
  add column if not exists billplz_secret_last4  text,
  -- Sandbox by default: connecting keys must never be the step that starts
  -- moving real money.
  add column if not exists billplz_is_sandbox    boolean not null default true,
  add column if not exists billplz_enabled       boolean not null default false,
  add column if not exists billplz_secret_set_at timestamptz,
  add column if not exists billplz_secret_set_by uuid references auth.users(id) on delete set null;

-- ---------------------------------------------------------------------------
-- The student's account. One row per student — a person has one place they
-- want the grant paid into, and a second row would only raise the question of
-- which one is the real one.
-- ---------------------------------------------------------------------------
create table if not exists public.student_bank_accounts (
  student_id          uuid primary key,
  academy_id          uuid not null references public.academies(id) on delete cascade,
  bank_code           text not null,   -- SWIFT/BIC, e.g. MBBEMYKL
  bank_account_number text not null,   -- digits only, normalised on write
  account_holder_name text not null,   -- as printed by the bank
  account_holder_ic   text,            -- optional; some banks match on it
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  updated_by          uuid references auth.users(id) on delete set null,

  constraint student_bank_accounts_number_check
    check (bank_account_number ~ '^[0-9]{5,20}$'),
  constraint student_bank_accounts_bank_code_check
    check (length(btrim(bank_code)) between 4 and 24),
  constraint student_bank_accounts_holder_check
    check (length(btrim(account_holder_name)) > 0),

  -- Composite, so a row can never claim the wrong tenant: the insert policy
  -- lets a student write their own student_id, and this is what stops them
  -- filing it under someone else's academy.
  constraint student_bank_accounts_academy_id_student_id_fkey
    foreign key (academy_id, student_id)
    references public.students (academy_id, id) on delete cascade
);

create index if not exists student_bank_accounts_academy_id_idx
  on public.student_bank_accounts (academy_id);

alter table public.student_bank_accounts enable row level security;

-- Admin or the student themselves, on all four commands. app.is_staff is
-- deliberately absent — see the banner.
create policy "student bank: admin or own read"
  on public.student_bank_accounts for select to authenticated
  using (app.is_admin(academy_id) or app.owns_student(student_id));
create policy "student bank: admin or own insert"
  on public.student_bank_accounts for insert to authenticated
  with check (app.is_admin(academy_id) or app.owns_student(student_id));
create policy "student bank: admin or own update"
  on public.student_bank_accounts for update to authenticated
  using (app.is_admin(academy_id) or app.owns_student(student_id))
  with check (app.is_admin(academy_id) or app.owns_student(student_id));
create policy "student bank: admin or own delete"
  on public.student_bank_accounts for delete to authenticated
  using (app.is_admin(academy_id) or app.owns_student(student_id));

create trigger set_updated_at
  before update on public.student_bank_accounts
  for each row execute function app.set_updated_at();

comment on table public.student_bank_accounts is
  'Where a student wants money paid. Readable by academy admins and the student only — never by trainers.';

-- ---------------------------------------------------------------------------
-- A disbursement run. One Billplz payment order collection, one amount per
-- head — the grant is a flat sum per student, so the amount is a property of
-- the batch and not of each recipient.
-- ---------------------------------------------------------------------------
create table if not exists public.incentive_batches (
  id                    uuid primary key default gen_random_uuid(),
  academy_id            uuid not null references public.academies(id) on delete cascade,
  title                 text not null,
  description           text,   -- reaches the recipient as Billplz `description`
  amount_sen            integer not null,
  status                public.incentive_batch_status not null default 'draft',
  billplz_collection_id text,
  -- Pinned from settings when sending starts, so a batch half-sent in sandbox
  -- cannot be finished against production.
  is_sandbox            boolean not null default true,
  -- Guards the callback URL. Billplz posts to a public endpoint (verify_jwt
  -- false), so the nonce is what makes a forged callback have to guess.
  callback_nonce        text not null default replace(gen_random_uuid()::text, '-', ''),
  created_by            uuid references auth.users(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  sent_at               timestamptz,

  constraint incentive_batches_amount_check check (amount_sen > 0)
);

create index if not exists incentive_batches_academy_id_created_at_idx
  on public.incentive_batches (academy_id, created_at desc);

alter table public.incentive_batches enable row level security;

create policy "incentive batches: admin read"
  on public.incentive_batches for select to authenticated
  using (app.is_admin(academy_id));
create policy "incentive batches: admin insert"
  on public.incentive_batches for insert to authenticated
  with check (app.is_admin(academy_id));
-- Draft-only on BOTH sides of the update, and on delete. Without the predicate
-- an admin could PATCH a sent batch back to 'draft' over PostgREST, re-run the
-- recipient picker — which deletes every payout row, `billplz_payment_order_id`
-- and all — and disburse the same money a second time. The edge functions move
-- a batch out of draft under the service role, which bypasses RLS, so nothing
-- legitimate needs this.
create policy "incentive batches: admin update"
  on public.incentive_batches for update to authenticated
  using (app.is_admin(academy_id) and status = 'draft')
  with check (app.is_admin(academy_id) and status = 'draft');
create policy "incentive batches: admin delete"
  on public.incentive_batches for delete to authenticated
  using (app.is_admin(academy_id) and status = 'draft');

create trigger set_updated_at
  before update on public.incentive_batches
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- One transfer to one student. The row IS the Billplz `reference_id` — the
-- callback comes back carrying this id, so there is no separate reference
-- column to keep in step.
-- ---------------------------------------------------------------------------
create table if not exists public.incentive_payouts (
  id                       uuid primary key default gen_random_uuid(),
  batch_id                 uuid not null references public.incentive_batches(id) on delete cascade,
  academy_id               uuid not null references public.academies(id) on delete cascade,
  student_id               uuid not null,
  amount_sen               integer not null,
  -- Snapshot: where the money actually went, even if the student edits later.
  bank_code                text not null,
  bank_account_number      text not null,
  account_holder_name      text not null,
  status                   public.incentive_payout_status not null default 'pending',
  billplz_payment_order_id text unique,
  provider_status          text,
  failure_reason           text,
  sent_at                  timestamptz,
  completed_at             timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  constraint incentive_payouts_amount_check check (amount_sen > 0),
  constraint incentive_payouts_batch_id_student_id_key unique (batch_id, student_id),
  -- restrict, not cascade: deleting a student must not silently erase the
  -- record that they were paid.
  constraint incentive_payouts_academy_id_student_id_fkey
    foreign key (academy_id, student_id)
    references public.students (academy_id, id) on delete restrict
);

create index if not exists incentive_payouts_batch_id_status_idx
  on public.incentive_payouts (batch_id, status);
create index if not exists incentive_payouts_student_id_idx
  on public.incentive_payouts (student_id);
create index if not exists incentive_payouts_academy_id_idx
  on public.incentive_payouts (academy_id);

alter table public.incentive_payouts enable row level security;

create policy "incentive payouts: admin read, student read own"
  on public.incentive_payouts for select to authenticated
  using (app.is_admin(academy_id) or app.owns_student(student_id));

-- No client DML policy at all, the same standing as assessment_questions and
-- appointments. set_incentive_recipients mints the rows; the edge functions
-- move them under the service role.

create trigger set_updated_at
  before update on public.incentive_payouts
  for each row execute function app.set_updated_at();

comment on table public.incentive_payouts is
  'One transfer to one student. Clients may read only; the row id is the Billplz reference_id.';

-- ---------------------------------------------------------------------------
-- RPC: store / replace an academy's Billplz keys (admin only).
--   Both keys go into Vault under stable per-academy names; only the masked
--   last-4 of the secret key and the flags are persisted in public. Called by
--   `billplz-connect` with the caller's JWT, so app.is_admin is enforced
--   against the real admin (defense in depth).
-- ---------------------------------------------------------------------------
create or replace function public.set_billplz_credentials(
  _academy uuid,
  _secret text,
  _xsign text,
  _is_sandbox boolean,
  _enabled boolean
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  _sname text := 'billplz_secret:' || _academy::text;
  _xname text := 'billplz_xsign:'  || _academy::text;
  _sid   uuid;
  _last4 text;
begin
  if not app.is_admin(_academy) then
    raise exception 'Not authorized';
  end if;
  if _secret is null or length(btrim(_secret)) < 8 then
    raise exception 'A valid Billplz API secret key is required';
  end if;
  if _xsign is null or length(btrim(_xsign)) < 8 then
    raise exception 'A valid Billplz X signature key is required';
  end if;
  _last4 := right(_secret, 4);

  -- create_secret errors on a duplicate name, so update in place when present.
  select id into _sid from vault.secrets where name = _sname;
  if _sid is null then
    perform vault.create_secret(_secret, _sname, 'Billplz API secret key');
  else
    perform vault.update_secret(_sid, _secret, _sname, 'Billplz API secret key');
  end if;

  select id into _sid from vault.secrets where name = _xname;
  if _sid is null then
    perform vault.create_secret(_xsign, _xname, 'Billplz X signature key');
  else
    perform vault.update_secret(_sid, _xsign, _xname, 'Billplz X signature key');
  end if;

  insert into public.academy_payment_settings as aps (
    academy_id, billplz_is_sandbox, billplz_enabled,
    billplz_has_secret, billplz_secret_last4, billplz_secret_set_at, billplz_secret_set_by
  )
  values (
    _academy, coalesce(_is_sandbox, true), coalesce(_enabled, false),
    true, _last4, now(), (select auth.uid())
  )
  on conflict (academy_id) do update set
    billplz_is_sandbox    = excluded.billplz_is_sandbox,
    billplz_enabled       = excluded.billplz_enabled,
    billplz_has_secret    = true,
    billplz_secret_last4  = excluded.billplz_secret_last4,
    billplz_secret_set_at = now(),
    billplz_secret_set_by = (select auth.uid());

  return json_build_object(
    'has_secret', true,
    'last4', _last4,
    'is_sandbox', coalesce(_is_sandbox, true),
    'enabled', coalesce(_enabled, false)
  );
end;
$$;
revoke execute on function public.set_billplz_credentials(uuid, text, text, boolean, boolean) from public, anon;
grant  execute on function public.set_billplz_credentials(uuid, text, text, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: forget an academy's Billplz keys. Deletes both Vault secrets and clears
--   the metadata so disbursement turns off. Admin only.
-- ---------------------------------------------------------------------------
create or replace function public.remove_billplz_credentials(_academy uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.is_admin(_academy) then
    raise exception 'Not authorized';
  end if;

  delete from vault.secrets
   where name in ('billplz_secret:' || _academy::text, 'billplz_xsign:' || _academy::text);

  update public.academy_payment_settings set
    billplz_has_secret    = false,
    billplz_secret_last4  = null,
    billplz_secret_set_at = null,
    billplz_secret_set_by = null,
    billplz_enabled       = false
  where academy_id = _academy;
end;
$$;
revoke execute on function public.remove_billplz_credentials(uuid) from public, anon;
grant  execute on function public.remove_billplz_credentials(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: read an academy's Billplz keys. SERVICE-ROLE ONLY.
--   Postgres grants EXECUTE to PUBLIC by default and anon/authenticated inherit
--   PUBLIC, so this must be REVOKEd from public — not just from authenticated —
--   or any anonymous caller could exfiltrate every academy's disbursement keys.
--   Only edge functions holding the service-role key may call it.
-- ---------------------------------------------------------------------------
create or replace function public.get_billplz_credentials(_academy uuid)
returns json
language sql
security definer
set search_path = ''
stable
as $$
  select json_build_object(
    'secret', (
      select v.decrypted_secret from vault.decrypted_secrets v
      where v.name = 'billplz_secret:' || _academy::text
    ),
    'xsign', (
      select v.decrypted_secret from vault.decrypted_secrets v
      where v.name = 'billplz_xsign:' || _academy::text
    )
  );
$$;
revoke execute on function public.get_billplz_credentials(uuid) from public, anon, authenticated;
grant  execute on function public.get_billplz_credentials(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- RPC: start a batch. A batch is created empty and in draft — picking who is
--   paid is a separate, repeatable act.
-- ---------------------------------------------------------------------------
create or replace function public.create_incentive_batch(
  _academy uuid,
  _title text,
  _description text,
  _amount_sen integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title   text := btrim(coalesce(_title, ''));
  v_sandbox boolean;
  v_id      uuid;
begin
  if not app.is_admin(_academy) then
    raise exception 'Not authorized';
  end if;
  if v_title = '' then
    raise exception 'A title is required';
  end if;
  if _amount_sen is null or _amount_sen <= 0 then
    raise exception 'The amount per student must be more than zero';
  end if;

  -- No settings row reads as sandbox: a batch created before the keys are
  -- connected must not default to moving real money.
  select p.billplz_is_sandbox into v_sandbox
  from public.academy_payment_settings p where p.academy_id = _academy;

  insert into public.incentive_batches (
    academy_id, title, description, amount_sen, is_sandbox, created_by
  ) values (
    _academy, v_title, nullif(btrim(_description), ''), _amount_sen,
    coalesce(v_sandbox, true), (select auth.uid())
  )
  returning id into v_id;

  return v_id;
end;
$$;
revoke execute on function public.create_incentive_batch(uuid, text, text, integer) from public, anon;
grant  execute on function public.create_incentive_batch(uuid, text, text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: set who gets paid. Idempotent — the whole recipient list is replaced,
--   so the picker can be reopened and re-saved until the batch is sent.
--
--   A student with no bank details is silently skipped rather than refused:
--   the caller ticked 200 boxes and wants the 197 that can be paid, plus a
--   count of the ones that cannot.
-- ---------------------------------------------------------------------------
create or replace function public.set_incentive_recipients(
  _batch uuid,
  _student_ids uuid[]
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch public.incentive_batches;
  v_ids   uuid[] := coalesce(_student_ids, '{}'::uuid[]);
  v_n     integer;
  v_asked bigint;
begin
  select * into v_batch from public.incentive_batches where id = _batch;
  if v_batch.id is null then
    raise exception 'Batch not found';
  end if;
  if not app.is_admin(v_batch.academy_id) then
    raise exception 'Not authorized';
  end if;
  if v_batch.status <> 'draft' then
    raise exception 'This batch has already been sent';
  end if;

  delete from public.incentive_payouts where batch_id = _batch;

  insert into public.incentive_payouts (
    batch_id, academy_id, student_id, amount_sen,
    bank_code, bank_account_number, account_holder_name
  )
  select v_batch.id, v_batch.academy_id, s.id, v_batch.amount_sen,
         b.bank_code, b.bank_account_number, b.account_holder_name
  from public.students s
  join public.student_bank_accounts b on b.student_id = s.id
  where s.academy_id  = v_batch.academy_id
    and s.archived_at is null
    and s.id = any(v_ids);

  get diagnostics v_n = row_count;

  -- distinct: the same id passed twice is one student, not one skipped.
  select count(distinct t.x) into v_asked from unnest(v_ids) as t(x);

  return json_build_object('recipients', v_n, 'skipped', v_asked - v_n);
end;
$$;
revoke execute on function public.set_incentive_recipients(uuid, uuid[]) from public, anon;
grant  execute on function public.set_incentive_recipients(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: drop a batch. Draft only — once a transfer has left, the batch is the
--   record of it and deleting it would delete the audit trail.
-- ---------------------------------------------------------------------------
create or replace function public.delete_incentive_batch(_batch uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch public.incentive_batches;
begin
  select * into v_batch from public.incentive_batches where id = _batch;
  if v_batch.id is null then
    raise exception 'Batch not found';
  end if;
  if not app.is_admin(v_batch.academy_id) then
    raise exception 'Not authorized';
  end if;
  if v_batch.status <> 'draft' then
    raise exception 'Only a draft batch can be deleted';
  end if;

  delete from public.incentive_batches where id = _batch;
end;
$$;
revoke execute on function public.delete_incentive_batch(uuid) from public, anon;
grant  execute on function public.delete_incentive_batch(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: the recipient picker's list. An RPC and not a select because it joins
--   student_bank_accounts, and it must return whether an account is on file
--   without returning the account: a full number is never listed in bulk.
-- ---------------------------------------------------------------------------
create or replace function public.incentive_candidates(
  _academy uuid,
  _course uuid default null
)
returns table (
  student_id     uuid,
  full_name      text,
  student_no     text,
  email          text,
  status         public.student_status,
  has_bank       boolean,
  bank_code      text,
  masked_account text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.is_admin(_academy) then
    raise exception 'Only an academy admin can list incentive candidates';
  end if;

  return query
  select
    s.id,
    s.full_name,
    s.student_no,
    s.email,
    s.status,
    (b.student_id is not null),
    b.bank_code,
    case when b.student_id is not null
      then '••••' || right(b.bank_account_number, 4)
    end
  from public.students s
  left join public.student_bank_accounts b on b.student_id = s.id
  where s.academy_id  = _academy
    and s.archived_at is null
    and (_course is null or exists (
      select 1 from public.enrollments e
      where e.student_id = s.id
        and e.course_id  = _course
        and e.status     = 'active'
    ))
  order by s.full_name nulls last, s.student_no;
end;
$$;
revoke execute on function public.incentive_candidates(uuid, uuid) from public, anon;
grant  execute on function public.incentive_candidates(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Claim the next chunk of a batch for sending.
--
-- One statement, not two. FOR UPDATE SKIP LOCKED picks rows nobody else holds
-- and the same statement marks them 'sending', so two billplz-disburse
-- invocations running at once — the resume loop racing a retry, or an admin
-- clicking twice — get disjoint sets and Billplz never sees the same payout
-- twice. A select followed by an update would be a race, and the thing it
-- races over is money leaving a bank account.
--
-- The rows come back so the caller can post them without a second read.
-- ---------------------------------------------------------------------------
create or replace function app.claim_incentive_payouts(_batch uuid, _limit int)
returns setof public.incentive_payouts
language sql
volatile
security definer
set search_path = ''
as $$
  update public.incentive_payouts p
  set status = 'sending'
  where p.status = 'pending'
    and p.id in (
      select c.id
      from public.incentive_payouts c
      where c.batch_id = _batch
        and c.status   = 'pending'
      order by c.created_at
      limit greatest(1, least(coalesce(_limit, 25), 50))
      for update skip locked
    )
  returning p.*;
$$;
revoke all on function app.claim_incentive_payouts(uuid, int) from public, anon, authenticated;

-- PostgREST exposes only the schemas in its exposed-schemas config (public), so
-- `app` is unreachable over REST — see 20260727120000. billplz-disburse calls
-- this through supabase-js, so the wrapper below is the only door in.
-- Service-role only: claiming a payout is the act of sending money, never a
-- client's to perform.
create or replace function public.claim_incentive_payouts(_batch uuid, _limit int)
returns setof public.incentive_payouts
language sql
volatile
security definer
set search_path = ''
as $$
  select * from app.claim_incentive_payouts(_batch, _limit);
$$;
revoke execute on function public.claim_incentive_payouts(uuid, int) from public, anon, authenticated;
grant  execute on function public.claim_incentive_payouts(uuid, int) to service_role;
