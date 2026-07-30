-- Objective question types: keep the matching key out of the student payload,
-- score the machine-checkable types on submit, and keep assessments.total_points
-- honest so the student and the grader see the same denominator.

-- ---------------------------------------------------------------------------
-- 1. Matching questions must not ship their answer key as row order.
--
-- options for a matching question is {left:[{id,text}], right:[{id,text}]} and
-- the author enters the pairs in order, so right[i] IS the answer to left[i].
-- Shipping that verbatim would hand the student the key even though
-- correct_answer never leaves the server. Ordering by a hash of (question, id)
-- scrambles it deterministically: stable across reloads (answers are keyed by
-- option id, so order is purely presentational) but unrelated to the pairing.
-- ---------------------------------------------------------------------------
create or replace function app.shuffled_matching_options(
  _question_id uuid,
  _options     jsonb
)
returns jsonb
language sql
immutable
set search_path to ''
as $function$
  select jsonb_build_object(
    'left', coalesce(_options -> 'left', '[]'::jsonb),
    'right', coalesce(
      (
        select jsonb_agg(r order by md5(_question_id::text || coalesce(r ->> 'id', '')))
        from jsonb_array_elements(coalesce(_options -> 'right', '[]'::jsonb)) as r
      ),
      '[]'::jsonb
    )
  );
$function$;

create or replace function app.attempt_questions(_assessment_id uuid)
returns jsonb
language sql
stable security definer
set search_path to ''
as $function$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', q.id,
        'question_type', q.question_type,
        'prompt', q.prompt,
        'points', q.points,
        'sort_order', q.sort_order,
        'options', case
          when q.question_type = 'matching'
            then app.shuffled_matching_options(q.id, q.options)
          else q.options
        end
      ) order by q.sort_order, q.id
    ), '[]'::jsonb)
  from public.assessment_questions q
  where q.assessment_id = _assessment_id;
$function$;

-- ---------------------------------------------------------------------------
-- 2. How much of one question the answer earned, as a fraction of its points.
--
-- NULL means "not auto-gradable" — an essay, or an objective question whose
-- author never set a key. Callers treat NULL as "a human still owes this one a
-- mark", which is what keeps a half-authored quiz out of 'graded'.
--
-- Answer encoding mirrors correct_answer exactly, so scoring is a comparison
-- and not a translation:
--   true_false                    boolean
--   single/multiple_choice        array of option ids
--   matching                      object {leftId: rightId}
--   essay / short_text            string (never auto-scored)
--
-- Mirrored client-side by questionFraction() in apps/web/src/lib/questions.ts,
-- which the grader's review uses to show per-question ticks. Keep them in step.
-- ---------------------------------------------------------------------------
create or replace function app.question_fraction(
  _type    public.question_type,
  _correct jsonb,
  _answer  jsonb
)
returns numeric
language sql
immutable
set search_path to ''
as $function$
  select case
    when _type in ('essay', 'short_text')            then null
    when _correct is null                            then null
    when jsonb_typeof(_correct) = 'null'             then null

    when _type = 'true_false' then
      case
        when _answer is null or jsonb_typeof(_answer) <> 'boolean' then 0
        when _answer = _correct then 1
        else 0
      end

    when _type in ('single_choice', 'multiple_choice') then
      case
        when jsonb_typeof(_correct) <> 'array' then null
        when _answer is null or jsonb_typeof(_answer) <> 'array' then 0
        when (
          select coalesce(array_agg(distinct x order by x), '{}'::text[])
          from jsonb_array_elements_text(_answer) x
        ) = (
          select coalesce(array_agg(distinct x order by x), '{}'::text[])
          from jsonb_array_elements_text(_correct) x
        ) then 1
        else 0
      end

    -- Matching earns partial credit: four pairs, three right, three quarters of
    -- the marks. All-or-nothing on a six-pair question is a cliff no learner
    -- can reason about.
    when _type = 'matching' then
      case
        when jsonb_typeof(_correct) <> 'object' then null
        when (select count(*) from jsonb_object_keys(_correct)) = 0 then null
        when _answer is null or jsonb_typeof(_answer) <> 'object' then 0
        else (
          select count(*) filter (where _answer ->> e.k = e.v)::numeric
               / count(*)::numeric
          from jsonb_each_text(_correct) as e(k, v)
        )
      end

    else null
  end;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Submit, then auto-score.
--
-- Two updates on purpose. app.guard_attempt_write derives submitted_at from the
-- in_progress -> submitted transition, so jumping straight to 'graded' would
-- leave submitted_at null. The second update rides the app.autograde_attempt
-- GUC the guard already understands (it permits score/max_score/graded and
-- forces graded_by null, so an auto mark is never attributed to a person).
--
-- An assessment with any manually-graded question stays 'submitted' with the
-- objective part banked, so the grader tops up rather than starts from zero.
-- ---------------------------------------------------------------------------
create or replace function public.submit_attempt(_attempt_id uuid)
returns json
language plpgsql
security definer
set search_path to ''
as $function$
declare
  t         public.assessment_attempts;
  v_answers jsonb;
  v_total   numeric := 0;
  v_auto    numeric := 0;
  v_manual  numeric := 0;
begin
  if (select auth.uid()) is null then raise exception 'You must be signed in'; end if;
  select * into t from public.assessment_attempts where id = _attempt_id;
  if not found then raise exception 'Attempt not found'; end if;
  if not app.owns_student(t.student_id) then raise exception 'Not authorized'; end if;

  if t.status <> 'in_progress' then
    return app.attempt_payload(_attempt_id);
  end if;

  update public.assessment_attempts
    set status = 'submitted'
    where id = _attempt_id and status = 'in_progress';

  v_answers := coalesce(t.answers, '{}'::jsonb);

  select
    coalesce(sum(x.points), 0),
    coalesce(sum(x.points * x.frac) filter (where x.frac is not null), 0),
    coalesce(sum(x.points) filter (where x.frac is null), 0)
  into v_total, v_auto, v_manual
  from (
    select
      q.points,
      app.question_fraction(q.question_type, q.correct_answer, v_answers -> q.id::text) as frac
    from public.assessment_questions q
    where q.assessment_id = t.assessment_id
  ) x;

  -- Nothing machine-checkable and nothing to total: leave the attempt exactly
  -- as v1 left it rather than stamping a meaningless 0.
  if v_total > 0 then
    perform set_config('app.autograde_attempt', _attempt_id::text, true);
    update public.assessment_attempts
      set score     = round(v_auto, 2),
          max_score = v_total,
          status    = case when v_manual = 0 then 'graded' else 'submitted' end
      where id = _attempt_id;
    perform set_config('app.autograde_attempt', '', true);
  end if;

  return app.attempt_payload(_attempt_id);
end;
$function$;

-- ---------------------------------------------------------------------------
-- 4. assessments.total_points was never maintained by anything — it sat at its
-- default 0 while the learner landing page and the course list both display it,
-- and GradeAttemptPage independently re-summed the questions to get a
-- denominator. One source of truth, kept by the database.
-- ---------------------------------------------------------------------------
create or replace function app.sync_assessment_total_points()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_ids uuid[];
begin
  v_ids := array_remove(array[new.assessment_id, old.assessment_id], null);

  update public.assessments a
    set total_points = coalesce((
      select sum(q.points)
      from public.assessment_questions q
      where q.assessment_id = a.id
    ), 0)
    where a.id = any(v_ids);

  return null;
end;
$function$;

drop trigger if exists assessment_questions_sync_points on public.assessment_questions;
create trigger assessment_questions_sync_points
after insert or delete or update of points, assessment_id
on public.assessment_questions
for each row execute function app.sync_assessment_total_points();

update public.assessments a
  set total_points = coalesce((
    select sum(q.points)
    from public.assessment_questions q
    where q.assessment_id = a.id
  ), 0)
  where a.total_points is distinct from coalesce((
    select sum(q.points)
    from public.assessment_questions q
    where q.assessment_id = a.id
  ), 0);

revoke all on function app.shuffled_matching_options(uuid, jsonb) from public, anon;
revoke all on function app.question_fraction(public.question_type, jsonb, jsonb) from public, anon;
revoke all on function app.sync_assessment_total_points() from public, anon;
