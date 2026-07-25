-- ============================================================================
-- 0010 · Assignment instructions as block content (same blocks as notes /
--        assessments). Students submit text/docs against this (submissions
--        already modelled in assignment_submissions; answering comes later).
-- ============================================================================

alter table public.assignments drop column instructions;
alter table public.assignments
  add column instructions jsonb not null default '[]'::jsonb;
