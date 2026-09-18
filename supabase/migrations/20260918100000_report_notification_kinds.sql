-- Its own migration because a new enum label cannot be USED in the transaction
-- that adds it. The report RPCs in the next migration call app.notify with
-- these values, so the two must not be merged.
--
-- Four, not one. A notification row is an EVENT, not a sentence
-- (docs/notifications.md), and "your report was approved" and "your instructor
-- left a comment" are different events with different urgency — folding them
-- into one `report_activity` kind would push the distinction into `data` and
-- make the client branch on a string it cannot typecheck.
alter type public.notification_kind add value if not exists 'report_submitted';
alter type public.notification_kind add value if not exists 'report_comment';
alter type public.notification_kind add value if not exists 'report_status';
alter type public.notification_kind add value if not exists 'report_assigned';
