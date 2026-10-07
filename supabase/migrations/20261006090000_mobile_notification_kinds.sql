-- Six more things the bell can say, added for the mobile apps' push
-- notifications but written to `notifications` like every other kind — so the
-- web bell shows them too, and a phone that is offline finds them waiting.
--
-- Its own migration: Postgres will not let the transaction that adds an enum
-- label also reference it, and the next file does.
alter type public.notification_kind add value if not exists 'work_marked';
alter type public.notification_kind add value if not exists 'work_due';
alter type public.notification_kind add value if not exists 'invoice_issued';
alter type public.notification_kind add value if not exists 'payment_received';
alter type public.notification_kind add value if not exists 'appointment_reminder';
alter type public.notification_kind add value if not exists 'announcement';
