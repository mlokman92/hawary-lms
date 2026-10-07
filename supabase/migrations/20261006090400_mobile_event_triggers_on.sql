-- Switches on what 20261006090300 paused: work marked, invoice issued, payment
-- received, session tomorrow, and the 09:00 work-due notice.
--
-- APPLY AFTER the web app with features/notifications/render.ts is deployed —
-- from this moment those kinds appear in the web bell as well as on phones.
alter table public.assignment_submissions enable trigger notify_submission_marked;
alter table public.assessment_attempts    enable trigger notify_attempt_marked;
alter table public.invoices               enable trigger notify_invoice_issued;
alter table public.payments               enable trigger notify_payment_received;
alter table public.appointments           enable trigger notify_appointment_reminder;

select cron.alter_job(
  (select jobid from cron.job where jobname = 'work-due-notices'),
  active := true
);
