-- ============================================================================
-- Directors: who grants staff access and holds the payment settings
-- ----------------------------------------------------------------------------
-- The owner's rules (2026-10-04):
--
--   1. An admin or a trainer can only be added by a **Director**.
--   2. Only a Director changes the gateway and billing settings: ToyyibPay /
--      Billplz credentials, the academy-wide payment defaults, and the
--      academy's own details that print on every invoice (name, registration,
--      SST, address, logo).
--   3. There can be more than one Director. Hawary Academy has two.
--
-- "Director" used to be a label for `academies.created_by` — one account, no
-- powers of its own. It becomes `academy_members.is_director`: a flag on an
-- admin membership, backfilled from `created_by`, and settable only by the
-- owner in SQL (`guard_member_director` refuses it from any JWT), so a Director
-- cannot mint another Director from the app any more than an admin can.
--
-- Before this migration any admin could grant staff access, and a trainer
-- could too, indirectly:
--
--   * `academy_members` INSERT/UPDATE/DELETE were `app.is_admin` — any admin
--     could make any member an admin or a trainer;
--   * `create_instructor_invitation`, `link_instructor_account` and
--     `unlink_instructor_account` were `app.is_admin`;
--   * `instructors` INSERT was `app.is_staff`, and an unlinked instructor record
--     carrying an email is *claimable* by whoever signs in with that address
--     (`my_pending_invitations` → `accept_pending_invitation`), which makes them
--     a trainer. So creating the record — or changing an unlinked record's email,
--     or un-archiving one — was itself a grant, open to every trainer.
--
-- After it:
--
--   academy_members  the Director writes any row; another admin writes only
--                    `student` rows (suspend/restore a learner), and cannot
--                    promote one, because WITH CHECK sees the new role.
--   instructors      INSERT and DELETE are Director-only. UPDATE stays
--                    `is_staff` (bookable / report-checker flags, contact
--                    details), but `guard_instructor_grant` refuses the three
--                    columns that grant or revoke access — `user_id`, an unlinked
--                    record's `email`, and `archived_at` — unless the caller is
--                    the Director.
--   the three RPCs   Director-only.
--
-- Removal is gated the same way as granting: suspending a trainer, unlinking an
-- instructor or archiving one changes who has staff access, and "only the
-- Director adds staff" is hollow if any admin can take the Director's staff
-- away.
--
-- What is deliberately NOT gated: SECURITY DEFINER paths run as the table owner
-- and bypass RLS, so `link_claimed_record` (accepting an invitation the Director
-- issued, or self-claiming a record the Director created) still works for the
-- claimant. The trigger lets exactly that through: an unlinked record becoming
-- the caller's own. Requests with no JWT (service role, SQL) are the owner's.
--
-- `app.is_staff` is untouched — dozens of teaching policies rest on it.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- The flag, the backfill, and its guard.
-- ----------------------------------------------------------------------------
alter table public.academy_members
  add column if not exists is_director boolean not null default false;

comment on column public.academy_members.is_director is
  'A Director: grants and revokes staff access, and owns the gateway/billing settings. Meaningful only on an active admin membership. Set by the owner in SQL; no JWT can change it.';

-- Every academy's founder, plus — for Hawary Academy — Lokman, at the owner's
-- request.
update public.academy_members m
  set is_director = true
  from public.academies a
  where a.id = m.academy_id and a.created_by = m.user_id and m.role = 'admin';

-- Loud on purpose: a typo in the address would otherwise match nobody and
-- leave the academy with one Director instead of two, silently.
do $$
declare
  n int;
begin
  update public.academy_members m
    set is_director = true
    from auth.users u
    where u.id = m.user_id
      and lower(u.email) = 'muhamadlokman92@gmail.com'
      and m.academy_id = '9c5fd727-65cd-4657-ab4d-fe52fa93d8b7'
      and m.role = 'admin'
      and m.status = 'active';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'expected one active admin membership for muhamadlokman92@gmail.com in Hawary Academy, updated %', n;
  end if;
end $$;

create or replace function app.guard_member_director()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if (select auth.uid()) is null then return new; end if;
  if tg_op = 'INSERT' and new.is_director then
    raise exception 'Directors are appointed by the owner, not through the app';
  end if;
  if tg_op = 'UPDATE' and new.is_director is distinct from old.is_director then
    raise exception 'Directors are appointed by the owner, not through the app';
  end if;
  return new;
end;
$function$;

drop trigger if exists guard_member_director on public.academy_members;
create trigger guard_member_director
  before insert or update on public.academy_members
  for each row execute function app.guard_member_director();

-- ----------------------------------------------------------------------------
-- The helper. An *active admin* membership is required as well as the flag, so
-- suspending or demoting a Director suspends the power with it.
-- ----------------------------------------------------------------------------
create or replace function app.is_director(_academy_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from public.academy_members m
    where m.academy_id = _academy_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role = 'admin'
      and m.is_director
  );
$function$;

comment on function app.is_director(uuid) is
  'Caller is a Director of the academy (academy_members.is_director on an active admin membership). Grants/revokes staff access; owns gateway and billing settings.';

-- ----------------------------------------------------------------------------
-- academy_members
-- ----------------------------------------------------------------------------
drop policy if exists "members: admins can add" on public.academy_members;
drop policy if exists "members: admins can update" on public.academy_members;
drop policy if exists "members: admins can remove" on public.academy_members;

create policy "members: director any, admins students" on public.academy_members
  for insert to authenticated
  with check (
    app.is_director(academy_id)
    or (app.is_admin(academy_id) and role = 'student')
  );

create policy "members: director any, admins students (update)" on public.academy_members
  for update to authenticated
  using (
    app.is_director(academy_id)
    or (app.is_admin(academy_id) and role = 'student')
  )
  with check (
    app.is_director(academy_id)
    or (app.is_admin(academy_id) and role = 'student')
  );

create policy "members: director any, admins students (delete)" on public.academy_members
  for delete to authenticated
  using (
    app.is_director(academy_id)
    or (app.is_admin(academy_id) and role = 'student')
  );

-- ----------------------------------------------------------------------------
-- instructors
-- ----------------------------------------------------------------------------
drop policy if exists "instructors: staff insert" on public.instructors;
drop policy if exists "instructors: admins delete" on public.instructors;

create policy "instructors: director insert" on public.instructors
  for insert to authenticated
  with check (app.is_director(academy_id));

create policy "instructors: director delete" on public.instructors
  for delete to authenticated
  using (app.is_director(academy_id));

create or replace function app.guard_instructor_grant()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  caller uuid := (select auth.uid());
begin
  -- No JWT: the service role or SQL, i.e. the owner.
  if caller is null or app.is_director(new.academy_id) then
    return new;
  end if;

  if new.user_id is distinct from old.user_id then
    -- Claiming: an unlinked record becoming the caller's own. Only reachable
    -- through link_claimed_record (RLS refuses a direct update by a
    -- non-member), which checks the confirmed email or the token.
    if old.user_id is null and new.user_id = caller then
      null;
    -- Releasing one's own ARCHIVED record so a fresh one can be claimed — see
    -- 20261004100100_archived_record_releases_login.
    elsif old.user_id = caller and new.user_id is null and old.archived_at is not null then
      null;
    else
      raise exception 'Only the Director can link or unlink an instructor account';
    end if;
  end if;

  -- The email of an unlinked record is the key it is claimed by.
  if new.user_id is null and new.email is distinct from old.email then
    raise exception 'Only the Director can change the email of an instructor without an account';
  end if;

  if new.archived_at is distinct from old.archived_at then
    raise exception 'Only the Director can archive or restore an instructor';
  end if;

  return new;
end;
$function$;

drop trigger if exists guard_instructor_grant on public.instructors;
create trigger guard_instructor_grant
  before update on public.instructors
  for each row execute function app.guard_instructor_grant();

-- ----------------------------------------------------------------------------
-- The three RPCs: identical bodies, `is_admin` → `is_director`.
-- ----------------------------------------------------------------------------
create or replace function public.create_instructor_invitation(_instructor_id uuid)
returns json
language plpgsql
security definer
set search_path to ''
as $function$
declare
  ins       public.instructors;
  new_token text;
  inv_id    uuid;
begin
  select * into ins from public.instructors where id = _instructor_id;
  if not found then raise exception 'Instructor not found'; end if;
  if not app.is_director(ins.academy_id) then
    raise exception 'Only the Director can invite an instructor';
  end if;
  if ins.archived_at is not null then
    raise exception 'This instructor record is archived';
  end if;
  if ins.email is null or ins.email = '' then
    raise exception 'This instructor has no email to invite';
  end if;
  if ins.user_id is not null then
    raise exception 'This instructor already has a linked account';
  end if;

  new_token := encode(extensions.gen_random_bytes(24), 'hex');

  update public.academy_invitations
    set status = 'revoked'
    where instructor_id = _instructor_id and status = 'pending';

  insert into public.academy_invitations (academy_id, instructor_id, email, role, token, invited_by)
    values (ins.academy_id, ins.id, ins.email, 'trainer', new_token, (select auth.uid()))
    returning id into inv_id;

  return json_build_object('id', inv_id, 'token', new_token);
end;
$function$;

create or replace function public.link_instructor_account(_instructor_id uuid, _email text)
returns json
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_instructor public.instructors;
  v_user       uuid;
begin
  select * into v_instructor from public.instructors where id = _instructor_id;
  if not found then raise exception 'Instructor not found'; end if;
  if not app.is_director(v_instructor.academy_id) then
    raise exception 'Only the Director can link instructor accounts';
  end if;
  if v_instructor.archived_at is not null then
    raise exception 'This instructor record is archived';
  end if;

  select id into v_user from auth.users where lower(email) = lower(_email);
  if v_user is null then raise exception 'No account exists for %', _email; end if;

  update public.instructors set user_id = v_user
    where id = _instructor_id and (user_id is null or user_id = v_user);
  if not found then
    raise exception 'This instructor record is already linked to another account';
  end if;

  insert into public.academy_members (academy_id, user_id, role, status)
    values (v_instructor.academy_id, v_user, 'trainer', 'active')
    on conflict (academy_id, user_id) do update
      set role = case
        when public.academy_members.role = 'admin' then 'admin'::app.user_role
        else 'trainer'::app.user_role
      end,
      status = case
        when public.academy_members.status = 'suspended' then public.academy_members.status
        else 'active'::public.member_status
      end;

  return json_build_object('instructor_id', _instructor_id, 'user_id', v_user);
end;
$function$;

create or replace function public.unlink_instructor_account(_instructor_id uuid)
returns json
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_instructor public.instructors;
begin
  select * into v_instructor
  from public.instructors
  where id = _instructor_id;

  if not found then
    raise exception 'Instructor not found';
  end if;

  if not app.is_director(v_instructor.academy_id) then
    raise exception 'Only the Director can unlink instructor accounts';
  end if;

  update public.instructors
    set user_id = null
    where id = _instructor_id;

  return json_build_object('instructor_id', _instructor_id);
end;
$function$;

-- ============================================================================
-- Gateway and billing settings are the Directors'
-- ----------------------------------------------------------------------------
-- Every admin keeps the day-to-day money work — invoices, recording payments,
-- pay links, incentives — and can still READ the settings (the money screens
-- need `toyyibpay_enabled` and the defaults). What moves is the authority to
-- change where the money goes and what the invoice says about the academy.
-- ============================================================================

drop policy if exists "payment_settings: admin insert" on public.academy_payment_settings;
drop policy if exists "payment_settings: admin update" on public.academy_payment_settings;
drop policy if exists "payment_settings: admin delete" on public.academy_payment_settings;

create policy "payment_settings: director insert" on public.academy_payment_settings
  for insert to authenticated
  with check (app.is_director(academy_id));

create policy "payment_settings: director update" on public.academy_payment_settings
  for update to authenticated
  using (app.is_director(academy_id))
  with check (app.is_director(academy_id));

create policy "payment_settings: director delete" on public.academy_payment_settings
  for delete to authenticated
  using (app.is_director(academy_id));

-- The academy row IS the invoice letterhead: name, registration, SST, address,
-- logo. (INSERT and DELETE were closed by 20261004090000_single_owner.)
drop policy if exists "academies: admins can update" on public.academies;

create policy "academies: directors can update" on public.academies
  for update to authenticated
  using (app.is_director(id))
  with check (app.is_director(id));

-- And only the letterhead. `slug` is the public /enroll link already handed to
-- students, `created_by`/`status`/`timezone`/`currency` are the owner's — none
-- of them is editable in the app, so none of them should be through PostgREST.
revoke update on public.academies from anon, authenticated;
grant update (
  name, registration_no, email, phone, address, city, state, postcode,
  sst_registered, sst_number, logo_url
) on public.academies to authenticated;

-- The four credential RPCs: same bodies, one guard swapped. Rewritten from the
-- live definition rather than retyped, so the Vault handling cannot drift; the
-- assertion makes a changed body fail loudly instead of silently staying open.
do $$
declare
  f   text;
  def text;
begin
  foreach f in array array[
    'public.set_toyyibpay_credentials(uuid, text, text, boolean, boolean)',
    'public.remove_toyyibpay_credentials(uuid)',
    'public.set_billplz_credentials(uuid, text, text, boolean, boolean)',
    'public.remove_billplz_credentials(uuid)'
  ] loop
    def := pg_get_functiondef(f::regprocedure);
    if position('app.is_admin(_academy)' in def) = 0 then
      raise exception 'expected an app.is_admin(_academy) guard in %', f;
    end if;
    execute replace(def, 'app.is_admin(_academy)', 'app.is_director(_academy)');
  end loop;
end $$;

-- ============================================================================
-- The roster reports Directors, not the founder
-- ----------------------------------------------------------------------------
-- `list_academy_staff` derived its "Director" column from `academies.created_by`.
-- The column is renamed to what it now means, so the function is dropped and
-- recreated (a RETURNS TABLE change cannot be replaced in place) and its grants
-- re-issued. Same rows, same order, otherwise.
-- ============================================================================
drop function if exists public.list_academy_staff(uuid);

create function public.list_academy_staff(_academy_id uuid)
returns table (
  user_id uuid, role app.user_role, status public.member_status,
  joined_at timestamp with time zone, full_name text, email text, phone text,
  avatar_url text, is_director boolean, instructor_id uuid, instructor_no text,
  instructor_status public.instructor_status, courses_taught bigint,
  student_id uuid, student_no text
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if not app.is_admin(_academy_id) then
    raise exception 'Only an academy admin can list members';
  end if;

  return query
  select
    m.user_id,
    m.role,
    m.status,
    m.joined_at,
    p.full_name,
    u.email::text,
    coalesce(p.phone, i.phone),
    p.avatar_url,
    (m.is_director and m.role = 'admin'),
    i.id,
    i.instructor_no,
    i.status,
    coalesce(ci.n, 0),
    s.id,
    s.student_no
  from public.academy_members m
    left join public.profiles p on p.id = m.user_id
    left join auth.users u on u.id = m.user_id
    left join public.instructors i
      on i.academy_id = m.academy_id
     and i.user_id = m.user_id
     and i.archived_at is null
    left join public.students s
      on s.academy_id = m.academy_id
     and s.user_id = m.user_id
     and s.archived_at is null
    left join lateral (
      select count(*) as n
      from public.course_instructors c
      where c.instructor_id = i.id
    ) ci on true
  where m.academy_id = _academy_id
    and m.role in ('admin', 'trainer')
  order by
    (m.is_director and m.role = 'admin') desc,
    m.role,
    p.full_name nulls last,
    m.joined_at;
end;
$function$;

revoke all on function public.list_academy_staff(uuid) from public, anon;
grant execute on function public.list_academy_staff(uuid) to authenticated, service_role;

-- ============================================================================
-- A trainer invitation is the Directors' to resend or revoke
-- ----------------------------------------------------------------------------
-- Student invitations stay with all staff. Resending revives an expired
-- trainer token, so it is a grant, and revoking one is a removal.
-- ============================================================================
do $$
declare
  f   text;
  def text;
  old constant text := 'if not app.is_staff(inv.academy_id) then raise exception ''Not authorized''; end if;';
  new constant text := old || E'\n  if inv.instructor_id is not null and not app.is_director(inv.academy_id) then\n    raise exception ''Only a Director can manage an instructor invitation'';\n  end if;';
begin
  foreach f in array array[
    'public.resend_invitation(uuid)',
    'public.revoke_invitation(uuid)'
  ] loop
    def := pg_get_functiondef(f::regprocedure);
    if position(old in def) = 0 then
      raise exception 'expected the is_staff guard in %', f;
    end if;
    execute replace(def, old, new);
  end loop;
end $$;
