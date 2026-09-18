-- Report checks: a student uploads the document, the rota picks a checker, and
-- the whole conversation happens in the app instead of in a room.
--
-- WHY THIS EXISTS, in one number: of the 179 appointments in this database that
-- carry a note, 154 say some version of "semakan LPKC", "check LPKT", "slide
-- dan portfolio", "fail". Eighty-six per cent of the diary is a document being
-- looked at. An appointment is the wrong shape for that work — it costs a room,
-- a travelling student and an hour of an instructor's week to do something with
-- no reason to be synchronous, and it leaves no record of what was said. This
-- module is that work without the journey. Appointments stay, for the things
-- that genuinely need a person in front of you.
--
-- THREE DECISIONS worth reading before changing anything:
--
-- 1. SLOTS ARE NOT INVOLVED. The appointment rota walks app.booking_slots,
--    which gates on hours, notice and time off — all rules about opening a
--    booking *window*. A report has no window: it is work in a queue, not an
--    hour in a diary. So this rota is its own function and consults nothing but
--    pool membership and how much each checker is already holding.
--
-- 2. THE POOL IS THE SWITCH. There is no academy_report_settings table. An
--    academy with no is_report_checker instructor cannot receive a report,
--    which is exactly what "we do not use this" means, and is the same
--    discipline as instructors.is_bookable defaulting to false.
--
-- 3. ONE REPORT PER (STUDENT, COURSE). Not one per document. A student's LPKC,
--    slide and portfolio are checked together — the appointment notes name
--    those three in one breath — so they are versions and files on one thread
--    with one status and one checker, not three threads to chase. The unique
--    constraint says so.
--
-- Clients have NO DML on any of the three tables. Assignment has to be fair,
-- and a status change has to be the same statement as the timeline entry and
-- the notification that reports it — the approve_enrollment lesson. The RPCs
-- are the only doors.
-- Full note: docs/report-checks.md

create type public.report_status as enum
  ('submitted', 'in_review', 'changes_requested', 'approved');

comment on type public.report_status is
  'submitted/in_review wait on the checker; changes_requested waits on the student; approved is done.';

create type public.report_event_kind as enum
  ('submitted', 'comment', 'status', 'assigned');

-- ---------------------------------------------------------------------------
-- Who checks reports. A flag, not a table, for the same reason is_bookable is
-- one: "does this person check reports" is one boolean, and instructors
-- already carries the rest of the record.
--
-- Separate from is_bookable on purpose. Only 4 of this academy's 11 active
-- instructors take diary bookings; requiring somebody's diary to be open before
-- they may read a PDF would be a rule about the wrong thing.
-- ---------------------------------------------------------------------------
alter table public.instructors
  add column if not exists is_report_checker boolean not null default false;

comment on column public.instructors.is_report_checker is
  'In the report-check rota. Also requires status = active, so on_leave drops out without anybody touching a switch.';

-- ---------------------------------------------------------------------------
-- The thread. One row per (student, course); everything else is history.
-- ---------------------------------------------------------------------------
create table if not exists public.report_submissions (
  id            uuid primary key default gen_random_uuid(),
  academy_id    uuid not null references public.academies(id) on delete cascade,
  student_id    uuid not null,
  course_id     uuid not null,
  -- Null only while the pool is empty, which submit_report refuses anyway. It
  -- stays nullable so an instructor record can be removed without taking the
  -- thread with it.
  instructor_id uuid,
  -- What is in this batch: "LPKC, slide dan portfolio". Free text, the way a
  -- course intake lives in its title — there is no document-type entity and
  -- none should be invented.
  title         text not null,
  status        public.report_status not null default 'submitted',
  -- How many times the student has uploaded. 1 on creation; each submitted
  -- event carries the same number, so a file knows its generation.
  version       integer not null default 1,
  -- Did the rota choose, or did an admin? "Why did I get this one" is the first
  -- question asked of any auto-assigning system.
  auto_assigned boolean not null default false,
  submitted_at  timestamptz not null default now(),
  reviewed_at   timestamptz,
  approved_at   timestamptz,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint report_submissions_version_check check (version > 0),
  constraint report_submissions_one_per_course
    unique (academy_id, student_id, course_id),
  constraint report_submissions_academy_id_student_id_fkey
    foreign key (academy_id, student_id)
    references public.students(academy_id, id) on delete cascade,
  constraint report_submissions_academy_id_course_id_fkey
    foreign key (academy_id, course_id)
    references public.courses(academy_id, id) on delete cascade,
  -- MATCH SIMPLE (the default): a null instructor skips the tenancy check
  -- rather than failing it, which is exactly the unassigned case.
  constraint report_submissions_academy_id_instructor_id_fkey
    foreign key (academy_id, instructor_id)
    references public.instructors(academy_id, id) on delete set null
);

-- The two queues this feeds: the checker's ("what is waiting on me") and the
-- student's own.
create index if not exists report_submissions_academy_status_idx
  on public.report_submissions (academy_id, status, submitted_at);
create index if not exists report_submissions_instructor_idx
  on public.report_submissions (instructor_id, status, submitted_at);
create index if not exists report_submissions_student_idx
  on public.report_submissions (student_id, submitted_at desc);

alter table public.report_submissions enable row level security;

-- The same three tests as "appointments: admin all, own instructor, own
-- student", and for the same reason: a trainer is staff so they can teach, and
-- another student's draft thesis is not part of that. Deliberately NOT
-- app.is_staff — see docs/appointments.md, "Who sees whose sessions", where a
-- display-only narrowing turned out not to be a boundary at all.
create policy "reports: admin all, own instructor, own student"
  on public.report_submissions for select to authenticated
  using (
    app.is_admin(academy_id)
    or app.owns_instructor(instructor_id)
    or app.owns_student(student_id)
  );

comment on table public.report_submissions is
  'One report-check thread per (student, course). Written only through submit_report / comment_on_report / reassign_report.';

-- ---------------------------------------------------------------------------
-- The timeline. Every upload, comment, verdict and handover, in order, for
-- ever.
--
-- The actor's name and role are SNAPSHOT, the notifications discipline: the
-- list then needs no joins, and a later rename does not rewrite who said what
-- at the time. actor_id is kept alongside for "was this me".
-- ---------------------------------------------------------------------------
create table if not exists public.report_events (
  id         uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.academies(id) on delete cascade,
  report_id  uuid not null references public.report_submissions(id) on delete cascade,
  kind       public.report_event_kind not null,
  -- What was written. Null on assigned, which is a fact and not a sentence.
  body       text,
  -- Set when this event moved the status: on a status event, and on a comment
  -- that carried a verdict. Null otherwise.
  to_status  public.report_status,
  -- Set on submitted: which generation of files arrived.
  version    integer,
  actor_id   uuid references auth.users(id) on delete set null,
  actor_name text,
  actor_role text not null,
  created_at timestamptz not null default now(),

  constraint report_events_actor_role_check
    check (actor_role in ('student', 'instructor', 'admin', 'system'))
);

create index if not exists report_events_report_created_idx
  on public.report_events (report_id, created_at);

alter table public.report_events enable row level security;

-- Visibility follows the thread exactly. Written as an EXISTS against the
-- parent rather than repeating the three tests, so the two cannot disagree.
create policy "report events: follow the report"
  on public.report_events for select to authenticated
  using (exists (
    select 1 from public.report_submissions r
    where r.id = report_events.report_id
  ));

comment on table public.report_events is
  'The report history: uploads, comments, verdicts, handovers. Append-only, written by the report RPCs.';

-- ---------------------------------------------------------------------------
-- The files. Attached to the EVENT that carried them, not to the thread, so
-- "version 2 of the LPKC" is a fact the table states rather than one a reader
-- reconstructs from timestamps.
--
-- The object lives in the PRIVATE student-reports bucket. Same reasoning as
-- course-materials: a student's draft thesis in a public bucket is a draft
-- thesis anybody with the URL can read.
-- ---------------------------------------------------------------------------
create table if not exists public.report_files (
  id         uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.academies(id) on delete cascade,
  report_id  uuid not null references public.report_submissions(id) on delete cascade,
  event_id   uuid not null references public.report_events(id) on delete cascade,
  version    integer not null,
  -- Storage key: <academy_id>/<uploader user id>/<uuid>.<ext>, built by
  -- upload-media from verified identity. The RPCs re-check the prefix before
  -- storing it — see app.assert_own_upload.
  file_path  text not null,
  file_name  text not null,
  mime_type  text,
  size_bytes bigint,
  created_at timestamptz not null default now(),

  constraint report_files_size_check check (size_bytes is null or size_bytes >= 0)
);

create index if not exists report_files_report_idx
  on public.report_files (report_id, version);
create index if not exists report_files_event_idx
  on public.report_files (event_id);

alter table public.report_files enable row level security;

create policy "report files: follow the report"
  on public.report_files for select to authenticated
  using (exists (
    select 1 from public.report_submissions r
    where r.id = report_files.report_id
  ));

comment on table public.report_files is
  'One uploaded document, pinned to the timeline event it arrived with. The object lives in the private student-reports bucket.';

drop trigger if exists set_updated_at on public.report_submissions;
create trigger set_updated_at
  before update on public.report_submissions
  for each row execute function app.set_updated_at();
