-- ============================================================================
-- 0009 · Assessment instructions as block content.
--   `instructions` jsonb holds the same ordered content blocks used by notes
--   (text / image / youtube) — the "explanation / directive" editor above the
--   questions. Open-ended questions live in assessment_questions (type 'essay').
-- ============================================================================

alter table public.assessments
  add column instructions jsonb not null default '[]'::jsonb;
