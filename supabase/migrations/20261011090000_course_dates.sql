-- ============================================================================
-- A course runs from a start date to an end date.
--
-- A course is one intake ("Siri"), and an intake has a first and a last day.
-- Calendar days, not instants: nobody means "1 April at 00:00 in UTC".
--
-- Both are optional. A draft has no dates until somebody decides them, and a
-- copy made by duplicate_course starts without them on purpose — that function
-- names the columns it carries, so these two stay NULL there exactly like the
-- assessment windows and assignment due dates it already clears.
--
-- Nothing reads these to decide access. They are what the course says about
-- itself; status still decides who can see it.
-- ============================================================================

alter table public.courses
  add column start_date date,
  add column end_date   date,
  add constraint courses_dates_ordered check (end_date >= start_date);
