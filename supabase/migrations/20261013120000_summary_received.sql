-- A summary is received by itself.
--
-- In an academy with a system admin, a report waits for a staff-only entry
-- before its checker is told (20261009100000). That entry is the copy the
-- checker starts from, and a summary has no document to make one of — it is
-- four fields of text, and since today takes no attachments. So every summary
-- sent, first time or again, gets the entry at once: body "Diterima.", no name,
-- staff-only. What follows is exactly what follows a system admin adding one
-- (public.comment_on_report): nothing on the report moves, the student is not
-- told and cannot read it, the checker is told, and staff read the report as
-- "pending trainer approval" rather than "moderating". The system admins are
-- not told about a summary, since there is nothing left for them to do.
--
-- The report and the slides are unchanged, and so is an academy with no system
-- admin, where the checker was already told at once.
-- Full note: docs/report-checks.md -> "The copy a checker starts from".

create or replace function app.submit_report_impl(
  _academy_id uuid,
  _course_id uuid,
  _title text,
  _introduction text,
  _objectives text,
  _problem_statement text,
  _files jsonb,
  _stage public.lpkc_stage
)
returns json
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

  select * into v_report
  from public.report_submissions r
  where r.academy_id = _academy_id
    and r.student_id = v_student
    and r.course_id  = _course_id
    and r.lpkc_stage = v_stage;

  v_new := v_report.id is null;

  if v_new then
    -- Starting a part needs the course to be taking it. Carrying on with one
    -- already started does not: closing a part must not strand a student
    -- halfway through their corrections.
    if not exists (
      select 1 from public.courses c
      where c.id = _course_id
        and c.academy_id = _academy_id
        and v_stage = any (c.lpkc_stages)
    ) then
      raise exception 'This course is not taking that part of the LPKC yet';
    end if;

    -- Whoever checks this student's other part of the same project keeps the
    -- student, while they are still checking. Otherwise the rota decides.
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
    v_auto := true;

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

  if v_stage = 'summary' and exists (
    select 1 from public.academy_members m
    where m.academy_id = _academy_id
      and m.status = 'active'
      and m.role = 'admin'
      and m.is_system_admin
  ) then
    -- A summary is text, so there is no copy to prepare for the checker: the
    -- staff-only entry a system admin would have added is added here, with
    -- everything that follows from one — the report stays as it is, the
    -- student neither sees nor hears of it, and the checker is told now.
    -- clock_timestamp(), so it sorts after the entry it answers; now() is the
    -- same instant for both.
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
    'is_new', v_new,
    'auto_assigned', v_auto,
    'lpkc_stage', v_stage
  );
end;
$$;
