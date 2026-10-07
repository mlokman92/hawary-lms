-- What the two mobile apps need from the database. Five independent pieces:
--
--   1. push_devices          which phone belongs to which account
--   2. the push dispatcher   notifications -> send-push, once per statement
--   3. five event triggers   work marked, invoice issued, payment received,
--                            session tomorrow, work due
--   4. announcements         academy or course -> its students
--   5. submission files      attachments on an assignment hand-in
--   6. app_min_versions      the forced-update floor
--
-- See docs/mobile-apps.md.

-- ===========================================================================
-- 1. push_devices
-- ===========================================================================
-- One row per installed app per phone. `app` matters: a person can have both
-- apps on one phone, and a notification addressed to them as a student must
-- not surface in the staff app.
--
-- No client access at all, the `login_events` standing: a token is the address
-- of somebody's phone, and the only things that need to read it are the two
-- RPCs below and the service-role sender.
create table public.push_devices (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  app        text not null check (app in ('student', 'academy')),
  token      text not null unique,
  platform   text not null check (platform in ('ios', 'android')),
  lang       text not null default 'en' check (lang in ('en', 'ms')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.push_devices is
  'Expo push tokens. One row per app install. No client policies: written by register_push_device / unregister_push_device, read by send-push under the service role.';

create index push_devices_user_idx on public.push_devices (user_id);

alter table public.push_devices enable row level security;
revoke all on public.push_devices from anon, authenticated;

create trigger set_updated_at before update on public.push_devices
  for each row execute function app.set_updated_at();

-- A token belongs to whoever is signed in on that phone NOW. Upserting on the
-- token rather than on (user, token) is the point: when a second person signs
-- in on a shared phone the row moves to them, and the first stops being
-- notified there.
create or replace function public.register_push_device(
  _token    text,
  _app      text,
  _platform text,
  _lang     text default 'en'
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'You must be signed in'; end if;
  if _token is null or length(btrim(_token)) < 10 then
    raise exception 'Missing push token';
  end if;
  insert into public.push_devices (user_id, app, token, platform, lang)
  values (
    v_uid, _app, btrim(_token), _platform,
    case when _lang = 'ms' then 'ms' else 'en' end
  )
  on conflict (token) do update
    set user_id  = excluded.user_id,
        app      = excluded.app,
        platform = excluded.platform,
        lang     = excluded.lang;
end;
$$;

revoke all on function public.register_push_device(text, text, text, text) from public, anon;
grant execute on function public.register_push_device(text, text, text, text) to authenticated;

-- ===========================================================================
-- 2. The dispatcher
-- ===========================================================================
-- A push is a COPY of a notification row, never a second source of truth: the
-- row is written in the transaction that caused it, and this trigger then asks
-- send-push to deliver it. A phone that is off, unregistered or over quota
-- still finds the notification in the bell.
--
-- Statement-level with a transition table, so an announcement to 600 students
-- is one HTTP call carrying 600 ids rather than 600 calls. pg_net queues the
-- request and sends it after commit, so a rolled-back write pushes nothing.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'push_dispatch') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'push_dispatch',
      'Bearer token the notifications trigger sends to send-push');
  end if;
end $$;

create or replace function public.push_dispatch_secret()
returns text
language sql
security definer
set search_path = ''
stable
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'push_dispatch';
$$;

revoke execute on function public.push_dispatch_secret() from public, anon, authenticated;
grant  execute on function public.push_dispatch_secret() to service_role;

create or replace function app.dispatch_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids    uuid[];
  v_secret text;
  v_from   integer := 1;
  v_chunk  constant integer := 200;
begin
  -- Only rows whose recipient has a phone registered. Most accounts have none,
  -- and a call that can deliver nothing is a call not worth queueing.
  select array_agg(n.id) into v_ids
  from new_rows n
  where exists (select 1 from public.push_devices d where d.user_id = n.user_id);

  if v_ids is null then return null; end if;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'push_dispatch';

  while v_from <= array_length(v_ids, 1) loop
    perform net.http_post(
      url := 'https://vpklztxqkvqmmzsxfqgp.supabase.co/functions/v1/send-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_secret),
      body := jsonb_build_object('ids', to_jsonb(v_ids[v_from : v_from + v_chunk - 1])),
      timeout_milliseconds := 30000
    );
    v_from := v_from + v_chunk;
  end loop;

  return null;
exception when others then
  -- Queueing a push must never undo the booking, comment or payment that the
  -- notification reports. The row is already the record.
  return null;
end;
$$;

revoke all on function app.dispatch_push() from public, anon, authenticated;

create trigger notifications_dispatch_push
  after insert on public.notifications
  referencing new table as new_rows
  for each statement execute function app.dispatch_push();

-- ===========================================================================
-- 3. Events that had no notification
-- ===========================================================================
-- Each function swallows its own failure for the same reason the dispatcher
-- does: telling somebody is never worth failing the write it is about.

-- --- work_marked: an assignment --------------------------------------------
-- Fires once, on the way INTO graded/returned. A grader correcting a mark
-- afterwards moves between those two statuses and tells nobody twice.
create or replace function app.notify_submission_marked()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user   uuid;
  v_title  text;
  v_total  numeric;
  v_course text;
begin
  if new.status in ('graded', 'returned')
     and old.status not in ('graded', 'returned') then
    select s.user_id into v_user from public.students s where s.id = new.student_id;
    select a.title, a.total_points, c.title into v_title, v_total, v_course
    from public.assignments a
    join public.courses c on c.id = a.course_id
    where a.id = new.assignment_id;

    perform app.notify(new.academy_id, v_user, 'work_marked',
      jsonb_build_object(
        'work',    'assignment',
        'work_id', new.assignment_id,
        'title',   v_title,
        'course',  v_course,
        'score',   new.grade,
        'out_of',  v_total
      ));
  end if;
  return null;
exception when others then
  return null;
end;
$$;

create trigger notify_submission_marked
  after update of status on public.assignment_submissions
  for each row execute function app.notify_submission_marked();

-- --- work_marked: an assessment --------------------------------------------
-- Only when a PERSON marked it. An objective quiz is graded by submit_attempt
-- the moment it is handed in (graded_by null) and the score is already on the
-- student's screen; a notification about it would arrive after the news.
create or replace function app.notify_attempt_marked()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user   uuid;
  v_title  text;
  v_course text;
begin
  if new.status = 'graded' and old.status <> 'graded' and new.graded_by is not null then
    select s.user_id into v_user from public.students s where s.id = new.student_id;
    select a.title, c.title into v_title, v_course
    from public.assessments a
    join public.courses c on c.id = a.course_id
    where a.id = new.assessment_id;

    perform app.notify(new.academy_id, v_user, 'work_marked',
      jsonb_build_object(
        'work',    'assessment',
        'work_id', new.assessment_id,
        'title',   v_title,
        'course',  v_course,
        'score',   new.score,
        'out_of',  new.max_score
      ));
  end if;
  return null;
exception when others then
  return null;
end;
$$;

create trigger notify_attempt_marked
  after update of status on public.assessment_attempts
  for each row execute function app.notify_attempt_marked();

-- --- invoice_issued ---------------------------------------------------------
-- An invoice becomes a bill when it is issued — created that way, or moved out
-- of draft. A draft tells nobody: it is not a bill yet.
create or replace function app.notify_invoice_issued()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  if new.status = 'issued'
     and (TG_OP = 'INSERT' or old.status = 'draft') then
    select s.user_id into v_user from public.students s where s.id = new.student_id;
    perform app.notify(new.academy_id, v_user, 'invoice_issued',
      jsonb_build_object(
        'invoice_id', new.id,
        'invoice_no', new.invoice_no,
        'total_sen',  new.total_sen,
        'due_at',     new.due_at
      ));
  end if;
  return null;
exception when others then
  return null;
end;
$$;

create trigger notify_invoice_issued
  after insert or update of status on public.invoices
  for each row execute function app.notify_invoice_issued();

-- --- payment_received -------------------------------------------------------
-- The receipt. Money recorded by an admin and money settled by ToyyibPay both
-- land here as a succeeded `payments` row, so one trigger covers both.
create or replace function app.notify_payment_received()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user    uuid;
  v_student uuid;
  v_no      text;
begin
  if new.status = 'succeeded'
     and (TG_OP = 'INSERT' or old.status <> 'succeeded') then
    select i.student_id, i.invoice_no into v_student, v_no
    from public.invoices i where i.id = new.invoice_id;
    select s.user_id into v_user
    from public.students s where s.id = coalesce(new.student_id, v_student);

    perform app.notify(new.academy_id, v_user, 'payment_received',
      jsonb_build_object(
        'invoice_id', new.invoice_id,
        'invoice_no', v_no,
        'amount_sen', new.amount_sen
      ));
  end if;
  return null;
exception when others then
  return null;
end;
$$;

create trigger notify_payment_received
  after insert or update of status on public.payments
  for each row execute function app.notify_payment_received();

-- --- appointment_reminder ---------------------------------------------------
-- Rides on the evening-before email rather than keeping a second clock:
-- send-appointment-reminders stamps reminder_sent_at on every session its email
-- listed, and that stamp is the event. Same selection, same hour, same retries
-- — and a student with no email address is stamped too, so they are still
-- told here. Cancelled sessions the email mentions are skipped: this says
-- "you have a session tomorrow", and they do not.
create or replace function app.notify_appointment_reminder()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_name text;
  v_tz   text;
begin
  if old.reminder_sent_at is null
     and new.reminder_sent_at is not null
     and new.status = 'booked' then
    select s.user_id into v_user from public.students s where s.id = new.student_id;
    select i.full_name into v_name from public.instructors i where i.id = new.instructor_id;
    select a.timezone into v_tz from public.academies a where a.id = new.academy_id;

    perform app.notify(new.academy_id, v_user, 'appointment_reminder',
      jsonb_build_object(
        'appointment_id', new.id,
        'role',           'student',
        'with_name',      v_name,
        'starts_at',      new.starts_at,
        'ends_at',        new.ends_at,
        'tz',             v_tz
      ));
  end if;
  return null;
exception when others then
  return null;
end;
$$;

create trigger notify_appointment_reminder
  after update of reminder_sent_at on public.appointments
  for each row execute function app.notify_appointment_reminder();

-- --- work_due ---------------------------------------------------------------
-- 09:00 academy time, for work that closes within the next 36 hours and has
-- not been handed in. Hourly like the appointment reminders, with the SQL
-- deciding whose morning it is, so a branch in another timezone needs nothing.
--
-- "Already told" is answered from `notifications` itself (one work_due per
-- person per piece of work, ever) rather than from a ledger table: the row is
-- the record, and a second table would be a second thing to keep true.
create or replace function app.notify_work_due(_at timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  with due as (
    select a.academy_id, a.course_id, a.id as work_id, 'assignment'::text as work,
           a.title, a.due_at
    from public.assignments a
    join public.course_modules m on m.id = a.module_id and m.is_published
    where a.is_published
      and a.due_at > _at and a.due_at <= _at + interval '36 hours'
    union all
    select q.academy_id, q.course_id, q.id, 'assessment', q.title, q.available_until
    from public.assessments q
    join public.course_modules m on m.id = q.module_id and m.is_published
    where q.is_published
      and q.available_until > _at and q.available_until <= _at + interval '36 hours'
  ),
  owed as (
    select d.*, s.user_id, s.id as student_id, c.title as course
    from due d
    join public.academies ac on ac.id = d.academy_id
    join public.courses c on c.id = d.course_id and c.status = 'published'
    join public.enrollments e on e.course_id = d.course_id and e.status = 'active'
    join public.students s
      on s.id = e.student_id and s.user_id is not null and s.archived_at is null
    where extract(hour from _at at time zone ac.timezone) = 9
      and not exists (
        select 1 from public.assignment_submissions sub
        where d.work = 'assignment'
          and sub.assignment_id = d.work_id
          and sub.student_id = s.id
          and sub.status in ('submitted', 'graded', 'returned')
      )
      and not exists (
        select 1 from public.assessment_attempts att
        where d.work = 'assessment'
          and att.assessment_id = d.work_id
          and att.student_id = s.id
          and att.status in ('submitted', 'graded')
      )
      and not exists (
        select 1 from public.notifications n
        where n.user_id = s.user_id
          and n.kind = 'work_due'
          and n.data ->> 'work_id' = d.work_id::text
      )
  )
  insert into public.notifications (academy_id, user_id, kind, data)
  select o.academy_id, o.user_id, 'work_due',
         jsonb_build_object(
           'work',    o.work,
           'work_id', o.work_id,
           'title',   o.title,
           'course',  o.course,
           'due_at',  o.due_at
         )
  from owed o;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function app.notify_work_due(timestamptz) from public, anon, authenticated;
revoke all on function app.notify_submission_marked() from public, anon, authenticated;
revoke all on function app.notify_attempt_marked() from public, anon, authenticated;
revoke all on function app.notify_invoice_issued() from public, anon, authenticated;
revoke all on function app.notify_payment_received() from public, anon, authenticated;
revoke all on function app.notify_appointment_reminder() from public, anon, authenticated;

select cron.schedule(
  'work-due-notices',
  '0 * * * *',
  $job$ select app.notify_work_due(); $job$
);

-- ===========================================================================
-- 4. Announcements
-- ===========================================================================
-- One message from the academy, or from one course, to its students. Written
-- once and read by many, so it is its own row and each student's notification
-- points at it — unlike every other kind, where the notification is the whole
-- event.
create table public.announcements (
  id          uuid primary key default gen_random_uuid(),
  academy_id  uuid not null references public.academies(id) on delete cascade,
  -- Null = the whole academy.
  course_id   uuid references public.courses(id) on delete cascade,
  title       text not null check (length(btrim(title)) > 0),
  body        text not null check (length(btrim(body)) > 0),
  -- A snapshot, the notifications discipline: students cannot read
  -- `instructors`, and a later rename must not rewrite who said it.
  author_name text,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

comment on table public.announcements is
  'A broadcast to an academy''s students (course_id null) or one course''s. Clients have no DML: post_announcement / delete_announcement.';

create index announcements_academy_created_idx
  on public.announcements (academy_id, created_at desc);
create index announcements_course_idx on public.announcements (course_id);
create index announcements_created_by_idx on public.announcements (created_by);

alter table public.announcements enable row level security;

-- Staff read all of their academy's. A student reads the academy-wide ones and
-- those of courses they are actively enrolled in.
create policy "announcements: staff all, students their own courses"
  on public.announcements for select to authenticated
  using (
    app.is_staff(academy_id)
    or (app.is_member(academy_id)
        and (course_id is null or app.is_enrolled(course_id)))
  );

-- Posting and telling are one statement, the approve_enrollment lesson: an
-- announcement nobody was notified about is a note on a page nobody opens.
--
-- An admin may address the academy or any course. A trainer may address the
-- courses they teach — the same test that decides what they may grade.
create or replace function public.post_announcement(
  _academy_id uuid,
  _course_id  uuid,
  _title      text,
  _body       text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_id     uuid;
  v_author text;
  v_course text;
begin
  if v_uid is null then raise exception 'You must be signed in'; end if;
  if nullif(btrim(coalesce(_title, '')), '') is null then
    raise exception 'An announcement needs a title';
  end if;
  if nullif(btrim(coalesce(_body, '')), '') is null then
    raise exception 'An announcement needs a message';
  end if;

  if _course_id is null then
    if not app.is_admin(_academy_id) then
      raise exception 'Only an admin can announce to the whole academy';
    end if;
  else
    select c.title into v_course
    from public.courses c
    where c.id = _course_id and c.academy_id = _academy_id;
    if v_course is null or not app.can_grade_course(_course_id) then
      raise exception 'You cannot announce to this course';
    end if;
  end if;

  select p.full_name into v_author from public.profiles p where p.id = v_uid;

  insert into public.announcements (academy_id, course_id, title, body, author_name, created_by)
  values (_academy_id, _course_id, btrim(_title), btrim(_body), v_author, v_uid)
  returning id into v_id;

  -- One INSERT for every recipient, so the dispatcher makes one call.
  insert into public.notifications (academy_id, user_id, kind, data)
  select _academy_id, r.user_id, 'announcement',
         jsonb_build_object(
           'announcement_id', v_id,
           'title',           btrim(_title),
           'preview',         left(btrim(_body), 140),
           'course',          v_course,
           'author',          v_author
         )
  from (
    -- The whole academy: every active student membership.
    select m.user_id
    from public.academy_members m
    where _course_id is null
      and m.academy_id = _academy_id
      and m.role = 'student'
      and m.status = 'active'
    union
    -- One course: its active enrolments, for students who have an account.
    select s.user_id
    from public.enrollments e
    join public.students s on s.id = e.student_id
    where _course_id is not null
      and e.course_id = _course_id
      and e.status = 'active'
      and s.user_id is not null
      and s.archived_at is null
  ) r;

  return v_id;
end;
$$;

revoke all on function public.post_announcement(uuid, uuid, text, text) from public, anon;
grant execute on function public.post_announcement(uuid, uuid, text, text) to authenticated;

-- ===========================================================================
-- 5. Attachments on an assignment hand-in
-- ===========================================================================
-- The private bucket and the wiring CLAUDE.md listed as not built. Same shape
-- as student-reports, for the same reasons: a private bucket nothing reaches
-- except upload-media (writes) and submission-url (signs), a key of
-- <academy_id>/<uploader user id>/<uuid>.<ext>, and app.assert_own_upload
-- before a path may be attached to anything.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'submissions',
  'submissions',
  false,
  52428800,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/csv',
    'application/zip',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- A table rather than the old single `attachment_url` column: a hand-in is
-- usually several photographs, and a URL column cannot hold a private object
-- anyway — there is no URL until one is signed.
create table public.assignment_submission_files (
  id            uuid primary key default gen_random_uuid(),
  academy_id    uuid not null references public.academies(id) on delete cascade,
  submission_id uuid not null references public.assignment_submissions(id) on delete cascade,
  file_path     text not null,
  file_name     text not null,
  mime_type     text,
  size_bytes    bigint,
  created_at    timestamptz not null default now()
);

comment on table public.assignment_submission_files is
  'Files attached to an assignment submission, in the private submissions bucket. Clients have no DML: attach_submission_file / remove_submission_file.';

create index assignment_submission_files_submission_idx
  on public.assignment_submission_files (submission_id);
create index assignment_submission_files_academy_idx
  on public.assignment_submission_files (academy_id);

alter table public.assignment_submission_files enable row level security;

-- Follows the submission, the report_files shape: whoever may read the
-- hand-in may see what was attached to it, and the two cannot disagree.
create policy "submission files: follow the submission"
  on public.assignment_submission_files for select to authenticated
  using (
    exists (
      select 1 from public.assignment_submissions s
      where s.id = assignment_submission_files.submission_id
    )
  );

-- Attach while it is still a draft. Once handed in, what the grader is marking
-- must not change underneath them — the same line the UPDATE policy draws for
-- the text.
create or replace function public.attach_submission_file(
  _submission_id uuid,
  _file          jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub public.assignment_submissions;
  v_id  uuid;
begin
  select * into v_sub from public.assignment_submissions where id = _submission_id;
  if v_sub.id is null or not app.owns_student(v_sub.student_id) then
    raise exception 'Submission not found';
  end if;
  if v_sub.status <> 'draft' then
    raise exception 'This work has already been handed in';
  end if;
  if (select count(*) from public.assignment_submission_files f
      where f.submission_id = _submission_id) >= 10 then
    raise exception 'A hand-in can carry at most 10 files';
  end if;

  perform app.assert_own_upload(v_sub.academy_id, _file ->> 'path');

  insert into public.assignment_submission_files (
    academy_id, submission_id, file_path, file_name, mime_type, size_bytes
  ) values (
    v_sub.academy_id, _submission_id,
    _file ->> 'path',
    coalesce(nullif(btrim(_file ->> 'name'), ''), 'file'),
    _file ->> 'mime',
    nullif(_file ->> 'size', '')::bigint
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- Entitlement for the signing function, decided here under the caller's JWT:
-- the student whose hand-in it is, or anyone who may grade that assignment —
-- exactly the submission's own SELECT policy.
create or replace function public.submission_download(_file_id uuid)
returns table (file_path text, file_name text, mime_type text)
language sql
stable
security definer
set search_path = ''
as $$
  select f.file_path, f.file_name, f.mime_type
  from public.assignment_submission_files f
  join public.assignment_submissions s on s.id = f.submission_id
  where f.id = _file_id
    and (app.owns_student(s.student_id) or app.can_grade_assignment(s.assignment_id));
$$;

revoke all on function public.attach_submission_file(uuid, jsonb) from public, anon;
revoke all on function public.submission_download(uuid) from public, anon;
grant execute on function public.attach_submission_file(uuid, jsonb) to authenticated;
grant execute on function public.submission_download(uuid) to authenticated;

-- ===========================================================================
-- 6. The forced-update floor
-- ===========================================================================
-- The oldest build of each app that may still run. Raised by the owner in SQL
-- after a change an old build cannot survive; the app reads it at launch and,
-- below the floor, shows nothing but a link to the store.
--
-- Readable signed out, because the check runs before sign-in — and it holds
-- nothing but two version numbers and two store links.
create table public.app_min_versions (
  app         text not null check (app in ('student', 'academy')),
  platform    text not null check (platform in ('ios', 'android')),
  min_version text not null default '1.0.0' check (min_version ~ '^\d+(\.\d+){0,2}$'),
  store_url   text,
  updated_at  timestamptz not null default now(),
  primary key (app, platform)
);

comment on table public.app_min_versions is
  'Minimum app version allowed to run, per app and platform. Owner-edited in SQL; read by the apps at launch.';

alter table public.app_min_versions enable row level security;

create policy "app min versions: anyone can read"
  on public.app_min_versions for select to anon, authenticated
  using (true);

create trigger set_updated_at before update on public.app_min_versions
  for each row execute function app.set_updated_at();

insert into public.app_min_versions (app, platform) values
  ('student', 'ios'), ('student', 'android'),
  ('academy', 'ios'), ('academy', 'android');
