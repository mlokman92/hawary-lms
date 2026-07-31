-- ============================================================================
-- Student organization.
--   Free-text employer / sponsoring body, sitting with the other optional
--   profile details ("Add more details" on the student form). Nullable text:
--   most academies take individuals, and the ones that take corporate intakes
--   type the company name as it appears on the invoice — there is no
--   organization entity to reference and none should be inferred from this.
-- ============================================================================

alter table public.students
  add column organization text;

comment on column public.students.organization is
  'Employer / sponsoring organization, free text. Optional.';
