-- ============================================================================
-- 0016 · Attach an optional course to invoices so academies can track
--   receivables per course (e.g. "who did we bill for Course A in July, and
--   have they paid?"). Nullable — an invoice may be for a non-course item.
-- ============================================================================
alter table public.invoices add column course_id uuid;

-- Tenant-safe composite FK; SET NULL only the nullable course_id on course
-- delete (nulling the whole key would violate NOT NULL on academy_id).
alter table public.invoices
  add constraint invoices_academy_id_course_id_fkey
  foreign key (academy_id, course_id)
  references public.courses (academy_id, id) on delete set null (course_id);

create index invoices_academy_course_idx on public.invoices (academy_id, course_id);
