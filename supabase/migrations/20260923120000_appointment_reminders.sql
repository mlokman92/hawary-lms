-- ============================================================================
-- Appointments: the evening-before reminder.
-- ----------------------------------------------------------------------------
-- At 21:00 in the academy's own timezone every student with a session tomorrow
-- is mailed once, listing what is still on — and what staff called off. The
-- second half is the reason this exists: students missed the one cancellation
-- email and turned up. The send lives in the `send-appointment-reminders` Edge
-- Function; this migration is what it reads, what it stamps, and the clock that
-- calls it. Instructors are not reminded — they have the diary.
--
-- Which cancelled sessions
--   Only ones the student did not cancel themselves. Of 289 cancellations here,
--   240 were the student's own; reminding somebody of what they just clicked is
--   noise, and noise is how the one email that matters gets skipped. A
--   cancellation that the student has since replaced — a live session of theirs
--   overlapping the same time — is left out too: they already know, and "your
--   10:00 is cancelled" beside "your 10:00 is on" reads as a contradiction.
--
-- The 21:00 cutoff
--   The reminder covers what was already true at 21:00. A session booked or
--   cancelled after that was mailed about a moment ago by send-appointment-notice
--   and does not need a second email the same evening.
--
-- Hourly, not once a day
--   The job fires every hour and the SQL decides whose evening it is, so an
--   academy outside Malaysia needs no second job. Anything unsent is picked up
--   again at 22:00 and 23:00 — one failed call to the provider must not cost the
--   whole night, which is the exact failure this feature answers.
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

alter table public.appointments
  add column reminder_sent_at timestamptz,
  add column reminder_id      text;

comment on column public.appointments.reminder_sent_at is
  'When send-appointment-reminders dealt with this session the evening before. Set with a null reminder_id when the student had no address — tried, nobody to tell.';
comment on column public.appointments.reminder_id is
  'Resend id of the evening-before reminder that listed this session. One email can list several sessions, so several rows can share an id.';

-- ---------------------------------------------------------------------------
-- What is due right now. Returns nothing outside 21:00–23:59 local time, so the
-- caller never has to know an academy's timezone.
-- ---------------------------------------------------------------------------
create or replace function public.appointment_reminders_due(_at timestamptz default now())
returns table (
  appointment_id  uuid,
  academy_name    text,
  tz              text,
  student_id      uuid,
  student_name    text,
  student_email   text,
  instructor_name text,
  starts_at       timestamptz,
  ends_at         timestamptz,
  status          public.appointment_status,
  note            text,
  cancel_reason   text
)
language sql
security definer
set search_path = ''
stable
as $$
  with clock as (
    select ac.id, ac.name, ac.timezone as tz, (_at at time zone ac.timezone) as local_now
      from public.academies ac
     where ac.status = 'active'
  ), due as (
    select c.*,
           c.local_now::date + 1 as tomorrow,
           (c.local_now::date + time '21:00') at time zone c.tz as cutoff
      from clock c
     where c.local_now::time >= time '21:00'
  )
  select ap.id, d.name, d.tz, s.id, s.full_name,
         -- The record first, then the account's own address — the same order
         -- send-appointment-notice uses.
         coalesce(nullif(btrim(s.email), ''), u.email::text),
         i.full_name, ap.starts_at, ap.ends_at, ap.status, ap.note, ap.cancel_reason
    from due d
    join public.appointments ap on ap.academy_id = d.id
    join public.students s      on s.id = ap.student_id
    left join public.instructors i on i.id = ap.instructor_id
    left join auth.users u      on u.id = s.user_id
   where ap.starts_at >= d.tomorrow::timestamp at time zone d.tz
     and ap.starts_at <  (d.tomorrow + 1)::timestamp at time zone d.tz
     and ap.reminder_sent_at is null
     and (
       (ap.status = 'booked' and ap.created_at < d.cutoff)
       or (ap.status = 'cancelled'
           and ap.cancelled_at < d.cutoff
           and ap.cancelled_by is distinct from s.user_id
           and not exists (
             select 1 from public.appointments b
              where b.student_id = ap.student_id
                and b.status = 'booked'
                and tstzrange(b.starts_at, b.ends_at) && tstzrange(ap.starts_at, ap.ends_at)))
     )
   order by s.id, ap.starts_at, ap.id;
$$;

revoke execute on function public.appointment_reminders_due(timestamptz) from public, anon, authenticated;
grant  execute on function public.appointment_reminders_due(timestamptz) to service_role;

comment on function public.appointment_reminders_due(timestamptz) is
  'Sessions whose student is owed an evening-before reminder at _at: tomorrow''s booked sessions, plus ones staff cancelled that the student has not replaced. Empty outside 21:00–23:59 academy time. service_role only.';

-- ---------------------------------------------------------------------------
-- The shared secret between the cron job and the function. Generated here and
-- kept in Vault, so its value is never in this file or in a function secret.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'appointment_reminders_cron') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'appointment_reminders_cron',
      'Bearer token pg_cron sends to send-appointment-reminders');
  end if;
end $$;

create or replace function public.appointment_reminders_secret()
returns text
language sql
security definer
set search_path = ''
stable
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'appointment_reminders_cron';
$$;

revoke execute on function public.appointment_reminders_secret() from public, anon, authenticated;
grant  execute on function public.appointment_reminders_secret() to service_role;

-- ---------------------------------------------------------------------------
-- The clock. Every hour on the hour; the function returns at once unless it is
-- somebody's evening. The URL names this project — a branch replaying this
-- migration generates its own secret, so its calls are refused, not obeyed.
-- ---------------------------------------------------------------------------
select cron.schedule(
  'appointment-reminders',
  '0 * * * *',
  $job$
  select net.http_post(
    url := 'https://vpklztxqkvqmmzsxfqgp.supabase.co/functions/v1/send-appointment-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets
                                      where name = 'appointment_reminders_cron')),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $job$
);
