-- ============================================================================
-- A report states what it is before it is sent
-- ----------------------------------------------------------------------------
-- A student sending a report for checking now gives four things, not one:
--
--     Title (Tajuk)               -> report_submissions.title   (already there)
--     Introduction (Pengenalan)   -> report_submissions.introduction
--     Objectives (Objektif)       -> report_submissions.objectives
--     Problem statement           -> report_submissions.problem_statement
--       (Penyata Masalah)
--
-- They live on the thread, beside `title`, because a report is one thread per
-- (student, course) and these describe the work, not one version of it. Sending
-- a new version shows the current text and lets the student change it.
--
-- Reports sent before this have the three new columns null and are left alone;
-- they are asked for them the next time the student sends a new version.
--
-- THE LEGACY SIGNATURE STAYS. The Student mobile app that is already installed
-- calls submit_report(_academy_id, _course_id, _title, _files) and has no
-- fields for the new three. Dropping it would stop those students sending
-- anything until they update, so it is kept as a thin wrapper that passes the
-- new fields as null (and keeps whatever the thread already holds). The 7-arg
-- overload has no defaults on purpose, so a 4-arg call can only ever resolve
-- to the legacy one and PostgREST never sees an ambiguous candidate.
--
-- Full note: docs/report-checks.md
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The columns
-- ---------------------------------------------------------------------------
alter table public.report_submissions
  add column if not exists introduction     text,
  add column if not exists objectives       text,
  add column if not exists problem_statement text;

alter table public.report_submissions
  add constraint report_submissions_introduction_len
    check (introduction is null or char_length(introduction) <= 5000),
  add constraint report_submissions_objectives_len
    check (objectives is null or char_length(objectives) <= 5000),
  add constraint report_submissions_problem_statement_len
    check (problem_statement is null or char_length(problem_statement) <= 5000);

-- ---------------------------------------------------------------------------
-- 2. One implementation of "submit, or submit again"
--
-- The body of submit_report as it stood, plus the three fields. A null field
-- leaves what the thread already holds in place; presence is enforced by the
-- public overload, not here, so the legacy one can reuse the rest.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 3. The door the web app uses: all four things, required.
-- ---------------------------------------------------------------------------
create or replace function public.submit_report(
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
begin
  if coalesce(btrim(_title), '') = '' then
    raise exception 'Say what you are sending for checking';
  end if;
  if coalesce(btrim(_introduction), '') = '' then
    raise exception 'Write an introduction';
  end if;
  if coalesce(btrim(_objectives), '') = '' then
    raise exception 'Write the objectives';
  end if;
  if coalesce(btrim(_problem_statement), '') = '' then
    raise exception 'Write the problem statement';
  end if;

  return app.submit_report_impl(
    _academy_id, _course_id, _title,
    _introduction, _objectives, _problem_statement, _files
  );
end;
$$;

revoke all on function public.submit_report(uuid, uuid, text, text, text, text, jsonb)
  from public, anon;
grant execute on function public.submit_report(uuid, uuid, text, text, text, text, jsonb)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The legacy door, for app builds that do not ask for the three fields.
--    Same signature as before, so its grants are untouched. Remove it once the
--    Student app that sends the fields has shipped.
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
begin
  return app.submit_report_impl(
    _academy_id, _course_id, _title, null, null, null, _files
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Reading it back
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
      'introduction', r.introduction,
      'objectives', r.objectives,
      'problem_statement', r.problem_statement,
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
        select coalesce(json_agg(
          jsonb_build_object(
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
              select coalesce(jsonb_agg(jsonb_build_object(
                'id', f.id, 'file_name', f.file_name,
                'mime_type', f.mime_type, 'size_bytes', f.size_bytes
              ) order by f.created_at), '[]'::jsonb)
              from public.report_files f where f.event_id = e.id
            )
          )
          || case
               when v_role = 'student' then '{}'::jsonb
               else jsonb_build_object('staff_only', e.staff_only)
             end
          order by e.created_at
        ), '[]'::json)
        from public.report_events e
        where e.report_id = r.id
          and (v_role <> 'student' or not e.staff_only)
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

-- The learner's list carries the three fields so the "send a new version"
-- dialog can start from what is already on the thread.
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
          'introduction', r.introduction,
          'objectives', r.objectives,
          'problem_statement', r.problem_statement,
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
