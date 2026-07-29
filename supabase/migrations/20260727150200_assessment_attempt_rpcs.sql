-- ============================================================================
-- 0025 · Assessment taking RPCs.
--
-- assessment_questions stays STAFF-ONLY under RLS. A student SELECT policy is
-- categorically wrong here: RLS is row-level, so any permitted row carries
-- correct_answer with it. Instead these SECURITY DEFINER functions project an
-- EXPLICIT column list that never names correct_answer, so a later `select *`
-- refactor cannot leak the key.
--
-- SECURITY DEFINER bypasses RLS entirely (relforcerowsecurity is false), so
-- every predicate the RLS write policies used to carry is re-asserted here by
-- hand: publication, module visibility, enrolment, the availability window and
-- the attempt limit. app.assessment_open is the SAME predicate the read
-- policies use, so an unpublished module can never be writable-but-invisible.
--
-- Note SECURITY DEFINER changes the ROLE, not auth.uid() — that is a JWT claim.
-- So inside these functions the caller is still the student, and the write
-- guards in 0023 still apply to them. That is deliberate.
-- ============================================================================

-- Resolve the caller's student record for a given academy. Academy-scoped on
-- purpose: one profile may hold a students row in several academies, so
-- resolving by user_id alone can pick the wrong tenant.
create or replace function app.my_student_id(_academy_id uuid)
returns uuid
language sql
security definer
set search_path = ''
stable
as $$
  select s.id
  from public.students s
  where s.user_id    = (select auth.uid())
    and s.academy_id = _academy_id
    and s.archived_at is null
    and s.status in ('active', 'trial')
  limit 1;
$$;

-- Questions as a student may see them. correct_answer is absent by construction.
create or replace function app.attempt_questions(_assessment_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',            q.id,
        'question_type', q.question_type,
        'prompt',        q.prompt,
        'points',        q.points,
        'sort_order',    q.sort_order,
        'options',       q.options
      ) order by q.sort_order, q.id
    ),
    '[]'::jsonb
  )
  from public.assessment_questions q
  where q.assessment_id = _assessment_id;
$$;

create or replace function app.attempt_payload(_attempt_id uuid)
returns json
language sql
security definer
set search_path = ''
stable
as $$
  select json_build_object(
    'attempt', jsonb_build_object(
      'id',           t.id,
      'assessment_id', t.assessment_id,
      'attempt_no',   t.attempt_no,
      'status',       t.status,
      'answers',      coalesce(t.answers, '{}'::jsonb),
      'started_at',   t.started_at,
      'submitted_at', t.submitted_at,
      'score',        t.score,
      'max_score',    t.max_score,
      'expires_at',   case when a.duration_minutes is null then null
                           else t.started_at + make_interval(mins => a.duration_minutes) end
    ),
    'assessment', jsonb_build_object(
      'id',              a.id,
      'title',           a.title,
      'instructions',    a.instructions,
      'total_points',    a.total_points,
      'duration_minutes', a.duration_minutes,
      'max_attempts',    a.max_attempts,
      'course_id',       a.course_id
    ),
    'questions', app.attempt_questions(t.assessment_id)
  )
  from public.assessment_attempts t
  join public.assessments a on a.id = t.assessment_id
  where t.id = _attempt_id;
$$;

-- ---------------------------------------------------------------------------
create or replace function public.start_attempt(_assessment_id uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  a          public.assessments;
  v_student  uuid;
  v_existing uuid;
  v_used     integer;
  v_new      uuid;
begin
  if (select auth.uid()) is null then raise exception 'You must be signed in'; end if;

  select * into a from public.assessments where id = _assessment_id;
  if not found then raise exception 'Assessment not found'; end if;

  -- Same gate as the read policies: published assessment inside a published
  -- module of a course the caller is actively enrolled in.
  if not app.assessment_open(_assessment_id) then
    raise exception 'This assessment is not available to you';
  end if;

  v_student := app.my_student_id(a.academy_id);
  if v_student is null then
    raise exception 'No active student record for you in this academy';
  end if;

  if a.available_from is not null and now() < a.available_from then
    raise exception 'This assessment opens on %', a.available_from;
  end if;
  if a.available_until is not null and now() > a.available_until then
    raise exception 'This assessment closed on %', a.available_until;
  end if;

  -- Serialise concurrent starts for this (assessment, student) pair so the
  -- attempt count cannot be read-then-written by two sessions at once. The
  -- unique constraints added in 0023 are the backstop if this ever fails.
  perform pg_advisory_xact_lock(
    hashtextextended(_assessment_id::text || ':' || v_student::text, 0)
  );

  select id into v_existing
  from public.assessment_attempts
  where assessment_id = _assessment_id
    and student_id    = v_student
    and status        = 'in_progress'
  limit 1;

  if v_existing is not null then
    return app.attempt_payload(v_existing);
  end if;

  select count(*) into v_used
  from public.assessment_attempts
  where assessment_id = _assessment_id and student_id = v_student;

  if v_used >= a.max_attempts then
    raise exception 'You have used all % attempt(s) for this assessment', a.max_attempts;
  end if;

  insert into public.assessment_attempts
    (academy_id, assessment_id, student_id, attempt_no, status)
  values
    (a.academy_id, _assessment_id, v_student, v_used + 1, 'in_progress')
  returning id into v_new;

  return app.attempt_payload(v_new);
end;
$$;

-- ---------------------------------------------------------------------------
create or replace function public.get_attempt(_attempt_id uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.assessment_attempts;
begin
  if (select auth.uid()) is null then raise exception 'You must be signed in'; end if;

  select * into t from public.assessment_attempts where id = _attempt_id;
  if not found then raise exception 'Attempt not found'; end if;

  -- Owner only. Graders read attempts through RLS, not through this function,
  -- so this never becomes a way to read someone else's paper.
  if not app.owns_student(t.student_id) then
    raise exception 'Not authorized';
  end if;

  return app.attempt_payload(_attempt_id);
end;
$$;

-- ---------------------------------------------------------------------------
create or replace function public.save_attempt_answers(_attempt_id uuid, _answers jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  t        public.assessment_attempts;
  a        public.assessments;
  v_unknown integer;
begin
  if (select auth.uid()) is null then raise exception 'You must be signed in'; end if;
  if _answers is null or jsonb_typeof(_answers) <> 'object' then
    raise exception 'Answers must be a JSON object keyed by question id';
  end if;
  if pg_column_size(_answers) > 262144 then
    raise exception 'Answers payload is too large';
  end if;

  select * into t from public.assessment_attempts where id = _attempt_id;
  if not found then raise exception 'Attempt not found'; end if;
  if not app.owns_student(t.student_id) then raise exception 'Not authorized'; end if;

  -- The WHERE clause, not a policy, is the state machine: a submitted or graded
  -- attempt simply matches nothing.
  if t.status <> 'in_progress' then
    raise exception 'This attempt is no longer open';
  end if;

  select * into a from public.assessments where id = t.assessment_id;

  if a.available_until is not null and now() > a.available_until then
    raise exception 'This assessment has closed';
  end if;
  if a.duration_minutes is not null
     and now() > t.started_at + make_interval(mins => a.duration_minutes) then
    raise exception 'Your time for this attempt has run out';
  end if;

  -- Every key must be a question of THIS assessment.
  select count(*) into v_unknown
  from jsonb_object_keys(_answers) k
  where not exists (
    select 1 from public.assessment_questions q
    where q.assessment_id = t.assessment_id and q.id::text = k
  );
  if v_unknown > 0 then
    raise exception 'Answers reference % question(s) that are not part of this assessment', v_unknown;
  end if;

  update public.assessment_attempts
    set answers = _answers
    where id = _attempt_id and status = 'in_progress';

  return app.attempt_payload(_attempt_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- The single place correct_answer may ever be read — and only server-side.
-- For the essay-only v1 it reads nothing and simply closes the attempt;
-- objective auto-scoring becomes a change to THIS body rather than a re-plumb,
-- using the app.autograde_attempt capability the 0023 guard understands.
create or replace function public.submit_attempt(_attempt_id uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.assessment_attempts;
begin
  if (select auth.uid()) is null then raise exception 'You must be signed in'; end if;

  select * into t from public.assessment_attempts where id = _attempt_id;
  if not found then raise exception 'Attempt not found'; end if;
  if not app.owns_student(t.student_id) then raise exception 'Not authorized'; end if;

  -- Idempotent: replaying submit on an already-submitted attempt is a no-op
  -- rather than a way to reopen or re-stamp it.
  if t.status <> 'in_progress' then
    return app.attempt_payload(_attempt_id);
  end if;

  -- submitted_at is stamped by app.guard_attempt_write, never accepted here.
  update public.assessment_attempts
    set status = 'submitted'
    where id = _attempt_id and status = 'in_progress';

  return app.attempt_payload(_attempt_id);
end;
$$;

revoke all on function public.start_attempt(uuid)                from public, anon;
revoke all on function public.get_attempt(uuid)                  from public, anon;
revoke all on function public.save_attempt_answers(uuid, jsonb)  from public, anon;
revoke all on function public.submit_attempt(uuid)               from public, anon;
grant execute on function public.start_attempt(uuid)               to authenticated;
grant execute on function public.get_attempt(uuid)                 to authenticated;
grant execute on function public.save_attempt_answers(uuid, jsonb) to authenticated;
grant execute on function public.submit_attempt(uuid)              to authenticated;
