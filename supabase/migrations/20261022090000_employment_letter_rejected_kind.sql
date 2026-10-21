-- ============================================================================
-- The notification a student gets when an admin rejects their employment
-- letter. On its own, because a new enum value cannot be used in the
-- transaction that adds it (20261022090100 does).
-- ============================================================================
alter type public.notification_kind add value if not exists 'employment_letter_rejected';
