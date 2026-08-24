-- Nobody stays "Unnamed" once an account is attached to their record.
--
-- A student record minted by the invite dialog carries an email and nothing
-- else (InviteStudentDialog asks for exactly one field), and attaching an
-- account only ever wrote `user_id`. So the record stayed nameless for ever
-- even though the account that had just proved it owns that email carried a
-- name on its profile: the name existed, it simply never crossed the gap.
--
-- The fill hangs off `user_id` on the record, NOT off the claim RPCs. Five
-- functions attach an account -- accept_invitation, accept_pending_invitation
-- and join_academy go through app.link_claimed_record, but link_student_account
-- and link_instructor_account each run their own UPDATE and never call it --
-- and on top of those the `students: staff update` / `instructors: staff
-- update` policies put no column restriction on user_id, so a plain PostgREST
-- write is a link too. A BEFORE trigger on the column is the only place that
-- covers all seven, including whatever is written next. app.link_claimed_record
-- is deliberately left untouched: lib/invite.ts is coupled to its failures.
--
-- Name only. Phone looks like the same problem and is not: 27 linked pairs
-- already disagree about it, and create-bill sets ToyyibPay's `billPayorInfo`
-- when payer name + email + phone are all present, which locks those fields on
-- the FPX page -- so backfilling a stale self-service phone would silently take
-- away the payer's ability to correct it. That is a separate decision.

create or replace function app.fill_record_identity()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_name text;
begin
  if new.user_id is not null and coalesce(btrim(new.full_name), '') = '' then
    select nullif(btrim(p.full_name), '')
      into v_name
      from public.profiles p
      where p.id = new.user_id;
    if v_name is not null then
      new.full_name := v_name;
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists fill_record_identity on public.students;
create trigger fill_record_identity
  before insert or update of user_id on public.students
  for each row execute function app.fill_record_identity();

drop trigger if exists fill_record_identity on public.instructors;
create trigger fill_record_identity
  before insert or update of user_id on public.instructors
  for each row execute function app.fill_record_identity();

-- Attaching the account is not the only moment a name can arrive: somebody can
-- join with a blank profile and fill it in later on /profile, and the record
-- they already claimed would keep its blank for ever. Fills blanks only, so it
-- is a backfill and never a rename -- a name staff typed outranks a
-- self-service profile, and a later rename must not retitle someone's record in
-- another academy. Scoped to `user_id`, never to a matching email: guessing at
-- a record nobody has claimed is a different decision, and a worse one.
--
-- UPDATE only, and only on a real change. There is no INSERT branch because
-- students.user_id references profiles(id), so at profile-insert time there are
-- provably zero linked rows to fill -- and app.handle_new_user runs inside
-- GoTrue's own auth.users transaction, where anything raised here would fail
-- account creation. The WHEN clause matters for the same reason `UPDATE OF`
-- alone is not enough: it fires on assignment, not on change, and
-- useUpdateMyProfile writes full_name on every save.
create or replace function app.sync_profile_identity()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  update public.students
    set full_name = btrim(new.full_name)
    where user_id = new.id and coalesce(btrim(full_name), '') = '';

  update public.instructors
    set full_name = btrim(new.full_name)
    where user_id = new.id and coalesce(btrim(full_name), '') = '';

  return null;
end;
$function$;

drop trigger if exists sync_profile_identity on public.profiles;
create trigger sync_profile_identity
  after update of full_name on public.profiles
  for each row
  when (new.full_name is distinct from old.full_name
        and coalesce(btrim(new.full_name), '') <> '')
  execute function app.sync_profile_identity();

-- join_academy is the one insert path that writes a name, and it wrote the
-- profile's value raw. A whitespace-only name is worse than a null one: it is
-- not blank to `?? t('unnamed')`, so it renders as nothing at all.
create or replace function public.join_academy(_slug text, _course_id uuid)
 returns json
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_uid       uuid := (select auth.uid());
  v_academy   uuid;
  v_open      boolean;
  v_student   uuid;
  v_verified  text;
  v_name      text;
  v_phone     text;
  v_email     text;
  v_enrolment uuid;
  v_status    public.enrollment_status;
begin
  if v_uid is null then raise exception 'You must be signed in to join'; end if;

  select a.id, coalesce(s.is_open, false)
    into v_academy, v_open
  from public.academies a
  left join public.academy_enrollment_settings s on s.academy_id = a.id
  where lower(a.slug) = lower(btrim(_slug)) and a.status = 'active';

  if v_academy is null or not v_open then
    raise exception 'This academy is not open for enrolment';
  end if;

  -- Staff are already inside; joining as a student would hand
  -- link_claimed_record a membership to reconcile for no reason.
  if app.is_staff(v_academy) then
    raise exception 'You are already staff of this academy';
  end if;

  if not exists (
    select 1 from public.courses c
    where c.id = _course_id and c.academy_id = v_academy
  ) or not app.enrollment_open(_course_id) then
    raise exception 'That course is not open for enrolment';
  end if;

  select lower(u.email) into v_email from auth.users u where u.id = v_uid;
  select lower(u.email) into v_verified
    from auth.users u where u.id = v_uid and u.email_confirmed_at is not null;
  select nullif(btrim(p.full_name), ''), nullif(btrim(p.phone), '')
    into v_name, v_phone
    from public.profiles p where p.id = v_uid;

  -- 1. Already have a record here.
  select s.id into v_student
  from public.students s
  where s.academy_id = v_academy and s.user_id = v_uid and s.archived_at is null;

  -- 2. Otherwise adopt an unlinked record carrying the caller's CONFIRMED email.
  --    Same standard my_pending_invitations holds: without a token, a verified
  --    email is the entire proof of identity. It is also what stops a
  --    CSV-imported student who then uses the public link becoming a duplicate.
  if v_student is null and v_verified is not null then
    select s.id into v_student
    from public.students s
    where s.academy_id = v_academy
      and s.user_id is null
      and s.archived_at is null
      and lower(s.email) = v_verified
    order by s.created_at
    limit 1;
  end if;

  -- 3. Otherwise a fresh record, from the profile they already filled in.
  if v_student is null then
    insert into public.students (academy_id, student_no, full_name, phone, email, status)
      values (v_academy, '', v_name, v_phone, v_email, 'active')
      returning id into v_student;
  end if;

  -- Links the record to the account and upserts the membership, with the
  -- archived/already-linked guards and the monotonic role ladder.
  perform app.link_claimed_record('student', v_student, v_academy, 'student', v_uid);

  -- 'pending' carries no content access: app.is_enrolled requires 'active'.
  insert into public.enrollments (academy_id, course_id, student_id, status)
    values (v_academy, _course_id, v_student, 'pending')
    on conflict (course_id, student_id) do nothing;

  select e.id, e.status into v_enrolment, v_status
  from public.enrollments e
  where e.course_id = _course_id and e.student_id = v_student;

  return json_build_object(
    'academy_id', v_academy,
    'student_id', v_student,
    'enrollment_id', v_enrolment,
    'status', v_status
  );
end;
$function$;

-- One-off repair of what already exists. Matched on user_id, the same rule the
-- triggers hold to, which reaches 1 of the 4 blank rows in this database. The
-- other three are unclaimed records: two of them have an auth account with a
-- matching email and could be guessed at, and are not, because nobody has
-- claimed them. Archival is not filtered on -- it says nothing about whether a
-- name is known.
update public.students s
   set full_name = nullif(btrim(p.full_name), '')
  from public.profiles p
 where p.id = s.user_id
   and coalesce(btrim(s.full_name), '') = ''
   and coalesce(btrim(p.full_name), '') <> '';

update public.instructors i
   set full_name = nullif(btrim(p.full_name), '')
  from public.profiles p
 where p.id = i.user_id
   and coalesce(btrim(i.full_name), '') = ''
   and coalesce(btrim(p.full_name), '') <> '';
