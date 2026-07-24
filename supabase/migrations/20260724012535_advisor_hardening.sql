-- ============================================================================
-- 0005 · Advisor hardening.
--   1. Pin an immutable search_path on app.set_updated_at (security lint).
--   2. Add covering indexes for the composite (academy_id, <fk>) foreign keys,
--      replacing the now-redundant single-column academy_id indexes (the
--      composite covers the academy_id-prefix and the single academy_id FK too).
-- ============================================================================

create or replace function app.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop index if exists public.enrollments_academy_id_idx;
create index enrollments_academy_course_idx on public.enrollments (academy_id, course_id);

drop index if exists public.course_instructors_academy_id_idx;
create index course_instructors_academy_course_idx on public.course_instructors (academy_id, course_id);

drop index if exists public.notes_academy_id_idx;
create index notes_academy_course_idx on public.notes (academy_id, course_id);

drop index if exists public.assessments_academy_id_idx;
create index assessments_academy_course_idx on public.assessments (academy_id, course_id);

drop index if exists public.assessment_questions_academy_id_idx;
create index assessment_questions_academy_assessment_idx on public.assessment_questions (academy_id, assessment_id);

drop index if exists public.assessment_attempts_academy_id_idx;
create index assessment_attempts_academy_assessment_idx on public.assessment_attempts (academy_id, assessment_id);

drop index if exists public.assignments_academy_id_idx;
create index assignments_academy_course_idx on public.assignments (academy_id, course_id);

drop index if exists public.assignment_submissions_academy_id_idx;
create index assignment_submissions_academy_assignment_idx on public.assignment_submissions (academy_id, assignment_id);

drop index if exists public.invoices_academy_id_idx;
create index invoices_academy_enrollment_idx on public.invoices (academy_id, enrollment_id);

drop index if exists public.invoice_items_academy_id_idx;
create index invoice_items_academy_invoice_idx on public.invoice_items (academy_id, invoice_id);

drop index if exists public.payments_academy_id_idx;
create index payments_academy_invoice_idx on public.payments (academy_id, invoice_id);
