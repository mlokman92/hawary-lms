-- Whose sessions a trainer may READ is now the same rule as whose they may
-- CHANGE.
--
-- `appointments: admin or own instructor update` has been
-- `app.is_admin OR app.owns_instructor` since the cover-rules migration, while
-- the read side still said `app.is_staff` — so any trainer, with nothing but
-- their own JWT and the publishable key, could pull every session in the
-- academy straight from PostgREST. The register's "my sessions" default was a
-- seeded dropdown value, not a boundary; one click showed everybody.
--
-- Same shape as docs/money-is-admin-only.md: the leak was the policy, so the
-- policy is where it is closed. Hiding the filter would have changed nothing.
--
-- `app.is_staff` itself is NOT narrowed — dozens of policies rest on it and
-- nearly all are the teaching grants a trainer must keep. Only this one
-- statement moves.
--
-- Safe for every writer: book_appointment, cancel_appointment,
-- get_booking_options, get_my_appointments, app.booking_slots and
-- app.cover_candidates are all SECURITY DEFINER, so slot generation, the round
-- robin and the cover walk are untouched by what the caller may select.
--
-- `instructor_id` is NOT NULL, so `owns_instructor` never sees a null and no
-- session can fall out of every arm.

drop policy if exists "appointments: staff read all, student read own"
  on public.appointments;

create policy "appointments: admin all, own instructor, own student"
  on public.appointments
  for select
  to authenticated
  using (
    app.is_admin(academy_id)
    or app.owns_instructor(instructor_id)
    or app.owns_student(student_id)
  );
