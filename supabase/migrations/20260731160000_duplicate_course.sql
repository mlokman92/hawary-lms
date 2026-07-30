-- Deep-copy a course so an academy can run the same syllabus for a new intake.
--
-- The intake lives in the title ("Short Course Cohort 2") — there is no cohort
-- entity, and this function deliberately does not invent one.
--
-- Copied:     modules, notes, materials, assessments + their questions,
--             assignments, and the instructor assignments.
-- Not copied: enrolments, attempts, submissions, invoices — those belong to the
--             intake that has already run.
--
-- Two things are asked for rather than copied:
--
--   _title  because two courses called the same thing are indistinguishable in
--           every list in the app.
--   _code   because courses_academy_code_key is UNIQUE (academy_id, lower(code))
--           where code is not null, so copying it verbatim simply fails. NULL is
--           the default: a blank code is visibly missing and can be filled in,
--           whereas an auto-generated "ACCA-1-copy" is a made-up identifier that
--           looks deliberate.
--
-- Schedule dates (available_from / available_until / due_at) are reset to NULL
-- for the same reason: a new intake that inherits last year's window opens
-- already closed, and every assignment in it is already overdue.
--
-- SECURITY DEFINER because it writes assessment_questions, whose INSERT policy
-- is app.can_grade_assessment — so the caller's right to do this is checked
-- explicitly, once, at the top.
create or replace function public.duplicate_course(
  _course_id uuid,
  _title     text default null,
  _code      text default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  c         public.courses;
  v_uid     uuid;
  v_new     uuid;
  v_title   text;
  v_code    text;
  v_modules jsonb;   -- old module id (text) -> new module id (text)
  v_assess  jsonb;   -- old assessment id   -> new assessment id
begin
  v_uid := (select auth.uid());
  if v_uid is null then raise exception 'You must be signed in'; end if;

  select * into c from public.courses where id = _course_id;
  if not found then raise exception 'Course not found'; end if;

  -- "A course you are responsible for": academy admin, or a trainer assigned to
  -- it. Deliberately not the broader app.is_staff that governs creating a course
  -- from scratch — this one carries another course's question bank with it.
  if not app.can_grade_course(_course_id) then
    raise exception 'Not authorized to duplicate this course';
  end if;

  v_title := nullif(btrim(coalesce(_title, '')), '');
  if v_title is null then v_title := c.title || ' (copy)'; end if;
  if length(v_title) > 200 then raise exception 'Title is too long'; end if;

  v_code := nullif(btrim(coalesce(_code, '')), '');
  if v_code is not null then
    if length(v_code) > 50 then raise exception 'Course code is too long'; end if;
    -- Checked here so the caller gets this sentence instead of a raw 23505.
    if exists (
      select 1 from public.courses x
      where x.academy_id = c.academy_id and lower(x.code) = lower(v_code)
    ) then
      raise exception 'Course code "%" is already used in this academy', v_code;
    end if;
  end if;

  -- Always a draft: a copy is not ready to be shown or sold, whatever the
  -- original's status was.
  insert into public.courses
    (academy_id, title, code, description, status, price_sen, currency,
     cover_url, created_by)
  values
    (c.academy_id, v_title, v_code, c.description, 'draft', c.price_sen,
     c.currency, c.cover_url, v_uid)
  returning id into v_new;

  -- Modules. New ids are minted inside the CTE so the insert and the mapping
  -- agree; `materialized` pins that, since gen_random_uuid() is volatile.
  with src as materialized (
    select m.*, gen_random_uuid() as new_id
    from public.course_modules m
    where m.course_id = _course_id
  ),
  ins as (
    insert into public.course_modules
      (id, academy_id, course_id, title, description, sort_order, is_published,
       created_by)
    select s.new_id, s.academy_id, v_new, s.title, s.description, s.sort_order,
           s.is_published, v_uid
    from src s
    returning 1
  )
  select coalesce(jsonb_object_agg(s.id::text, s.new_id::text), '{}'::jsonb)
  into v_modules
  from src s;

  insert into public.notes
    (academy_id, course_id, module_id, title, content, body, is_published,
     sort_order, created_by)
  select n.academy_id, v_new, (v_modules ->> n.module_id::text)::uuid, n.title,
         n.content, n.body, n.is_published, n.sort_order, v_uid
  from public.notes n
  where n.course_id = _course_id;

  -- The copy points at the SAME storage object rather than duplicating the
  -- file: one slide deck shared by two intakes is one PDF, and duplicating
  -- bytes on every copy would grow storage without bound. The consequence,
  -- recorded here because it is not visible from the row: deleting a material
  -- must not delete its object, or the copy breaks. Nothing deletes objects
  -- today; a sweep that does will have to check for other rows on the same
  -- file_path.
  insert into public.course_materials
    (academy_id, course_id, module_id, title, file_path, file_name, mime_type,
     size_bytes, is_published, sort_order, created_by)
  select t.academy_id, v_new, (v_modules ->> t.module_id::text)::uuid, t.title,
         t.file_path, t.file_name, t.mime_type, t.size_bytes, t.is_published,
         t.sort_order, v_uid
  from public.course_materials t
  where t.course_id = _course_id;

  with src as materialized (
    select a.*, gen_random_uuid() as new_id
    from public.assessments a
    where a.course_id = _course_id
  ),
  ins as (
    insert into public.assessments
      (id, academy_id, course_id, module_id, title, description, type,
       duration_minutes, max_attempts, is_published, instructions, sort_order,
       created_by)
    select s.new_id, s.academy_id, v_new, (v_modules ->> s.module_id::text)::uuid,
           s.title, s.description, s.type, s.duration_minutes, s.max_attempts,
           s.is_published, s.instructions, s.sort_order, v_uid
    from src s
    returning 1
  )
  select coalesce(jsonb_object_agg(s.id::text, s.new_id::text), '{}'::jsonb)
  into v_assess
  from src s;

  -- total_points is left to assessment_questions_sync_points, which fires here.
  insert into public.assessment_questions
    (academy_id, assessment_id, question_type, prompt, points, sort_order,
     options, correct_answer)
  select q.academy_id, (v_assess ->> q.assessment_id::text)::uuid,
         q.question_type, q.prompt, q.points, q.sort_order, q.options,
         q.correct_answer
  from public.assessment_questions q
  join public.assessments a on a.id = q.assessment_id
  where a.course_id = _course_id;

  insert into public.assignments
    (academy_id, course_id, module_id, title, total_points, allow_late,
     is_published, instructions, sort_order, created_by)
  select g.academy_id, v_new, (v_modules ->> g.module_id::text)::uuid, g.title,
         g.total_points, g.allow_late, g.is_published, g.instructions,
         g.sort_order, v_uid
  from public.assignments g
  where g.course_id = _course_id;

  insert into public.course_instructors (academy_id, course_id, instructor_id)
  select ci.academy_id, v_new, ci.instructor_id
  from public.course_instructors ci
  where ci.course_id = _course_id;

  return v_new;
end;
$function$;

revoke all on function public.duplicate_course(uuid, text, text) from public, anon;
grant execute on function public.duplicate_course(uuid, text, text) to authenticated;
