-- Which files a student may send on each part of the LPKC, and who is told
-- when they send them.
--
-- 1. A part takes its own kind of file. The summary takes none, the report a
--    PDF or Word document, the slides a PowerPoint or a PDF. Checked on every
--    door a student's file comes through: the three submit_report overloads
--    (all through app.submit_report_impl) and the reply box
--    (comment_on_report). Staff are not limited.
--
-- 2. A student's file is always a new version. A reply that carries a file
--    used to be filed as a comment on the version already there, so the
--    documents of "version 2" were not all of what the student had sent for
--    it, and the checker was told instead of the system admins. It is now the
--    next version: the same entry, status and notice as sending again.
--
-- 3. A student's reply before the system admins have added their copy goes to
--    them, not to the checker. The checker is told when the copy arrives,
--    whatever the student wrote in between.
--
-- Full note: docs/report-checks.md -> "What each part takes".

-- ---------------------------------------------------------------------------
-- 1. The rule
-- ---------------------------------------------------------------------------

create function app.assert_lpkc_files(_stage public.lpkc_stage, _files jsonb)
returns void
language plpgsql
immutable
set search_path to ''
as $$
declare
  v_ext text;
begin
  if _files is null
     or jsonb_typeof(_files) <> 'array'
     or jsonb_array_length(_files) = 0 then
    return;
  end if;

  if _stage = 'summary' then
    raise exception 'The LPKC summary takes no documents';
  end if;

  -- By the name's extension: it is what the checker downloads and opens. The
  -- browser's mime type for a .docx or .pptx varies by machine, the name does
  -- not.
  for v_ext in
    select coalesce(
             lower(substring(btrim(f ->> 'name') from '\.([A-Za-z0-9]+)$')),
             ''
           )
    from jsonb_array_elements(_files) f
  loop
    if _stage = 'report' and v_ext not in ('pdf', 'doc', 'docx') then
      raise exception 'The LPKC report takes a PDF or Word document';
    end if;
    if _stage = 'slide' and v_ext not in ('pdf', 'ppt', 'pptx') then
      raise exception 'The LPKC slides take a PowerPoint or PDF file';
    end if;
  end loop;
end;
$$;

revoke all on function app.assert_lpkc_files(public.lpkc_stage, jsonb)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. The system admins, told of any kind of entry
-- ---------------------------------------------------------------------------

create function app.notify_report_admins(
  _report_id uuid,
  _actor uuid,
  _kind public.notification_kind
)
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_academy  uuid;
  v_title    text;
  v_status   public.report_status;
  v_course   text;
  v_stu_name text;
  v_user     uuid;
  v_n        integer := 0;
begin
  select r.academy_id, r.title, r.status, c.title, s.full_name
    into v_academy, v_title, v_status, v_course, v_stu_name
  from public.report_submissions r
  join public.students s on s.id = r.student_id
  join public.courses  c on c.id = r.course_id
  where r.id = _report_id;

  if v_academy is null then return 0; end if;

  for v_user in
    select m.user_id
    from public.academy_members m
    where m.academy_id = v_academy
      and m.status = 'active'
      and m.role = 'admin'
      and m.is_system_admin
      and m.user_id is distinct from _actor
  loop
    perform app.notify(v_academy, v_user, _kind, jsonb_build_object(
      'report_id', _report_id,
      'role',      'instructor',
      'with_name', v_stu_name,
      'course',    v_course,
      'title',     v_title,
      'status',    v_status
    ));
    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$$;

revoke all on function app.notify_report_admins(uuid, uuid, public.notification_kind)
  from public, anon, authenticated;

create or replace function app.notify_report_system_admins(_report_id uuid, _actor uuid)
returns integer
language sql
security definer
set search_path to ''
as $$
  select app.notify_report_admins(_report_id, _actor, 'report_submitted');
$$;

-- ---------------------------------------------------------------------------
-- 3. Sending: every door checks the part's files
-- ---------------------------------------------------------------------------

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

  -- Whichever door this came through, the part decides what it may carry.
  perform app.assert_lpkc_files(v_stage, v_files);

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

-- ---------------------------------------------------------------------------
-- 4. Replying
-- ---------------------------------------------------------------------------

create or replace function public.comment_on_report(
  _report_id uuid,
  _body text,
  _to_status public.report_status default null,
  _files jsonb default null
)
returns json
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
  v_handoff  boolean;
  v_waiting  boolean;
  v_next     public.report_status;
  v_status   public.report_status;
  v_event    uuid;
  v_version  integer;
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

  -- A student's file is the next version, not a comment on this one: the
  -- documents of a version are then everything sent for it, and it goes
  -- where a version goes — to the system admins first. The same entry,
  -- status and notice as sending again; the title and the summary's fields
  -- stay as they are.
  if v_role = 'student' and v_files then
    perform app.assert_lpkc_files(v_report.lpkc_stage, _files);
    if v_report.status = 'approved' then
      raise exception 'That report has already been approved';
    end if;

    v_version := v_report.version + 1;

    update public.report_submissions
       set version      = v_version,
           status       = 'in_review',
           submitted_at = now()
     where id = _report_id;

    select s.full_name into v_name
    from public.students s where s.id = v_report.student_id;

    insert into public.report_events (
      academy_id, report_id, kind, body, to_status, version,
      actor_id, actor_name, actor_role
    ) values (
      v_report.academy_id, _report_id, 'submitted', v_body, 'in_review',
      v_version, v_uid, v_name, 'student'
    )
    returning id into v_event;

    for v_file in select * from jsonb_array_elements(_files) loop
      perform app.assert_own_upload(v_report.academy_id, v_file ->> 'path');
      insert into public.report_files (
        academy_id, report_id, event_id, version,
        file_path, file_name, mime_type, size_bytes
      ) values (
        v_report.academy_id, _report_id, v_event, v_version,
        v_file ->> 'path',
        coalesce(nullif(btrim(v_file ->> 'name'), ''), 'document'),
        v_file ->> 'mime',
        nullif(v_file ->> 'size', '')::bigint
      );
    end loop;

    if app.notify_report_system_admins(_report_id, v_uid) = 0 then
      perform app.notify_report(_report_id, 'report_submitted', v_uid, false, true);
    end if;

    return json_build_object(
      'id', v_event,
      'status', 'in_review',
      'role', v_role
    );
  end if;

  -- Staff may decide; a student's _to_status is ignored.
  v_explicit := case when v_role = 'student' then null else _to_status end;

  -- A system admin who is not the checker writes for the checker, not for the
  -- student: the copy the checker starts from. It is not a reply, so it moves
  -- nothing, the student is not told and cannot read it — and it is the moment
  -- the checker is told. A decision (approve, reopen) is still a decision.
  v_handoff := v_role = 'admin'
               and v_explicit is null
               and app.is_system_admin(v_report.academy_id);

  -- Still waiting for the system admins' copy: being checked, and nothing
  -- staff-only on this version yet. What the student says now is for them;
  -- the checker hears of the report when the copy arrives.
  v_waiting := v_role = 'student'
               and v_report.status = 'in_review'
               and not exists (
                 select 1 from public.report_events e
                 where e.report_id = _report_id
                   and e.version   = v_report.version
                   and e.staff_only
               );

  -- Where the report stands after this. A decision wins; otherwise the status
  -- follows whoever is speaking, and an approved report stays approved.
  v_next := case
    when v_explicit is not null       then v_explicit
    when v_handoff                    then v_report.status
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
    version, actor_id, actor_name, actor_role, staff_only
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
    v_report.version, v_uid,
    -- The copy carries no name: it is a document for the checker, not a
    -- message from somebody.
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
    -- Nothing on the report itself changes — not the status, and not
    -- reviewed_at, which the student's own list reads as "last activity".
    -- The checker is told as they would have been when the report came in.
    perform app.notify_report(_report_id, 'report_submitted', v_uid, false, true);
  else
    update public.report_submissions
       set status      = v_next,
           reviewed_at = case when v_role = 'student' then reviewed_at else now() end,
           approved_at = case when v_status = 'approved' then now() else approved_at end
     where id = _report_id;

    -- The other side, whichever that is. A reply that moved the status on its
    -- own is told as a reply — that is what the reader has to go and read.
    -- Only a decision (approve, reopen) is told as a status. A student still
    -- waiting on the copy is heard by the system admins; with none, the
    -- checker as before.
    -- Two IFs, not one AND: SQL does not promise to stop at a false v_waiting,
    -- and the call notifies as it is evaluated.
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
