-- Appointments: the receipt columns for the booking confirmation email.
--
-- Every confirmed booking tells both parties — the student and the instructor
-- the rota (or a staff member) picked. The send itself lives in the
-- `send-appointment-notice` Edge Function, called by the same client that just
-- booked; these three columns are the record of what it did.
--
-- Why a claim column is not needed here, unlike enrollments
--   `approve_enrollment` had to claim under a lock because two staff clicking
--   Approve on the *same existing row* is the normal case. A booking is an
--   INSERT: the row did not exist a moment ago and only the caller that created
--   it knows its id, so there is no race to lose. What remains is a client
--   re-invoking with the same id (a double-click, a reload), and that is what
--   these receipts — plus a per-recipient Resend Idempotency-Key — settle.
--
-- Two receipts, not one, because there are two recipients and they fail
-- independently: an instructor record with no email address must not stop the
-- student being told. A null id means that party was not reached; re-invoking
-- fills only the gap. `notice_sent_at` records that an attempt ran at all, so
-- "nobody had an address" is distinguishable from "nothing was ever tried".
--
-- Clients get no UPDATE path to these: students have no DML policy on
-- appointments at all, and the function stamps them with the service role.

alter table public.appointments
  add column notice_sent_at        timestamptz,
  add column student_notice_id     text,
  add column instructor_notice_id  text;

comment on column public.appointments.notice_sent_at is
  'When send-appointment-notice last ran for this booking. Set even if neither party had an address — it says an attempt happened, not that mail went.';
comment on column public.appointments.student_notice_id is
  'Resend id of the student''s confirmation email. Null = not reached (no address, or the provider refused).';
comment on column public.appointments.instructor_notice_id is
  'Resend id of the instructor''s confirmation email. Null = not reached (no address, or the provider refused).';
