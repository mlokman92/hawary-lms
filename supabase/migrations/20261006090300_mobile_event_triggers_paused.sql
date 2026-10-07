-- The five event triggers and the work-due clock write notification kinds the
-- web bell only learned to render in the same change that added them
-- (apps/web/src/features/notifications/render.ts). Until THAT web build is
-- deployed, the live bell would title an invoice notice "Session booked with
-- someone" — so they are created switched off, and 20261006090400 switches
-- them on. Apply that one after the web deploy, not before.
--
-- Announcements need no pause: nothing can post one until the mobile apps ship.
alter table public.assignment_submissions disable trigger notify_submission_marked;
alter table public.assessment_attempts    disable trigger notify_attempt_marked;
alter table public.invoices               disable trigger notify_invoice_issued;
alter table public.payments               disable trigger notify_payment_received;
alter table public.appointments           disable trigger notify_appointment_reminder;

select cron.alter_job(
  (select jobid from cron.job where jobname = 'work-due-notices'),
  active := false
);
