-- Its own migration because a new enum label cannot be USED in the transaction
-- that adds it. `cancel_appointment` in the next migration references this
-- value, so the two must not be merged.
alter type public.notification_kind add value if not exists 'appointment_reassigned';
