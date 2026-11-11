-- LPKC: one send per part, and three stages (Nov 2026, the owner).
--
-- 1. No versions. A part of the LPKC (summary, report, slides) is sent once.
--    submit_report refuses a second send on a thread that exists, and a
--    student's reply may no longer carry a document (it used to become the
--    next version). Staff still attach — the corrected copy arrives that way.
-- 2. A student's reply never moves the status. Once the corrected copy and the
--    trainer's reply are there the thread reads "Correction complete"
--    (`changes_requested`, relabelled in the clients) and stays so; a
--    question from the student still reaches the checker.
-- 3. "Pending trainer approval" is gone. Staff read `moderating` for
--    everything still `in_review` in an academy with a system admin; an
--    academy with none reads its plain `in_review` (the checker's turn there).
--
-- See docs/report-checks.md.

-- 3 ---------------------------------------------------------------------------
create or replace function public.report_stage(_r public.report_submissions)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when x.role is null     then null
    when x.role = 'student' then s.status::text
    when s.status in ('changes_requested', 'approved') then s.status::text
    when exists (
      select 1
      from public.academy_members m
      where m.academy_id = s.academy_id
        and m.status = 'active'
        and m.role = 'admin'
        and m.is_system_admin
    ) then 'moderating'
    else s.status::text
  end
  from public.report_submissions s
  cross join lateral (select app.report_role(s) as role) x
  where s.id = _r.id;
$$;

create or replace function public.report_stage_rank(_r public.report_submissions)
returns integer
language sql
stable
set search_path = ''
as $$
  select case public.report_stage(_r)
    when 'moderating'        then 1
    when 'in_review'         then 2
    when 'submitted'         then 2
    when 'changes_requested' then 3
    when 'approved'          then 4
    else 5
  end;
$$;

-- 1 ---------------------------------------------------------------------------
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

-- 1 + 2 -----------------------------------------------------------------------
create or replace function public.comment_on_report(
  _report_id uuid,
  _body text,
  _to_status public.report_status default null,
  _files jsonb default null
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_report   public.report_submissions;
  v_role     text;
  v_name     text;
  v_explicit public.report_status;
  v_handoff  boolean;
  v_waiting  boolean;
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

  -- One send per part: a student's document came with the send, never later.
  if v_role = 'student' and v_files then
    raise exception 'Documents are sent once, with the LPKC itself';
  end if;

  v_explicit := case when v_role = 'student' then null else _to_status end;

  v_handoff := v_role = 'admin'
               and v_explicit is null
               and app.is_system_admin(v_report.academy_id);

  v_waiting := v_role = 'student'
               and v_report.status = 'in_review'
               and not exists (
                 select 1 from public.report_events e
                 where e.report_id = _report_id
                   and e.version   = v_report.version
                   and e.staff_only
               );

  -- A student's reply never moves the status: a question after the
  -- correction is complete leaves it complete.
  v_next := case
    when v_explicit is not null       then v_explicit
    when v_handoff                    then v_report.status
    when v_report.status = 'approved' then v_report.status
    when v_role = 'student'           then v_report.status
    else 'changes_requested'::public.report_status
  end;

  v_status := case when v_next is distinct from v_report.status then v_next end;

  if v_body is null and not v_files
     and (v_explicit is null or v_status is null) then
    raise exception 'Write something first';
  end if;

  select p.full_name into v_name from public.profiles p where p.id = v_uid;

  insert into public.report_events (
    academy_id, report_id, kind, body, to_status,
    version, actor_id, actor_name, actor_role, staff_only
  ) values (
    v_report.academy_id, _report_id,
    case
      when v_body is null and not v_files
        then 'status'::public.report_event_kind
      else 'comment'::public.report_event_kind
    end,
    v_body, v_status,
    v_report.version, v_uid,
    case when v_handoff then null else v_name end,
    case when v_handoff then 'system' else v_role end,
    v_handoff
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

  if v_handoff then
    perform app.notify_report(_report_id, 'report_submitted', v_uid, false, true);
  else
    update public.report_submissions
       set status      = v_next,
           reviewed_at = case when v_role = 'student' then reviewed_at else now() end,
           approved_at = case when v_status = 'approved' then now() else approved_at end
     where id = _report_id;

    -- Two IFs, not one AND: SQL does not promise to stop at a false v_waiting.
    if v_waiting then
      v_waiting := app.notify_report_admins(_report_id, v_uid, 'report_comment') > 0;
    end if;

    if not v_waiting then
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
    end if;
  end if;

  return json_build_object(
    'id', v_event,
    'status', v_next,
    'role', v_role
  );
end;
$$;
