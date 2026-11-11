-- LPKC slides need the report (Nov 2026, the owner): a student with no LPKC
-- report thread on the course cannot send slides. The clients hide the slides'
-- Send until the report is there; this is the rule for every door, installed
-- app builds included. See docs/report-checks.md.

create or replace function app.submit_report_impl(
  _academy_id uuid, _course_id uuid, _title text, _introduction text,
  _objectives text, _problem_statement text, _files jsonb,
  _stage public.lpkc_stage
)
returns json
language plpgsql
security definer
set search_path = ''
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
  v_file    jsonb;
  v_stage   public.lpkc_stage;
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

  if jsonb_typeof(v_files) <> 'array' then
    raise exception 'Files must be a list';
  end if;

  if coalesce(btrim(_title), '') = '' then
    raise exception 'Say what you are sending for checking';
  end if;

  if not exists (
    select 1 from public.enrollments e
    where e.academy_id = _academy_id
      and e.course_id  = _course_id
      and e.student_id = v_student
      and e.status in ('active', 'completed')
  ) then
    raise exception 'You are not enrolled on that course';
  end if;

  v_stage := coalesce(_stage, app.lpkc_legacy_stage(_course_id, v_student));
  if v_stage is null then
    raise exception 'This course is not taking LPKC submissions yet';
  end if;

  -- Whichever door this came through, the part decides what it may carry.
  perform app.assert_lpkc_files(v_stage, v_files);

  select * into v_report
  from public.report_submissions r
  where r.academy_id = _academy_id
    and r.student_id = v_student
    and r.course_id  = _course_id
    and r.lpkc_stage = v_stage;

  -- One send per part: there is no version 2.
  if v_report.id is not null then
    raise exception 'This part of the LPKC has already been sent';
  end if;

  -- The slides are made from the report, so they wait for it.
  if v_stage = 'slide' and not exists (
    select 1 from public.report_submissions r
    where r.academy_id = _academy_id
      and r.student_id = v_student
      and r.course_id  = _course_id
      and r.lpkc_stage = 'report'
  ) then
    raise exception 'Send the LPKC report first';
  end if;

  if not exists (
    select 1 from public.courses c
    where c.id = _course_id
      and c.academy_id = _academy_id
      and v_stage = any (c.lpkc_stages)
  ) then
    raise exception 'This course is not taking that part of the LPKC yet';
  end if;

  select r.instructor_id into v_cand
  from public.report_submissions r
  where r.academy_id = _academy_id
    and r.student_id = v_student
    and r.course_id  = _course_id
    and r.instructor_id in (
      select c.instructor_id from app.report_checkers(_academy_id) c
    )
  order by r.submitted_at desc, r.id
  limit 1;

  if v_cand is null then
    select c.instructor_id into v_cand
    from app.report_checkers(_academy_id) c
    limit 1;
  end if;
  if v_cand is null then
    raise exception 'This academy is not accepting reports for checking yet';
  end if;

  insert into public.report_submissions (
    academy_id, student_id, course_id, lpkc_stage, instructor_id, title,
    introduction, objectives, problem_statement,
    status, version, auto_assigned, submitted_at, created_by
  ) values (
    _academy_id, v_student, _course_id, v_stage, v_cand, btrim(_title),
    v_intro, v_obj, v_problem,
    'in_review', 1, true, now(), v_uid
  )
  returning id, version into v_id, v_version;

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

  if v_stage = 'summary' and exists (
    select 1 from public.academy_members m
    where m.academy_id = _academy_id
      and m.status = 'active'
      and m.role = 'admin'
      and m.is_system_admin
  ) then
    insert into public.report_events (
      academy_id, report_id, kind, body, version,
      actor_id, actor_name, actor_role, staff_only, created_at
    ) values (
      _academy_id, v_id, 'comment', 'Diterima.', v_version,
      null, null, 'system', true, clock_timestamp()
    );
    perform app.notify_report(v_id, 'report_submitted', v_uid, false, true);
  elsif app.notify_report_system_admins(v_id, v_uid) = 0 then
    perform app.notify_report(v_id, 'report_submitted', v_uid, false, true);
  end if;

  return json_build_object(
    'id', v_id,
    'version', v_version,
    'is_new', true,
    'auto_assigned', true,
    'lpkc_stage', v_stage
  );
end;
$$;
