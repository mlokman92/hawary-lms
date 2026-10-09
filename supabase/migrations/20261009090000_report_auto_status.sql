-- The status of a report follows whoever spoke last.
--
-- Until now a checker chose "Being checked" or "Changes needed" by hand, and a
-- fresh upload sat in `submitted` ("Waiting") until somebody pressed one. The
-- owner asked for the flow to run itself:
--
--   the student sends anything (a version, a reply)  -> in_review
--   the academy sends anything (a reply, a file)     -> changes_requested
--   Approve stays a decision somebody makes          -> approved
--
-- So the status now answers one question — whose turn is it — and nobody has to
-- remember to move it. `submitted` stays in the enum (old timeline entries carry
-- it) but nothing writes it any more.
--
-- `approved` is sticky: a "well done" after approval must not reopen the
-- report, so the automatic rule leaves an approved report alone. Staff can
-- still pass `_to_status` explicitly — that is how Approve and Reopen work, and
-- it is what the three verdict buttons in app builds already installed send.
--
-- Full note: docs/report-checks.md

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
      'in_review', 1, true, now(), v_uid
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
           status       = 'in_review',
           title        = btrim(_title),
           submitted_at = now()
     where id = v_id;
  end if;

  select s.full_name into v_name from public.students s where s.id = v_student;

  insert into public.report_events (
    academy_id, report_id, kind, to_status, version,
    actor_id, actor_name, actor_role
  ) values (
    _academy_id, v_id, 'submitted', 'in_review', v_version,
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
  v_uid      uuid := (select auth.uid());
  v_report   public.report_submissions;
  v_role     text;
  v_name     text;
  v_explicit public.report_status;
  v_next     public.report_status;
  v_status   public.report_status;
  v_event    uuid;
  v_file     jsonb;
  v_body     text := nullif(btrim(_body), '');
  v_files    boolean := _files is not null
                        and jsonb_typeof(_files) = 'array'
                        and jsonb_array_length(_files) > 0;
begin
  if v_uid is null then raise exception 'You must be signed in'; end if;

  select * into v_report from public.report_submissions where id = _report_id;
  if v_report.id is null then raise exception 'Report not found'; end if;

  v_role := app.report_role(v_report);
  if v_role is null then raise exception 'Report not found'; end if;

  -- Staff may decide; a student's _to_status is dropped on the floor.
  v_explicit := case when v_role = 'student' then null else _to_status end;

  -- Where the report stands after this. A decision wins; otherwise the status
  -- follows whoever is speaking, and an approved report stays approved.
  v_next := case
    when v_explicit is not null       then v_explicit
    when v_report.status = 'approved' then v_report.status
    when v_role = 'student'           then 'in_review'::public.report_status
    else 'changes_requested'::public.report_status
  end;

  -- What the timeline entry records: the move, or nothing if nothing moved.
  v_status := case when v_next is distinct from v_report.status then v_next end;

  -- Only a decision may arrive with nothing said. Without this an empty post
  -- would be a way to flip the status back and forth.
  if v_body is null and not v_files
     and (v_explicit is null or v_status is null) then
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
      when v_body is null and not v_files
        then 'status'::public.report_event_kind
      else 'comment'::public.report_event_kind
    end,
    v_body, v_status,
    v_report.version, v_uid, v_name, v_role
  )
  returning id into v_event;

  if v_files then
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
     set status      = v_next,
         reviewed_at = case when v_role = 'student' then reviewed_at else now() end,
         approved_at = case when v_status = 'approved' then now() else approved_at end
   where id = _report_id;

  -- The other side, whichever that is. A reply that moved the status on its own
  -- is told as a reply — that is what the reader has to go and read. Only a
  -- decision (approve, reopen) is told as a status.
  perform app.notify_report(
    _report_id,
    case
      when v_explicit is not null and v_status is not null
        then 'report_status'::public.notification_kind
      else 'report_comment'::public.notification_kind
    end,
    v_uid,
    v_role <> 'student',
    v_role = 'student'
  );

  return json_build_object(
    'id', v_event,
    'status', v_next,
    'role', v_role
  );
end;
$$;
