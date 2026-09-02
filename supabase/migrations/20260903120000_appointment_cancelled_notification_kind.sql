-- Its own migration because a new enum label cannot be USED in the transaction
-- that adds it. `cancel_appointment` in the next migration references this
-- value, so the two must not be merged. Same split as
-- 20260829130000_appointment_reassigned_notification_kind.sql.
alter type public.notification_kind add value if not exists 'appointment_cancelled';
