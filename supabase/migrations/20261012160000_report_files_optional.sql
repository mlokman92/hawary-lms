-- ============================================================================
-- Documents are optional when sending a report
-- ----------------------------------------------------------------------------
-- A report now says what it is in four typed fields (title, introduction,
-- objectives, problem statement — 20261012110000_report_brief.sql), so a send
-- with no document is a complete thing to send. `submit_report` used to raise
-- "Attach at least one file"; it no longer does. A null or empty list is a send
-- with no documents: the thread still gets its `submitted` entry, its version
-- and its notice, and documents can follow as a reply.
--
-- Only the shared implementation changes. Both public overloads call it, so the
-- 7-argument door and the legacy 4-argument one agree.
-- ============================================================================
create or replace function app.submit_report_impl(
  _academy_id        uuid,
  _course_id         uuid,
  _title             text,
  _introduction      text,
  _objectives        text,
  _problem_statement text,
  _files             jsonb
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
  v_intro   text := nullif(btrim(_introduction), '');
  v_obj     text := nullif(btrim(_objectives), '');
  v_problem text := nullif(btrim(_problem_statement), '');
  v_files   jsonb := coalesce(_files, '[]'::jsonb);
begin
  if v_uid is null then raise exception 'You must be signed in'; end if;

  v_student := app.my_active_student(_academy_id);
  if v_student is null then
    raise exception 'You do not have a student record in this academy';
  end if;

  -- Documents are optional; what is sent must still be a list.
  if jsonb_typeof(v_files) <> 'array' then
    raise exception 'Files must be a list';
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
      introduction, objectives, problem_statement,
      status, version, auto_assigned, submitted_at, created_by
    ) values (
      _academy_id, v_student, _course_id, v_cand, btrim(_title),
      v_intro, v_obj, v_problem,
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
       set version           = v_version,
           status            = 'in_review',
           title             = btrim(_title),
           introduction      = coalesce(v_intro, introduction),
           objectives        = coalesce(v_obj, objectives),
           problem_statement = coalesce(v_problem, problem_statement),
           submitted_at      = now()
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

  for v_file in select * from jsonb_array_elements(v_files) loop
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
  -- The system admins hear first; the checker is told when the copy is added
  -- (comment_on_report). With no system admin, the checker is told now.
  if app.notify_report_system_admins(v_id, v_uid) = 0 then
    perform app.notify_report(v_id, 'report_submitted', v_uid, false, true);
  end if;

  return json_build_object(
    'id', v_id,
    'version', v_version,
    'is_new', v_new,
    'auto_assigned', v_auto
  );
end;
$$;

revoke all on function app.submit_report_impl(uuid, uuid, text, text, text, text, jsonb)
  from public, anon, authenticated;
