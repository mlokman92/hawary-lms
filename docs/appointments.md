# Appointments

One-to-one sessions. A student books an instructor's time; staff see the whole
diary and decide the rules it runs by.

The shape of the feature comes from the case it was built for: **five teachers,
bookable 10:00–18:00, one hour a slot, and the student must not pick the
teacher.** That last clause is what makes this more than a calendar — the
assignment has to be made by the server, fairly, and under contention.

## Slots are not rows

There is no `slots` table. A slot is *derived*, every time it is asked for, from
three facts:

1. `booking_hours` — the recurring weekly window, in the academy's own timezone
2. `instructors.is_bookable` — who is in the pool
3. what is already taken (`appointments`) or closed (`booking_time_off`)

`app.booking_slots(academy, from, to)` does that derivation and returns
`(instructor_id, starts_at, ends_at)`.

Materialising slots instead would mean a row per instructor per slot per day —
1 200 a month for the academy above — plus a generator to keep the tail topped
up and a reconciliation every time the hours change. Deriving them makes
"10:00–18:00 becomes 09:00–17:00" a single UPDATE, and makes a slot that nobody
booked cost nothing.

The only durable fact is an appointment somebody actually made.

### One generator, two doors

`app.booking_slots` is the single source of availability. It is called by:

- `get_booking_options` — the learner's page
- `get_academy_availability` — the staff booking dialog
- `book_appointment` — the check that a requested time is real

This is the same discipline as `app.enrollment_open`: the page that *offers* a
slot and the function that *grants* it must not be able to disagree about what
"free" means. A notice period enforced in one and not the other is how a student
books a session that starts in ten minutes.

### Timezones

`_from`/`_to` are **calendar days in the academy's timezone**
(`academies.timezone`, default `Asia/Kuala_Lumpur`). The generator converts each
day's wall clock separately — `(day + start_time) at time zone tz` — so a tenant
elsewhere, or a DST transition, needs no special case.

Days are walked as integer offsets, not
`generate_series(date, date, interval)`. That call is ambiguous between the
`timestamp` and `timestamptz` overloads, and resolving to `timestamptz` would
re-read each day in the *session* timezone — silently shifting every slot for a
caller outside Malaysia.

The client mirrors this in `features/appointments/calendar.ts`: a day is a plain
`YYYY-MM-DD` string, and every instant is read through
`Intl.DateTimeFormat` with an explicit `timeZone`. An admin opening the diary
from Dubai sees the academy's Tuesday, not their own.

## Double-booking is a constraint, not a check

```sql
exclude using gist (
  instructor_id with =,
  tstzrange(starts_at, ends_at) with &&
) where (status in ('booked', 'completed'))
```

Two students taking the last 15:00 slot at the same instant is the normal case,
not the edge case. Checking availability and then inserting is two statements and
therefore a race; the exclusion constraint is one. There is a second, identical
constraint on `student_id` — nobody is in two rooms at 15:00.

`btree_gist` is installed for the `uuid` half of the operator class.

Because the predicate excludes `cancelled` and `no_show`, **cancelling frees the
slot with no second write**. It also means the slot is released the moment the
status changes, which is exactly what the generator then sees.

## Round robin

`academy_booking_settings.assignment_mode` is `round_robin` or `student_choice`.

Under round robin the candidate instructors are ordered:

1. fewest sessions in the last 30 days — a teacher who joined late catches up
2. longest since last assigned
3. `id`

then `book_appointment` walks that list, inserting until one succeeds. A
collision raises `exclusion_violation`, which is caught and treated as *the next
teacher's turn*. The ordering is fully deterministic, so two simultaneous
bookings walk the same list and the constraint decides the tie — not the planner.

**The learner is never told who is free.** `get_booking_options` omits the
instructor list entirely under round robin. Two reasons: `instructors` is
staff-readable and a student has no business reading it, and naming the free
teachers would defeat the mode the academy chose. The instructor's name appears
the moment the booking exists — by then the student needs to know who they are
meeting.

### Who may name an instructor

The test is "was one named, by somebody entitled to name one" — not the mode
alone. That distinction was a bug once: keyed off the mode, staff booking under
`student_choice` without naming anybody were told to "pick an instructor", even
though the back office offers *anyone free* and is precisely who is allowed not
to care.

| caller  | mode             | instructor | result                    |
| ------- | ---------------- | ---------- | ------------------------- |
| student | `student_choice` | none       | asked to pick             |
| student | `student_choice` | named      | that instructor           |
| student | `round_robin`    | named      | **ignored** — rota decides |
| staff   | either           | none       | rota decides              |
| staff   | either           | named      | that instructor           |

A student who sends an instructor under round robin is ignored rather than
refused: choosing is simply not theirs to do.

## Students write only through RPCs

`appointments` has **no student DML policy at all** — the same standing as
`assessment_questions`. Booking has to pick an instructor fairly and enforce a
notice period, and a `WITH CHECK` expression can do neither.

- `book_appointment(academy, starts_at, instructor?, note?, student?)` —
  `student` null means "me"; set, it means staff booking on somebody's behalf,
  and only staff may pass it. One function rather than two, because the
  round-robin ordering is the part that must not drift.
- `cancel_appointment(id, reason?)` — staff any time; the student up to
  `min_notice_hours` before. Status only: the row stays as the record that it
  happened.

Marking **done** or **did not attend** is a plain UPDATE — the
`appointments: staff update` policy already grants exactly that, so an RPC would
add nothing. Same reasoning that keeps enrolment approval an UPDATE.

`app.bookable_student` mirrors the membership + record test in `app.is_enrolled`
rather than reusing `app.my_student_id`, which does not look at
`academy_members` — suspending a member has to stop them taking teacher time
immediately.

## Tables

| table                      | holds                                                        |
| -------------------------- | ------------------------------------------------------------ |
| `academy_booking_settings` | one row per academy: open, slot length, mode, notice, horizon, cap, location |
| `booking_hours`            | recurring weekly windows, academy-wide, `weekday` 0 = Sunday   |
| `booking_time_off`         | a closed window; `instructor_id` null closes the whole academy |
| `appointments`             | the booking                                                    |

Plus `instructors.is_bookable` — a flag, not a table, because "is this person
bookable" is one boolean and `instructors` already carries the rest of the
record. It defaults to **false**: switching booking on must not silently put
every instructor in the pool. `status = 'active'` is also required, so `on_leave`
drops out of the rota without anybody touching a switch.

Hours are **academy-wide by design**. Per-person hours would be an
`instructor_id` column on `booking_hours` and nothing else, if it is ever wanted.

`booking_hours` is rows rather than a start/end pair of columns because a day is
rarely one unbroken stretch: 10:00–13:00 and 14:00–18:00 is a lunch break, and
that is two rows, not a setting.

`booking_time_off` exists so that closing a date does not mean deleting the
weekly hours — which would close that weekday for ever. Its composite FK is
MATCH SIMPLE, so a null `instructor_id` skips the tenancy check rather than
failing it, which is exactly the academy-wide case.

## Screens

**`/appointments`** (staff) — the diary first, because that is what the page is
opened for on an ordinary day; then the three cards that decide what goes in it:
the policy, the hours, and the pool. Those three are admin-only and visited once.
A trainer sees the calendar alone. `Book a session` is the one obvious action, so
it is the header button.

The week grid draws only `booked` / `completed` / `no_show`. A cancelled session
has released its slot and is not something happening on Tuesday; drawing it would
say the diary is fuller than it is. The time axis covers both the configured
window and anything already booked, because staff can book off-grid and a session
nobody can see is worse than a tall grid.

**`/learn/appointments`** (learner) — pick a day, pick a time, book; then the
student's own sessions with a Cancel on the upcoming ones. Under round robin
there is no teacher picker, because there is nothing to render.

## Deliberately not done

- **No invoice.** A session is free. Billing stays a deliberate act on
  `/payments`, the same call the enrolment work made.
- **No approval step.** Booking is instant. Round robin only makes sense
  self-serve — if staff review every booking they may as well pick the teacher.
- **Not tied to a course.** Any active student may book; the session is academy
  time, not course time.
- **No reschedule.** Cancel and book again. Staff can move one by editing
  `starts_at`; the exclusion constraint still protects them.
- **No reminders.** Transactional email is not configured (see
  `docs/production-urls.md`).

## Notes for future work

- `get_booking_options` and `get_academy_availability` clamp a request to 62 days
  regardless of `horizon_days`. A client asking for ten years of slots is a
  client asking the database to generate a million rows.
- The staff calendar's initial week is computed from the default timezone before
  `useAcademyTimezone` resolves. Every tenant is currently `Asia/Kuala_Lumpur`,
  which *is* the default, so this is invisible; a tenant several zones away and a
  page load near midnight on a Sunday would open on the wrong week until
  navigated.
- The composite-FK "unindexed foreign key" advisor notices on `appointments` and
  `booking_time_off` match the ones every other composite-FK table in this schema
  already carries. The exclusion constraint's gist index covers `instructor_id`
  equality, and `appointments_academy_id_starts_at_idx` leads with `academy_id`.
