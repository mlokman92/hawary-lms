-- A student sends each part of the LPKC on its own, and a course can have more
-- than one part open at once.
--
-- 20261013100000 gave a course ONE stage. That was the wrong shape: Siri 1 and
-- Siri 2 are sending the report and the slides side by side, and each has to be
-- checked and approved for itself. So:
--
--   courses.lpkc_stages            a set — which parts the course is taking
--   report_submissions.lpkc_stage  which part one thread is
--   one thread per (student, course, stage), where it was (student, course)
--
-- Every app build already installed keeps working: the two existing
-- submit_report overloads and my_reports' `report` key carry on with whatever
-- the student has open (app.lpkc_legacy_stage). Naming a stage is a new,
-- third overload.
-- Full note: docs/report-checks.md -> "The parts of an LPKC".

-- ---------------------------------------------------------------------------
-- 1. The course: a set of stages
-- ---------------------------------------------------------------------------

alter table public.courses alter column lpkc_stage set default null;
alter table public.courses
  alter column lpkc_stage type public.lpkc_stage[] using array[lpkc_stage];
alter table public.courses rename column lpkc_stage to lpkc_stages;
alter table public.courses alter column lpkc_stages set default '{summary}';

comment on column public.courses.lpkc_stages is
  'The parts of the LPKC this course''s students can send. Empty: none yet. Set by an admin.';

create or replace function app.guard_course_lpkc_stage()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  -- Kept in the order the parts are produced, each at most once, whoever
  -- writes it — so two courses taking the same parts compare equal.
  new.lpkc_stages := array(
    select s
    from unnest(enum_range(null::public.lpkc_stage)) as s
    where s = any (new.lpkc_stages)
  );

  -- The owner in SQL, and SECURITY DEFINER work with no JWT behind it.
  if (select auth.uid()) is null then return new; end if;

  if app.is_admin(new.academy_id) then return new; end if;

  -- A course a trainer creates (or duplicates) starts at the first part.
  if tg_op = 'INSERT'
     and new.lpkc_stages <> array['summary']::public.lpkc_stage[] then
    raise exception 'Only an admin can set a course''s LPKC stages';
  end if;
  if tg_op = 'UPDATE' and new.lpkc_stages is distinct from old.lpkc_stages then
    raise exception 'Only an admin can set a course''s LPKC stages';
  end if;
  return new;
end;
$$;

-- Where the three intakes are today: Siri 1 and 2 send the report and the
-- slides; Siri 3 keeps the default, the summary.
update public.courses c
   set lpkc_stages = '{report,slide}'
  from public.academies a
 where a.id = c.academy_id
   and a.slug = 'hawary-academy'
   and c.title in ('DKM Prasekolah Siri 1/2026', 'DKM Prasekolah Siri 2/2026');

-- ---------------------------------------------------------------------------
-- 2. The thread: which part it is
-- ---------------------------------------------------------------------------

alter table public.report_submissions
  add column lpkc_stage public.lpkc_stage not null default 'summary';

-- What was sent before there were parts. A course on the summary has summaries;
-- the others sent the report, with the slides beside it on the same thread —
-- those stay where they are, and slides sent from now on get their own.
update public.report_submissions r
   set lpkc_stage = 'report'
  from public.courses c
 where c.id = r.course_id
   and not ('summary' = any (c.lpkc_stages));

-- Named by the caller from here on; there is no part a thread is "by default".
alter table public.report_submissions alter column lpkc_stage set default null;

comment on column public.report_submissions.lpkc_stage is
  'Which part of the LPKC this thread is. One thread per (student, course, part).';

alter table public.report_submissions
  add constraint report_submissions_one_per_stage
  unique (academy_id, student_id, course_id, lpkc_stage);

alter table public.report_submissions
  drop constraint report_submissions_one_per_course;

-- ---------------------------------------------------------------------------
-- 3. Which part a build that does not name one means
-- ---------------------------------------------------------------------------

-- The earliest part the student is in the middle of; failing that, the first
-- part the course is taking that they have not started; failing that, the
-- latest part they finished. Null when the course takes nothing and they have
-- sent nothing. By part, not by date, so the one report an older build shows
-- does not change under the student each time they send the other one.
create function app.lpkc_legacy_stage(_course_id uuid, _student_id uuid)
returns public.lpkc_stage
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce(
    (select r.lpkc_stage
       from public.report_submissions r
      where r.course_id = _course_id
        and r.student_id = _student_id
        and r.status <> 'approved'
      order by r.lpkc_stage
      limit 1),
    (select u.stage
       from public.courses c,
            unnest(c.lpkc_stages) with ordinality as u(stage, n)
      where c.id = _course_id
        and not exists (
          select 1 from public.report_submissions r
          where r.course_id = _course_id
            and r.student_id = _student_id
            and r.lpkc_stage = u.stage
        )
      order by u.n
      limit 1),
    (select r.lpkc_stage
       from public.report_submissions r
      where r.course_id = _course_id
        and r.student_id = _student_id
      order by r.lpkc_stage desc
      limit 1)
  );
$$;

revoke all on function app.lpkc_legacy_stage(uuid, uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Sending
-- ---------------------------------------------------------------------------

create function app.submit_report_impl(
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

  if app.notify_report_system_admins(v_id, v_uid) = 0 then
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

revoke all on function app.submit_report_impl(
  uuid, uuid, text, text, text, text, jsonb, public.lpkc_stage
) from public, anon, authenticated;

-- The two doors already in use, unchanged in what they ask for. Neither names a
-- part, so both carry on with whatever the student has open.
create or replace function public.submit_report(
  _academy_id uuid, _course_id uuid, _title text, _files jsonb
)
returns json
language plpgsql
security definer
set search_path to ''
as $$
begin
  return app.submit_report_impl(
    _academy_id, _course_id, _title, null, null, null, _files, null
  );
end;
$$;

create or replace function public.submit_report(
  _academy_id uuid, _course_id uuid, _title text,
  _introduction text, _objectives text, _problem_statement text, _files jsonb
)
returns json
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
    _introduction, _objectives, _problem_statement, _files, null
  );
end;
$$;

-- The door that names a part, and asks for what that part is made of: the
-- summary is its four fields and takes no documents; the report and the slides
-- are a document, so one has to be attached.
create function public.submit_report(
  _academy_id uuid, _course_id uuid, _stage public.lpkc_stage, _title text,
  _introduction text, _objectives text, _problem_statement text, _files jsonb
)
returns json
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_files jsonb := coalesce(_files, '[]'::jsonb);
begin
  if _stage is null then
    raise exception 'Say which part of the LPKC you are sending';
  end if;
  if coalesce(btrim(_title), '') = '' then
    raise exception 'Say what you are sending for checking';
  end if;
  if jsonb_typeof(v_files) <> 'array' then
    raise exception 'Files must be a list';
  end if;

  if _stage = 'summary' then
    if coalesce(btrim(_introduction), '') = '' then
      raise exception 'Write an introduction';
    end if;
    if coalesce(btrim(_objectives), '') = '' then
      raise exception 'Write the objectives';
    end if;
    if coalesce(btrim(_problem_statement), '') = '' then
      raise exception 'Write the problem statement';
    end if;
    -- The summary is its four fields and nothing else.
    if jsonb_array_length(v_files) > 0 then
      raise exception 'The LPKC summary takes no documents';
    end if;
    return app.submit_report_impl(
      _academy_id, _course_id, _title,
      _introduction, _objectives, _problem_statement, v_files, _stage
    );
  end if;

  if jsonb_array_length(v_files) = 0 then
    raise exception 'Attach the document you are sending';
  end if;
  return app.submit_report_impl(
    _academy_id, _course_id, _title, null, null, null, v_files, _stage
  );
end;
$$;

revoke all on function public.submit_report(
  uuid, uuid, public.lpkc_stage, text, text, text, text, jsonb
) from public, anon;
grant execute on function public.submit_report(
  uuid, uuid, public.lpkc_stage, text, text, text, text, jsonb
) to authenticated;

-- The seven-argument implementation both doors used to call. Nothing calls it
-- now and no client role can execute it.
drop function app.submit_report_impl(uuid, uuid, text, text, text, text, jsonb);

-- ---------------------------------------------------------------------------
-- 5. Reading
-- ---------------------------------------------------------------------------

-- One report as the learner's list shows it. A function because the list now
-- carries it twice per course, and because the checker's name comes from
-- `instructors`, which a student cannot read.
create function app.my_report_json(_r public.report_submissions)
returns json
language sql
stable
security definer
set search_path to ''
as $$
  select json_build_object(
    'id', _r.id,
    'lpkc_stage', _r.lpkc_stage,
    'title', _r.title,
    'introduction', _r.introduction,
    'objectives', _r.objectives,
    'problem_statement', _r.problem_statement,
    'status', _r.status,
    'version', _r.version,
    'submitted_at', _r.submitted_at,
    'reviewed_at', _r.reviewed_at,
    'instructor_name', (
      select i.full_name from public.instructors i where i.id = _r.instructor_id
    ),
    'last_at', greatest(_r.submitted_at, coalesce(_r.reviewed_at, _r.submitted_at))
  );
$$;

revoke all on function app.my_report_json(public.report_submissions)
  from public, anon, authenticated;

-- `stages` is the list: every part the course is taking, plus any the student
-- has already sent, in order — so a part with nothing sent is a row with a Send
-- button, and a part the course has since closed does not vanish from under a
-- student who is halfway through it. `report` is what the list was before, for
-- builds that read one report per course.
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
        'report', (
          select app.my_report_json(r)
          from public.report_submissions r
          where r.academy_id = _academy_id
            and r.student_id = v_student
            and r.course_id  = c.id
            and r.lpkc_stage = app.lpkc_legacy_stage(c.id, v_student)
        ),
        'stages', (
          select coalesce(json_agg(json_build_object(
            'stage', s.stage,
            'is_open', s.stage = any (c.lpkc_stages),
            'report', case when r.id is null then null
                           else app.my_report_json(r) end
          ) order by s.n), '[]'::json)
          from unnest(enum_range(null::public.lpkc_stage))
               with ordinality as s(stage, n)
          left join public.report_submissions r
            on r.academy_id = _academy_id
           and r.student_id = v_student
           and r.course_id  = c.id
           and r.lpkc_stage = s.stage
          where s.stage = any (c.lpkc_stages) or r.id is not null
        )
      ) order by c.title), '[]'::json)
      from public.enrollments e
      join public.courses c on c.id = e.course_id
      where e.academy_id = _academy_id
        and e.student_id = v_student
        and e.status in ('active', 'completed')
    )
  );
end;
$$;

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
      'lpkc_stage', r.lpkc_stage,
      'title', r.title,
      'introduction', r.introduction,
      'objectives', r.objectives,
      'problem_statement', r.problem_statement,
      'status', r.status,
      'stage', public.report_stage(r),
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
