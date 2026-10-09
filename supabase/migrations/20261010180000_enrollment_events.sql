-- Who enrolled this student, in what, and when.
--
-- `enrollments` holds the present and nothing else. It has no `created_by`,
-- and the staff screens change a student's course by deleting one row and
-- inserting another — so when a student turns out to be in the wrong course,
-- the table cannot say who put them there, or that they were ever anywhere
-- else. The owner asked for exactly that on /students/:id.
--
-- So: an append-only log, written by a trigger on `enrollments`. A trigger and
-- not a line in each mutation, because enrolments are written from six places
-- (the student page, the course roster, bulk enrol, CSV import, the public
-- join link's RPC, approvals) plus SQL by the owner, and a log that depends on
-- every caller remembering it is a log with holes exactly where the mistakes
-- are.

-- ---------------------------------------------------------------------------
-- 1. The log.
--
--    Titles and the actor's name are **snapshots**. A history line has to stay
--    readable after the course is renamed or deleted and after the staff
--    member's account is gone — those are the cases it gets read in. The ids
--    are kept beside them for joining while the rows still exist, and go NULL
--    when they do not.
-- ---------------------------------------------------------------------------
create table if not exists public.enrollment_events (
  id                uuid primary key default gen_random_uuid(),
  academy_id        uuid not null references public.academies(id) on delete cascade,
  student_id        uuid not null,
  -- enrolled: a row appeared.   removed: a row was deleted.
  -- moved:    course_id changed on a row that stayed.
  -- status:   status changed (pending -> active is an approval).
  kind              text not null,
  course_id         uuid,
  course_title      text not null,
  -- Only on `moved`: where they were before.
  from_course_id    uuid,
  from_course_title text,
  -- The enrolment's status after the event; NULL on the back-filled rows,
  -- where the status at the time is not known.
  status            public.enrollment_status,
  from_status       public.enrollment_status,
  -- NULL when nobody was signed in: SQL run by the owner, or a row that
  -- predates the log.
  actor_id          uuid references auth.users(id) on delete set null,
  actor_name        text,
  created_at        timestamptz not null default now(),

  constraint enrollment_events_kind_check
    check (kind in ('enrolled', 'moved', 'status', 'removed')),
  constraint enrollment_events_student_fkey
    foreign key (academy_id, student_id)
    references public.students(academy_id, id) on delete cascade,
  constraint enrollment_events_course_fkey
    foreign key (academy_id, course_id)
    references public.courses(academy_id, id) on delete set null (course_id),
  constraint enrollment_events_from_course_fkey
    foreign key (academy_id, from_course_id)
    references public.courses(academy_id, id) on delete set null (from_course_id)
);

comment on table public.enrollment_events is
  'Append-only history of a student''s enrolments, written by app.log_enrollment_event. Clients read it and never write it.';

create index if not exists enrollment_events_student_created_idx
  on public.enrollment_events (student_id, created_at desc);

alter table public.enrollment_events enable row level security;

-- Staff read it; nobody writes it. A student has no use for the name of the
-- admin who enrolled them, so there is no `owns_student` arm.
create policy "enrollment events: staff read"
  on public.enrollment_events for select to authenticated
  using (app.is_staff(academy_id));

revoke all on public.enrollment_events from anon, authenticated;
grant select on public.enrollment_events to authenticated;

-- ---------------------------------------------------------------------------
-- 2. The trigger.
--
--    SECURITY DEFINER because the table takes no client writes. `auth.uid()`
--    is whoever made the change, through whatever screen or RPC — including
--    the student themself when they joined by the public link.
--
--    An UPDATE that changes neither the course nor the status writes nothing:
--    stamping `access_email_at` is not history.
--
--    Two guards keep the log from ever blocking the thing it records. When a
--    student or a course is deleted, its enrolments go with it by cascade and
--    this fires for each — by which time the parent row is gone, so there is
--    nothing left to attach a line to and the event is skipped. And any other
--    failure is swallowed: a missing history line is a nuisance, an enrolment
--    refused because the log could not be written is an outage.
-- ---------------------------------------------------------------------------
create or replace function app.log_enrollment_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  _row public.enrollments;
  _kind text;
  _title text;
  _from_title text;
  _actor uuid := auth.uid();
  _actor_name text;
begin
  if tg_op = 'DELETE' then
    _row := old;
    _kind := 'removed';
  elsif tg_op = 'INSERT' then
    _row := new;
    _kind := 'enrolled';
  elsif new.course_id is distinct from old.course_id then
    _row := new;
    _kind := 'moved';
  elsif new.status is distinct from old.status then
    _row := new;
    _kind := 'status';
  else
    return null;
  end if;

  select c.title into _title from public.courses c where c.id = _row.course_id;
  if _title is null
     or not exists (select 1 from public.students s where s.id = _row.student_id) then
    return null;
  end if;

  if _kind = 'moved' then
    select c.title into _from_title from public.courses c where c.id = old.course_id;
  end if;

  if _actor is not null then
    select coalesce(nullif(btrim(p.full_name), ''), u.email)
      into _actor_name
      from auth.users u
      left join public.profiles p on p.id = u.id
     where u.id = _actor;
  end if;

  insert into public.enrollment_events (
    academy_id, student_id, kind,
    course_id, course_title, from_course_id, from_course_title,
    status, from_status, actor_id, actor_name
  ) values (
    _row.academy_id, _row.student_id, _kind,
    _row.course_id, _title,
    case when _kind = 'moved' then old.course_id end, _from_title,
    _row.status,
    case when tg_op = 'UPDATE' then old.status end,
    _actor, _actor_name
  );

  return null;
exception when others then
  return null;
end;
$function$;

drop trigger if exists enrollments_log_event on public.enrollments;
create trigger enrollments_log_event
  after insert or update or delete on public.enrollments
  for each row execute function app.log_enrollment_event();

-- ---------------------------------------------------------------------------
-- 3. Where everybody already is.
--
--    One `enrolled` line per existing enrolment, dated when it was made, so a
--    student's history does not open on a move out of a course it never shows
--    them joining. The actor is NULL and stays NULL: who made these was never
--    recorded, and a guess in an audit log is worse than a blank.
-- ---------------------------------------------------------------------------
insert into public.enrollment_events (
  academy_id, student_id, kind, course_id, course_title, created_at
)
select e.academy_id, e.student_id, 'enrolled', e.course_id, c.title, e.enrolled_at
from public.enrollments e
join public.courses c on c.id = e.course_id
where not exists (
  select 1 from public.enrollment_events x where x.student_id = e.student_id
);
