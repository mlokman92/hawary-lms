-- ============================================================================
-- 0026 · Scope trainer grading to the courses they are assigned to.
--
-- Admins keep academy-wide reach (the is_admin disjunct is the escape hatch
-- that prevents a lockout when an instructor link is wrong). Trainers are
-- limited to courses joined through course_instructors -> instructors.user_id.
--
-- app.is_staff is deliberately NOT touched: 58 policies depend on it, and
-- narrowing it would rewrite tenancy for the whole product in one statement.
-- Everything grading-related was routed through app.can_grade_course in 0023
-- precisely so this is a single function body change.
--
-- assessment_questions narrows too. Leaving it on bare is_staff would mean
-- every trainer keeps reading every correct_answer in the academy, which makes
-- scoping the grading itself pointless.
--
-- Consequence to accept: a trainer with no linked instructors row resolves to
-- zero courses. The Phase 6 admin screens are the repair path.
-- ============================================================================

create or replace function app.can_grade_course(_course_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.courses c
    where c.id = _course_id
      and (
        app.is_admin(c.academy_id)
        or (app.is_staff(c.academy_id) and app.teaches_course(c.id))
      )
  );
$$;

-- assessment_questions: staff-only -> grader-of-this-course-only.
-- Still never readable by students; the answer key reaches them through no
-- path at all (the attempt RPCs project an explicit column list).
drop policy "questions: staff select" on public.assessment_questions;
drop policy "questions: staff insert" on public.assessment_questions;
drop policy "questions: staff update" on public.assessment_questions;
drop policy "questions: staff delete" on public.assessment_questions;

create policy "questions: graders select" on public.assessment_questions
  for select to authenticated
  using (app.can_grade_assessment(assessment_id));
create policy "questions: graders insert" on public.assessment_questions
  for insert to authenticated
  with check (app.can_grade_assessment(assessment_id));
create policy "questions: graders update" on public.assessment_questions
  for update to authenticated
  using (app.can_grade_assessment(assessment_id))
  with check (app.can_grade_assessment(assessment_id));
create policy "questions: graders delete" on public.assessment_questions
  for delete to authenticated
  using (app.can_grade_assessment(assessment_id));
