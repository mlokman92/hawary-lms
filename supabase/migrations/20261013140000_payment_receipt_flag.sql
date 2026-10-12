-- Flagging a bank transfer receipt.
--
-- A Director who opens a receipt and finds it does not match what was typed —
-- the date on it is not the payment's date, or the amount is not the payment's
-- amount — flags it, saying which. A flagged transfer is the admins' list of
-- things to put right; once it is right the Director marks it checked.
--
-- So a bank transfer is in exactly one of four places: **pending** (no
-- receipt), **uploaded** (a receipt nobody has ruled on), **flagged** and
-- **checked** (`confirmed_*`, the name the columns were built under).
--
-- Like checking, a flag is about the paperwork and moves no money.

-- ---------------------------------------------------------------------------
-- 1. What is wrong, who said so, and when.
--
--    An array rather than two booleans: it is "and/or", and the next reason is
--    then a value in a list, not a column. Empty is "not flagged" — one
--    representation, so every filter is a test of the array.
--
--    Flagged and checked exclude each other, and the table says so.
-- ---------------------------------------------------------------------------
alter table public.payment_receipts
  add column if not exists flag_reasons    text[] not null default '{}',
  add column if not exists flagged_at      timestamptz,
  add column if not exists flagged_by      uuid references auth.users(id) on delete set null,
  add column if not exists flagged_by_name text;

alter table public.payment_receipts
  add constraint payment_receipts_flag_reasons_known
    check (flag_reasons <@ array['wrong_date', 'wrong_amount']::text[]),
  add constraint payment_receipts_flagged_or_checked
    check (confirmed_at is null or flag_reasons = '{}'::text[]);

comment on column public.payment_receipts.flag_reasons is
  'What a Director found wrong: wrong_date and/or wrong_amount. Empty is not flagged. Written only by flag_payment_receipt; cleared when the receipt is checked or the file replaced.';

-- ---------------------------------------------------------------------------
-- 2. A replaced receipt is a different document — for a flag as for a check.
-- ---------------------------------------------------------------------------
create or replace function app.reset_receipt_confirmation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.file_path is distinct from old.file_path then
    new.confirmed_at := null;
    new.confirmed_by := null;
    new.confirmed_by_name := null;
    new.flag_reasons := '{}'::text[];
    new.flagged_at := null;
    new.flagged_by := null;
    new.flagged_by_name := null;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Flag, and un-flag.
--
--    Directors only, on the same terms as `confirm_payment_receipt`. The whole
--    set of reasons is passed each time: the control is two tick boxes, and
--    "what is ticked now" cannot go wrong the way "add this one" can when two
--    people have the receipt open. An empty set takes the flag off.
--
--    Flagging a checked receipt takes the check off — it cannot be both.
-- ---------------------------------------------------------------------------
create or replace function public.flag_payment_receipt(
  _payment uuid,
  _reasons text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  _uid uuid := (select auth.uid());
  _academy uuid;
  _clean text[];
begin
  select r.academy_id into _academy
    from public.payment_receipts r
   where r.payment_id = _payment;

  if _academy is null or not app.is_director(_academy) then
    raise exception 'No such receipt';
  end if;

  select coalesce(array_agg(distinct x order by x), '{}'::text[])
    into _clean
    from unnest(coalesce(_reasons, '{}'::text[])) as x;

  if not (_clean <@ array['wrong_date', 'wrong_amount']::text[]) then
    raise exception 'Unknown flag reason';
  end if;

  if _clean = '{}'::text[] then
    update public.payment_receipts r
       set flag_reasons = '{}'::text[],
           flagged_at = null,
           flagged_by = null,
           flagged_by_name = null
     where r.payment_id = _payment;
  else
    update public.payment_receipts r
       set flag_reasons = _clean,
           flagged_at = now(),
           flagged_by = _uid,
           flagged_by_name = coalesce(
             (select nullif(btrim(pf.full_name), '')
                from public.profiles pf where pf.id = _uid),
             (select auth.jwt() ->> 'email')),
           confirmed_at = null,
           confirmed_by = null,
           confirmed_by_name = null
     where r.payment_id = _payment;
  end if;
end;
$$;

comment on function public.flag_payment_receipt(uuid, text[]) is
  'Set what is wrong with a bank transfer receipt (wrong_date, wrong_amount); an empty array takes the flag off. Directors of the receipt''s academy only.';

revoke all on function public.flag_payment_receipt(uuid, text[]) from public, anon;
grant execute on function public.flag_payment_receipt(uuid, text[]) to authenticated;

-- Checking a flagged receipt is how a flag is settled, so it takes the flag off.
create or replace function public.confirm_payment_receipt(_payment uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  _uid uuid := (select auth.uid());
  _academy uuid;
begin
  select r.academy_id into _academy
    from public.payment_receipts r
   where r.payment_id = _payment;

  if _academy is null or not app.is_director(_academy) then
    raise exception 'No such receipt';
  end if;

  update public.payment_receipts r
     set confirmed_at = now(),
         confirmed_by = _uid,
         confirmed_by_name = coalesce(
           (select nullif(btrim(pf.full_name), '')
              from public.profiles pf where pf.id = _uid),
           (select auth.jwt() ->> 'email')),
         flag_reasons = '{}'::text[],
         flagged_at = null,
         flagged_by = null,
         flagged_by_name = null
   where r.payment_id = _payment
     and r.confirmed_at is null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. The page and its counts, with the fourth state.
--
--    `_state` is 'pending', 'uploaded', 'flagged', 'confirmed' or NULL for all
--    four. 'uploaded' is now a receipt that is neither flagged nor checked, so
--    the four are slices.
--
--    Both return more columns than the versions of an hour ago, which CREATE
--    OR REPLACE cannot change — so those are renamed out of the way (`_v1`)
--    and these take the names. Nothing deployed calls the `_v1` pair.
-- ---------------------------------------------------------------------------
alter function public.receipt_queue_page(uuid, text, text, int, int)
  rename to receipt_queue_page_v1;
alter function public.receipt_queue_counts(uuid, text)
  rename to receipt_queue_counts_v1;

create function public.receipt_queue_page(
  _academy uuid,
  _state text default null,
  _search text default null,
  _limit int default 50,
  _offset int default 0
)
returns table (
  id uuid,
  amount_sen int,
  paid_at timestamptz,
  created_at timestamptz,
  note text,
  invoice_id uuid,
  invoice_no text,
  course_title text,
  student_id uuid,
  student_full_name text,
  student_no text,
  recorded_by_name text,
  receipt_file_name text,
  receipt_mime_type text,
  receipt_uploaded_at timestamptz,
  receipt_uploaded_by_name text,
  receipt_confirmed_at timestamptz,
  receipt_confirmed_by_name text,
  receipt_flag_reasons text[],
  receipt_flagged_at timestamptz,
  receipt_flagged_by_name text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    p.id,
    p.amount_sen,
    p.paid_at,
    p.created_at,
    p.note,
    p.invoice_id,
    i.invoice_no,
    c.title,
    p.student_id,
    s.full_name,
    s.student_no,
    pr.full_name,
    r.file_name,
    r.mime_type,
    r.created_at,
    r.uploaded_by_name,
    r.confirmed_at,
    r.confirmed_by_name,
    r.flag_reasons,
    r.flagged_at,
    r.flagged_by_name
  from public.payments p
  left join public.payment_receipts r on r.payment_id = p.id
  left join public.invoices i on i.id = p.invoice_id
  left join public.courses c on c.id = i.course_id
  left join public.students s on s.id = p.student_id
  left join public.profiles pr on pr.id = p.created_by
  where p.academy_id = _academy
    and app.is_admin(_academy)
    and p.method = 'bank_transfer'
    and p.status = 'succeeded'
    and case _state
          when 'pending' then r.payment_id is null
          when 'uploaded' then r.payment_id is not null
                               and r.confirmed_at is null
                               and cardinality(r.flag_reasons) = 0
          when 'flagged' then cardinality(r.flag_reasons) > 0
          when 'confirmed' then r.confirmed_at is not null
          else true
        end
    and (
      _search is null
      or btrim(_search) = ''
      or position(
           lower(btrim(_search))
           in lower(concat_ws(' ',
             s.full_name, s.student_no, i.invoice_no,
             c.title, pr.full_name, p.note))
         ) > 0
      -- A phone number, compared digits to digits: see app.phone_needle.
      or (
        app.phone_needle(_search) is not null
        and position(
              app.phone_needle(_search)
              in regexp_replace(coalesce(s.phone, ''), '\D', '', 'g')
            ) > 0
      )
    )
  -- `id` last: OFFSET paging over a non-unique sort repeats one row and skips
  -- another.
  order by p.created_at desc, p.id desc
  limit greatest(1, least(coalesce(_limit, 50), 200))
  offset greatest(0, coalesce(_offset, 0));
$$;

comment on function public.receipt_queue_page(uuid, text, text, int, int)
  is 'One page of succeeded bank-transfer payments with their receipt, if any. _state: pending | uploaded | flagged | confirmed | NULL for all. Admin only.';

create function public.receipt_queue_counts(
  _academy uuid,
  _search text default null
)
returns table (
  pending_count bigint,
  pending_sen bigint,
  uploaded_count bigint,
  uploaded_sen bigint,
  confirmed_count bigint,
  confirmed_sen bigint,
  flagged_count bigint,
  flagged_sen bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    count(*) filter (where r.payment_id is null),
    coalesce(sum(p.amount_sen) filter (where r.payment_id is null), 0),
    count(*) filter (
      where r.payment_id is not null
        and r.confirmed_at is null
        and cardinality(r.flag_reasons) = 0),
    coalesce(sum(p.amount_sen) filter (
      where r.payment_id is not null
        and r.confirmed_at is null
        and cardinality(r.flag_reasons) = 0), 0),
    count(*) filter (where r.confirmed_at is not null),
    coalesce(sum(p.amount_sen) filter (where r.confirmed_at is not null), 0),
    count(*) filter (where cardinality(r.flag_reasons) > 0),
    coalesce(sum(p.amount_sen) filter (
      where cardinality(r.flag_reasons) > 0), 0)
  from public.payments p
  left join public.payment_receipts r on r.payment_id = p.id
  left join public.invoices i on i.id = p.invoice_id
  left join public.courses c on c.id = i.course_id
  left join public.students s on s.id = p.student_id
  left join public.profiles pr on pr.id = p.created_by
  where p.academy_id = _academy
    and app.is_admin(_academy)
    and p.method = 'bank_transfer'
    and p.status = 'succeeded'
    and (
      _search is null
      or btrim(_search) = ''
      or position(
           lower(btrim(_search))
           in lower(concat_ws(' ',
             s.full_name, s.student_no, i.invoice_no,
             c.title, pr.full_name, p.note))
         ) > 0
      -- A phone number, compared digits to digits: see app.phone_needle.
      or (
        app.phone_needle(_search) is not null
        and position(
              app.phone_needle(_search)
              in regexp_replace(coalesce(s.phone, ''), '\D', '', 'g')
            ) > 0
      )
    );
$$;

comment on function public.receipt_queue_counts(uuid, text)
  is 'Pending, uploaded, flagged and confirmed counts and amounts for receipt_queue_page. Keep the WHERE clause identical to that function, minus _state.';

revoke all on function public.receipt_queue_page(uuid, text, text, int, int) from public, anon;
revoke all on function public.receipt_queue_counts(uuid, text) from public, anon;
grant execute on function public.receipt_queue_page(uuid, text, text, int, int) to authenticated;
grant execute on function public.receipt_queue_counts(uuid, text) to authenticated;
