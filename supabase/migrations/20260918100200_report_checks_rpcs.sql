-- The only doors into a report check.
--
-- Everything here is SECURITY DEFINER, for the two reasons the appointment RPCs
-- are: assignment must be fair (a WITH CHECK expression cannot run a rota), and
-- a student cannot read `instructors` at all, so the thread has to be projected
-- for them by something that can.
--
-- WHO IS TOLD: the other party, never the actor. This is the opposite of
-- `send-appointment-notice`, deliberately. There, the actor-skip was wrong
-- because the student is nearly always the actor — they book and cancel their
-- own sessions — so skipping the actor meant never telling the student
-- anything. Here both sides act on the same thread, several times, and mailing
-- somebody a copy of the comment they just wrote is noise, not a receipt.
-- Full note: docs/report-checks.md

-- ---------------------------------------------------------------------------
-- The caller's student record, if it is currently entitled to act.
--
-- This is `app.bookable_student` under a name that is not about booking.
-- Reports and appointments ask the same question — active membership plus an
-- unarchived active/trial record — and asking it in two places is how the two
-- answers drift, so bookable_student is redefined below to call this one.
-- ---------------------------------------------------------------------------
create or replace function app.my_active_student(_academy_id uuid)
returns uuid
language sql
stable
security definer
set search_path to ''
as $$
  select s.id
  from public.students s
  join public.academy_members m
    on m.academy_id = s.academy_id
   and m.user_id    = s.user_id
   and m.status     = 'active'
  where s.academy_id = _academy_id
    and s.user_id    = (select auth.uid())
    and s.archived_at is null
    and s.status in ('active', 'trial')
  limit 1;
$$;

create or replace function app.bookable_student(_academy_id uuid)
returns uuid
language sql
stable
security definer
set search_path to ''
as $$
  select app.my_active_student(_academy_id);
$$;

-- ---------------------------------------------------------------------------
-- An uploaded object may only be claimed by whoever uploaded it.
--
-- upload-media builds every report key as <academy_id>/<uploader uid>/<uuid>.<ext>
-- from verified identity, so re-checking that prefix here is what stops a
-- caller passing somebody else's path and attaching their draft to a thread
-- they can read. The client hands over a path, so the path is client input, and
-- client input is checked.
-- ---------------------------------------------------------------------------
create or replace function app.assert_own_upload(_academy_id uuid, _path text)
returns void
language plpgsql
stable
set search_path to ''
as $$
begin
  if _path is null
     or _path not like _academy_id::text || '/' || (select auth.uid())::text || '/%' then
    raise exception 'That file was not uploaded by you';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- The rota, best candidate first.
--
-- NOT app.booking_slots, and not a copy of it. That generator gates on hours,
-- notice and time off — rules about opening a booking window — and a report is
-- work in a queue, not an hour in a diary.
--
-- The ordering differs from book_appointment's on one point that matters:
-- fewest OPEN reports, not fewest in the last 30 days. A session is over when
-- it is over, so a rolling window measures a teacher's load correctly; a report
-- stays on somebody's desk until it is approved, so the open count IS the load.
-- ---------------------------------------------------------------------------
create or replace function app.report_checkers(_academy_id uuid)
returns table (instructor_id uuid)
language sql
stable
security definer
set search_path to ''
as $$
  select i.id
  from public.instructors i
  left join lateral (
    select count(*) filter (where r.status <> 'approved') as open_n,
           max(r.created_at)                              as last_at
    from public.report_submissions r
    where r.instructor_id = i.id
      and r.academy_id    = _academy_id
  ) k on true
  where i.academy_id       = _academy_id
    and i.is_report_checker
    and i.status           = 'active'
    and i.archived_at is null
  order by coalesce(k.open_n, 0), k.last_at asc nulls first, i.id;
$$;

-- ---------------------------------------------------------------------------
-- Tell the people who are not the one who pressed the button.
--
-- One helper called from all three RPCs, so the payload shape cannot drift
-- between them — the same reasoning as app.notify_appointment_cancelled. Every
-- kind carries the same keys, so only the title line branches client-side.
-- ---------------------------------------------------------------------------
create or replace function app.notify_report(
  _report_id uuid,
  _kind      public.notification_kind,
  _actor     uuid,
  _student   boolean,
  _instructor boolean
) returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_academy  uuid;
  v_title    text;
  v_status   public.report_status;
  v_course   text;
  v_stu_user uuid;
  v_stu_name text;
  v_ins_user uuid;
  v_ins_name text;
begin
  select r.academy_id, r.title, r.status, c.title,
         s.user_id, s.full_name, i.user_id, i.full_name
    into v_academy, v_title, v_status, v_course,
         v_stu_user, v_stu_name, v_ins_user, v_ins_name
  from public.report_submissions r
  join public.students s on s.id = r.student_id
  join public.courses  c on c.id = r.course_id
  left join public.instructors i on i.id = r.instructor_id
  where r.id = _report_id;

  if v_academy is null then return; end if;

  -- app.notify no-ops on a null user_id, so an unclaimed record needs no branch
  -- here — that is the ordinary case, not a failure to notify.
  if _student and v_stu_user is distinct from _actor then
    perform app.notify(v_academy, v_stu_user, _kind, jsonb_build_object(
      'report_id', _report_id,
      'role',      'student',
      'with_name', v_ins_name,
      'course',    v_course,
      'title',     v_title,
      'status',    v_status
    ));
  end if;

  if _instructor and v_ins_user is distinct from _actor then
    perform app.notify(v_academy, v_ins_user, _kind, jsonb_build_object(
      'report_id', _report_id,
      'role',      'instructor',
      'with_name', v_stu_name,
      'course',    v_course,
      'title',     v_title,
      'status',    v_status
    ));
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Who may act on this thread, and as what.
--
-- Returns 'student', 'instructor', 'admin' — or null, which every caller turns
-- into "Report not found". That message is reused for a trainer who is not the
-- checker on purpose, the same discipline as cancel_appointment: whether an id
-- exists is not something a colleague should be able to probe.
-- ---------------------------------------------------------------------------
create or replace function app.report_role(_report public.report_submissions)
returns text
language sql
stable
security definer
set search_path to ''
as $$
  select case
    when app.owns_student(_report.student_id)       then 'student'
    when app.owns_instructor(_report.instructor_id) then 'instructor'
    when app.is_admin(_report.academy_id)           then 'admin'
    else null
  end;
$$;

-- ---------------------------------------------------------------------------
-- Submit, or submit again.
--
-- One function for both because a resubmission is not a new thread: the checker
-- who asked for the changes is the person who should see them, and the history
-- of what was asked is the reason the thread exists. The version number is what
-- separates the generations.
-- ---------------------------------------------------------------------------
create or replace function public.submit_report(
  _academy_id uuid,
  _course_id  uuid,
  _title      text,
  _files      jsonb
) returns json
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_student uuid;
  v_name    text;
  v_report  public.report_submissions;
  v_id      uuid;
  v_version integer;
  v_event   uuid;
  v_cand    uuid;
  v_auto    boolean := false;
  v_file    jsonb;
  v_new     boolean;
begin
  if v_uid is null then raise exception 'You must be signed in'; end if;

  v_student := app.my_active_student(_academy_id);
  if v_student is null then
    raise exception 'You do not have a student record in this academy';
  end if;

  if jsonb_typeof(_files) <> 'array' or jsonb_array_length(_files) = 0 then
    raise exception 'Attach at least one file';
  end if;

  if coalesce(btrim(_title), '') = '' then
    raise exception 'Say what you are sending for checking';
  end if;

  -- The enrolment is the entitlement. 'completed' counts: a student finishing
  -- the course does not stop their final report needing a look.
  if not exists (
    select 1 from public.enrollments e
    where e.academy_id = _academy_id
      and e.course_id  = _course_id
      and e.student_id = v_student
      and e.status in ('active', 'completed')
  ) then
    raise exception 'You are not enrolled on that course';
  end if;

  select * into v_report
  from public.report_submissions r
  where r.academy_id = _academy_id
    and r.student_id = v_student
    and r.course_id  = _course_id;

  v_new := v_report.id is null;

  if v_new then
    -- The pool IS the switch: no checkers means the academy does not run this.
    select c.instructor_id into v_cand
    from app.report_checkers(_academy_id) c
    limit 1;
    if v_cand is null then
      raise exception 'This academy is not accepting reports for checking yet';
    end if;
    v_auto := true;

    insert into public.report_submissions (
      academy_id, student_id, course_id, instructor_id, title,
      status, version, auto_assigned, submitted_at, created_by
    ) values (
      _academy_id, v_student, _course_id, v_cand, btrim(_title),
      'submitted', 1, true, now(), v_uid
    )
    returning id, version into v_id, v_version;
  else
    if v_report.status = 'approved' then
      raise exception 'That report has already been approved';
    end if;
    v_id      := v_report.id;
    v_version := v_report.version + 1;

    update public.report_submissions
       set version      = v_version,
           status       = 'submitted',
           title        = btrim(_title),
           submitted_at = now()
     where id = v_id;
  end if;

  select s.full_name into v_name from public.students s where s.id = v_student;

  insert into public.report_events (
    academy_id, report_id, kind, to_status, version,
    actor_id, actor_name, actor_role
  ) values (
    _academy_id, v_id, 'submitted', 'submitted', v_version,
    v_uid, v_name, 'student'
  )
  returning id into v_event;

  for v_file in select * from jsonb_array_elements(_files) loop
    perform app.assert_own_upload(_academy_id, v_file ->> 'path');
    insert into public.report_files (
      academy_id, report_id, event_id, version,
      file_path, file_name, mime_type, size_bytes
    ) values (
      _academy_id, v_id, v_event, v_version,
      v_file ->> 'path',
      coalesce(nullif(btrim(v_file ->> 'name'), ''), 'document'),
      v_file ->> 'mime',
      nullif(v_file ->> 'size', '')::bigint
    );
  end loop;

  -- In the same transaction as the insert, which is what makes this more
  -- reliable than the email: if the submission exists, so does the notice.
  perform app.notify_report(v_id, 'report_submitted', v_uid, false, true);

  return json_build_object(
    'id', v_id,
    'version', v_version,
    'is_new', v_new,
    'auto_assigned', v_auto
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Say something, and optionally decide something.
--
-- One function rather than a comment RPC and a status RPC, because "please fix
-- section 3" and "changes requested" are one act by the person doing them, and
-- splitting them would let the status land without the sentence explaining it.
-- A verdict is staff-only; a student who sends one is IGNORED rather than
-- refused, the same way a student naming an instructor under round robin is —
-- deciding is simply not theirs to do.
-- ---------------------------------------------------------------------------
create or replace function public.comment_on_report(
  _report_id uuid,
  _body      text,
  _to_status public.report_status default null,
  _files     jsonb default null
) returns json
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_report public.report_submissions;
  v_role   text;
  v_name   text;
  v_status public.report_status;
  v_event  uuid;
  v_file   jsonb;
  v_body   text := nullif(btrim(_body), '');
begin
  if v_uid is null then raise exception 'You must be signed in'; end if;

  select * into v_report from public.report_submissions where id = _report_id;
  if v_report.id is null then raise exception 'Report not found'; end if;

  v_role := app.report_role(v_report);
  if v_role is null then raise exception 'Report not found'; end if;

  -- Staff decide; a student's _to_status is dropped on the floor.
  v_status := case when v_role = 'student' then null else _to_status end;

  if v_body is null and v_status is null
     and (jsonb_typeof(_files) is distinct from 'array'
          or jsonb_array_length(_files) = 0) then
    raise exception 'Write something first';
  end if;

  select p.full_name into v_name from public.profiles p where p.id = v_uid;

  insert into public.report_events (
    academy_id, report_id, kind, body, to_status,
    version, actor_id, actor_name, actor_role
  ) values (
    v_report.academy_id, _report_id,
    -- Cast explicitly. Both branches are unknown literals, so CASE resolves to
    -- text, and with search_path = '' there is no implicit text -> enum cast to
    -- rescue it: the insert fails at runtime, not at creation.
    case
      when v_body is null and v_status is not null
        then 'status'::public.report_event_kind
      else 'comment'::public.report_event_kind
    end,
    v_body, v_status,
    v_report.version, v_uid, v_name, v_role
  )
  returning id into v_event;

  if _files is not null and jsonb_typeof(_files) = 'array' then
    for v_file in select * from jsonb_array_elements(_files) loop
      perform app.assert_own_upload(v_report.academy_id, v_file ->> 'path');
      insert into public.report_files (
        academy_id, report_id, event_id, version,
        file_path, file_name, mime_type, size_bytes
      ) values (
        v_report.academy_id, _report_id, v_event, v_report.version,
        v_file ->> 'path',
        coalesce(nullif(btrim(v_file ->> 'name'), ''), 'document'),
        v_file ->> 'mime',
        nullif(v_file ->> 'size', '')::bigint
      );
    end loop;
  end if;

  update public.report_submissions
     set status      = coalesce(v_status, status),
         reviewed_at = case when v_role = 'student' then reviewed_at else now() end,
         approved_at = case when v_status = 'approved' then now() else approved_at end
   where id = _report_id;

  -- The other side, whichever that is. A status change with no comment still
  -- goes out: "approved" is the message.
  -- Cast for the same reason the kind above is cast: a CASE over two unknown
  -- literals is text, and search_path = '' leaves no implicit cast to the enum.
  perform app.notify_report(
    _report_id,
    case
      when v_status is null then 'report_comment'::public.notification_kind
      else 'report_status'::public.notification_kind
    end,
    v_uid,
    v_role <> 'student',
    v_role = 'student'
  );

  return json_build_object(
    'id', v_event,
    'status', coalesce(v_status, v_report.status),
    'role', v_role
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Hand it on.
--
-- Admin, or the checker who is holding it — the same pair the appointment
-- UPDATE policy uses, and for the same reason: "I cannot take this one" is a
-- statement only those two are in a position to make.
--
-- A null instructor means "the rota decides", and it EXCLUDES the current
-- holder: reassigning a report to the person already holding it is not a
-- handover. Unlike cancel_appointment there is no fallback — a report with
-- nobody free stays where it is and says so, because a report has no start time
-- to be stranded before.
-- ---------------------------------------------------------------------------
create or replace function public.reassign_report(
  _report_id     uuid,
  _instructor_id uuid default null
) returns json
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_report public.report_submissions;
  v_role   text;
  v_name   text;
  v_next   uuid;
  v_to     text;
begin
  if v_uid is null then raise exception 'You must be signed in'; end if;

  select * into v_report from public.report_submissions where id = _report_id;
  if v_report.id is null then raise exception 'Report not found'; end if;

  v_role := app.report_role(v_report);
  if v_role is null or v_role = 'student' then
    raise exception 'Report not found';
  end if;

  if _instructor_id is not null then
    if not exists (
      select 1 from app.report_checkers(v_report.academy_id) c
      where c.instructor_id = _instructor_id
    ) then
      raise exception 'That instructor does not check reports';
    end if;
    v_next := _instructor_id;
  else
    select c.instructor_id into v_next
    from app.report_checkers(v_report.academy_id) c
    where c.instructor_id is distinct from v_report.instructor_id
    limit 1;
    if v_next is null then
      raise exception 'Nobody else is available to check this report';
    end if;
  end if;

  if v_next = v_report.instructor_id then
    raise exception 'That report is already with them';
  end if;

  update public.report_submissions
     set instructor_id = v_next,
         auto_assigned = _instructor_id is null
   where id = _report_id;

  select i.full_name into v_to
  from public.instructors i where i.id = v_next;
  select p.full_name into v_name from public.profiles p where p.id = v_uid;

  insert into public.report_events (
    academy_id, report_id, kind, body, version,
    actor_id, actor_name, actor_role
  ) values (
    v_report.academy_id, _report_id, 'assigned', v_to, v_report.version,
    v_uid, v_name, v_role
  );

  -- Both: the incoming checker has work they did not have a moment ago, and the
  -- student is now dealing with somebody else. Same rule as
  -- appointment_reassigned, for the same reason.
  perform app.notify_report(_report_id, 'report_assigned', v_uid, true, true);

  return json_build_object('id', _report_id, 'instructor_id', v_next);
end;
$$;

-- ---------------------------------------------------------------------------
-- The whole thread, for whoever may read it.
--
-- An RPC and not four selects because it carries the instructor's name, and
-- `instructors` is not readable by a student — the same reason
-- get_my_appointments exists.
-- ---------------------------------------------------------------------------
create or replace function public.get_report(_report_id uuid)
returns json
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_report public.report_submissions;
  v_role   text;
begin
  select * into v_report from public.report_submissions where id = _report_id;
  if v_report.id is null then raise exception 'Report not found'; end if;

  v_role := app.report_role(v_report);
  if v_role is null then raise exception 'Report not found'; end if;

  return (
    select json_build_object(
      'id', r.id,
      'academy_id', r.academy_id,
      'title', r.title,
      'status', r.status,
      'version', r.version,
      'auto_assigned', r.auto_assigned,
      'submitted_at', r.submitted_at,
      'reviewed_at', r.reviewed_at,
      'approved_at', r.approved_at,
      'my_role', v_role,
      'student', json_build_object(
        'id', s.id, 'full_name', s.full_name, 'student_no', s.student_no,
        'email', s.email, 'phone', s.phone
      ),
      'course', json_build_object('id', c.id, 'title', c.title, 'code', c.code),
      'instructor', case when i.id is null then null else json_build_object(
        'id', i.id, 'full_name', i.full_name, 'avatar_url', i.avatar_url,
        'email', i.email
      ) end,
      'events', (
        select coalesce(json_agg(json_build_object(
          'id', e.id,
          'kind', e.kind,
          'body', e.body,
          'to_status', e.to_status,
          'version', e.version,
          'actor_id', e.actor_id,
          'actor_name', e.actor_name,
          'actor_role', e.actor_role,
          'created_at', e.created_at,
          'files', (
            select coalesce(json_agg(json_build_object(
              'id', f.id, 'file_name', f.file_name,
              'mime_type', f.mime_type, 'size_bytes', f.size_bytes
            ) order by f.created_at), '[]'::json)
            from public.report_files f where f.event_id = e.id
          )
        ) order by e.created_at), '[]'::json)
        from public.report_events e where e.report_id = r.id
      )
    )
    from public.report_submissions r
    join public.students s on s.id = r.student_id
    join public.courses  c on c.id = r.course_id
    left join public.instructors i on i.id = r.instructor_id
    where r.id = _report_id
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- The learner's own list.
--
-- Keyed on ENROLMENTS, not on reports, so a course with nothing submitted yet
-- is a row with a Submit button rather than an absence the student has to
-- interpret. Same argument as course_billing_roster starting from enrollments:
-- the thing you cannot see is the thing you came to find out about.
-- ---------------------------------------------------------------------------
create or replace function public.my_reports(_academy_id uuid)
returns json
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_student uuid := app.my_active_student(_academy_id);
  v_open    boolean;
begin
  if v_student is null then
    raise exception 'You do not have a student record in this academy';
  end if;

  select exists (select 1 from app.report_checkers(_academy_id)) into v_open;

  return json_build_object(
    'is_open', v_open,
    'courses', (
      select coalesce(json_agg(json_build_object(
        'course_id', c.id,
        'course_title', c.title,
        'course_code', c.code,
        'report', case when r.id is null then null else json_build_object(
          'id', r.id,
          'title', r.title,
          'status', r.status,
          'version', r.version,
          'submitted_at', r.submitted_at,
          'reviewed_at', r.reviewed_at,
          'instructor_name', i.full_name,
          'last_at', greatest(r.submitted_at, coalesce(r.reviewed_at, r.submitted_at))
        ) end
      ) order by c.title), '[]'::json)
      from public.enrollments e
      join public.courses c on c.id = e.course_id
      left join public.report_submissions r
        on r.academy_id = _academy_id
       and r.student_id = v_student
       and r.course_id  = c.id
      left join public.instructors i on i.id = r.instructor_id
      where e.academy_id = _academy_id
        and e.student_id = v_student
        and e.status in ('active', 'completed')
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- May the caller download this file?
--
-- The same shape as public.material_download, and for the same reason: the Edge
-- Function that signs the URL runs with the service role and has no RLS to lean
-- on, so this is the single place that decides. Zero rows means "not yours",
-- which is indistinguishable from "does not exist" and should stay that way.
-- ---------------------------------------------------------------------------
create or replace function public.report_download(_file_id uuid)
returns table (file_path text, file_name text, mime_type text)
language sql
stable
security definer
set search_path to ''
as $$
  select f.file_path, f.file_name, f.mime_type
  from public.report_files f
  join public.report_submissions r on r.id = f.report_id
  where f.id = _file_id
    and (
      app.is_admin(r.academy_id)
      or app.owns_instructor(r.instructor_id)
      or app.owns_student(r.student_id)
    );
$$;

-- ---------------------------------------------------------------------------
-- Grants. Internal helpers stay off PostgREST entirely.
-- ---------------------------------------------------------------------------
revoke all on function app.my_active_student(uuid) from public, anon, authenticated;
revoke all on function app.assert_own_upload(uuid, text) from public, anon, authenticated;
revoke all on function app.report_checkers(uuid) from public, anon, authenticated;
revoke all on function app.notify_report(uuid, public.notification_kind, uuid, boolean, boolean)
  from public, anon, authenticated;
revoke all on function app.report_role(public.report_submissions) from public, anon, authenticated;

revoke all on function public.submit_report(uuid, uuid, text, jsonb) from public, anon;
revoke all on function public.comment_on_report(uuid, text, public.report_status, jsonb) from public, anon;
revoke all on function public.reassign_report(uuid, uuid) from public, anon;
revoke all on function public.get_report(uuid) from public, anon;
revoke all on function public.my_reports(uuid) from public, anon;
revoke all on function public.report_download(uuid) from public, anon;

grant execute on function public.submit_report(uuid, uuid, text, jsonb) to authenticated;
grant execute on function public.comment_on_report(uuid, text, public.report_status, jsonb) to authenticated;
grant execute on function public.reassign_report(uuid, uuid) to authenticated;
grant execute on function public.get_report(uuid) to authenticated;
grant execute on function public.my_reports(uuid) to authenticated;
grant execute on function public.report_download(uuid) to authenticated;
