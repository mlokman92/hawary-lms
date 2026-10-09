-- One student, one course — and an invoice belongs to its student's course.
--
-- Until now an invoice carried its own course, chosen when it was raised and
-- independent of where the student was enrolled. The two drifted: twice in one
-- day the owner found a student whose invoice sat in one course while they
-- belonged to another, and 25 live invoices had no course at all although
-- their student was enrolled. Nothing stopped a student being in two courses
-- either, and one was.
--
-- The business rule has always been "one student, one course". This makes the
-- database hold it, and makes the invoice's course a *consequence* of it:
--
--   1. A student has at most one enrolment that is not cancelled.
--   2. `invoices.course_id` is that enrolment's course — always. The database
--      sets it on every write and re-sets it whenever the enrolment changes.
--      Nobody chooses it; nobody can make it disagree.
--
-- The column stays, on purpose. Dropping it and joining to `enrollments` at
-- read time would have meant rewriting every money function and the /payments
-- list filter, and putting a second RLS-guarded table inside each of them —
-- the shape that timed out in 20261010120000. Kept as a column the database
-- owns, every existing read is already correct and a mismatch is impossible
-- rather than merely unlikely. The same choice `kwsp_paid_sen` made.

-- ---------------------------------------------------------------------------
-- 1. One course per student.
--
--    A partial unique index, so the rule holds under concurrency: two admins
--    enrolling the same student at once cannot both win. `cancelled` is left
--    out because it is not an enrolment — it is a request that was refused
--    (`useRejectEnrollment`), and a refused request must not stop the student
--    joining the course they are accepted into. `pending` counts: a student
--    waiting on one course may not also be put in another.
--
--    Moving a student is therefore two steps — remove the course, add the
--    other — and that is the owner's decision, not an omission: nothing moves
--    a student, and the invoices that follow them, by accident.
-- ---------------------------------------------------------------------------
create unique index if not exists enrollments_one_course_per_student
  on public.enrollments (student_id)
  where status <> 'cancelled';

comment on index public.enrollments_one_course_per_student
  is 'One student, one course: at most one enrolment that is not cancelled.';

-- ---------------------------------------------------------------------------
-- 2. The student's course.
--
--    SECURITY DEFINER because the triggers below run for whoever touched the
--    row — a trainer enrolling a student cannot read `invoices`, and an admin
--    recording a payment should not need `enrollments` to be readable in any
--    particular way. The index above is what makes "the" course well defined.
-- ---------------------------------------------------------------------------
create or replace function app.student_course(_student uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select e.course_id
  from public.enrollments e
  where e.student_id = _student
    and e.status <> 'cancelled'
  limit 1;
$$;

comment on function app.student_course(uuid)
  is 'The course a student is in: their one enrolment that is not cancelled, or NULL.';

-- ---------------------------------------------------------------------------
-- 3. An invoice takes its student's course, on every write.
--
--    BEFORE INSERT **or UPDATE**, with no column list: whatever a client sends
--    for `course_id`, and whatever an UPDATE tries to set it to, the row that
--    lands carries the student's course. A student with no enrolment has
--    invoices with no course, which is the truth about them.
-- ---------------------------------------------------------------------------
create or replace function app.set_invoice_course()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  new.course_id := app.student_course(new.student_id);
  return new;
end;
$function$;

drop trigger if exists set_invoice_course on public.invoices;
create trigger set_invoice_course
  before insert or update on public.invoices
  for each row execute function app.set_invoice_course();

-- ---------------------------------------------------------------------------
-- 4. When the enrolment changes, the student's invoices follow.
--
--    Enrolled, removed, refused, moved: every invoice the student has —
--    paid ones included — is re-filed under where they are now. That is the
--    point; a report by course is a report of the students in it.
--
--    The UPDATE below names only `course_id`, so `notify_invoice_issued`
--    (UPDATE OF status) does not fire and no student is told anything.
--
--    When a student row is being deleted its enrolments cascade and this fires
--    for each; by then the student is gone, so there is nothing to re-file and
--    it steps aside.
-- ---------------------------------------------------------------------------
create or replace function app.sync_invoice_course()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  _students uuid[];
begin
  if tg_op = 'DELETE' then
    _students := array[old.student_id];
  elsif tg_op = 'INSERT' then
    _students := array[new.student_id];
  elsif new.course_id is distinct from old.course_id
     or new.status is distinct from old.status
     or new.student_id is distinct from old.student_id then
    _students := array[new.student_id, old.student_id];
  else
    return null;
  end if;

  update public.invoices i
     set course_id = app.student_course(i.student_id)
   where i.student_id = any (_students)
     and exists (select 1 from public.students s where s.id = i.student_id)
     and i.course_id is distinct from app.student_course(i.student_id);

  return null;
end;
$function$;

drop trigger if exists enrollments_sync_invoice_course on public.enrollments;
create trigger enrollments_sync_invoice_course
  after insert or update or delete on public.enrollments
  for each row execute function app.sync_invoice_course();

-- ---------------------------------------------------------------------------
-- 5. Bring today's invoices into line.
--
--    Most already are. The ones that move: invoices with no course whose
--    student is enrolled (ad-hoc invoices raised from the student's page), and
--    a handful, mostly void, tagged to a course the student has since left.
-- ---------------------------------------------------------------------------
update public.invoices i
   set course_id = app.student_course(i.student_id)
 where i.course_id is distinct from app.student_course(i.student_id);

comment on column public.invoices.course_id
  is 'The student''s course — set by app.set_invoice_course on every write and re-set by app.sync_invoice_course when their enrolment changes. Never write it.';

-- ---------------------------------------------------------------------------
-- 6. The public join link refuses a second course in words.
--
--    The index would refuse it anyway, but with a constraint name. A person
--    using the join link should be told what is wrong: they already have a
--    course here. Only the check is new; the rest is the function as it was.
-- ---------------------------------------------------------------------------
create or replace function public.join_academy(_slug text, _course_id uuid)
returns json
language plpgsql
security definer
set search_path = ''
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

  -- One student, one course. Checked before anything is written, so a refused
  -- request leaves no record, no link and no membership behind it.
  if v_student is not null and exists (
    select 1 from public.enrollments e
    where e.student_id = v_student
      and e.status <> 'cancelled'
      and e.course_id <> _course_id
  ) then
    raise exception 'You are already enrolled in a course at this academy';
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
