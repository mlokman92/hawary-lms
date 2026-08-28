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
| `academy_booking_settings` | one row per academy: open, slot length, mode, notice, horizon, the two caps |
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

**`/appointments`** (staff) — the diary, and nothing else, because that is what
the page is opened for on an ordinary day. `Book a session` is the one obvious
action, so it is the header button.

**`/appointments/settings`** (staff, admin-only) — the three things that decide
what goes in the diary: the policy, the hours (with closed dates), and the pool.
They are set up once and revisited rarely, so they are a destination rather than
three cards trailing under the calendar on every visit. The way in is a gear
button beside `Book a session`, drawn only for an admin — it has to live on the
diary page because booking is *off* until it is switched on there, and an empty
calendar with no way forward is the state a new academy starts in. A trainer
reaching the URL gets the same admin-only notice `/settings` gives.

The week grid draws only `booked` / `completed` / `no_show`. A cancelled session
has released its slot and is not something happening on Tuesday; drawing it would
say the diary is fuller than it is. The time axis covers both the configured
window and anything already booked, because staff can book off-grid and a session
nobody can see is worse than a tall grid.

**`/learn/appointments`** (learner) — pick a day, pick a time, book; then the
student's own sessions with a Cancel on the upcoming ones. Under round robin
there is no teacher picker, because there is nothing to render.

## Two caps, not one

`max_open_per_student` bounds the **queue** — how much of the future one student
may hold at once. `max_per_week_per_student` bounds the **rate** — how often they
may come. They are independent on purpose: an academy happy for a student to
have four sessions booked may still want at most one a week, and vice versa.
Both are NULL for no limit; the weekly one defaults to NULL, so an academy that
never opens the page keeps the behaviour it had.

The week is **Monday-start in `academies.timezone`**, the same reason day maths
is done in the academy's zone everywhere else: "twice a week" is a claim about
the office's own calendar. The count is over `booked` + `completed`, so a
cancelled session frees its week with no second write, exactly as it frees its
slot. It is the week the **session** falls in, not the week it was booked in — a
cap of two means two sessions in that week however far ahead they were arranged.

Both caps are checked for students only. Staff booking somebody in are looking at
the diary and have already decided; `_student_id` is the staff path and skips
them.

`get_booking_options` also *withholds* slots in a week the student has filled,
rather than offering them and failing the booking — the same rule as notice
period and time off: what is on screen is what can be taken.
`book_appointment` still checks, because the page is a view of a decision and
never the decision.

## Confirmation email

Every confirmed booking tells **both** parties — the student, and the instructor
the rota or a staff member picked. `supabase/functions/send-appointment-notice`
does the sending; its README carries the trust model, the receipt columns and
the kill switch. Three things are worth repeating here.

**It is a second call, not part of the booking.** `useBookAppointment` invokes
the function after `book_appointment` returns, and a failure is logged, never
thrown. The session exists the moment the RPC returns; a provider outage must
not undo it or look like it did. The cost is honest and accepted: a client that
dies between the two calls leaves a booking nobody was told about, and
`notice_sent_at IS NULL` is exactly that row.

**It needs the service role, and the other mail functions do not.** They email
one person whose address is on a row the caller can already read. This emails
two, and a student cannot read `instructors` at all. So it authorizes under the
caller's JWT — RLS on `appointments` decides — and only then reads and sends
with the service role, for the row the database just admitted.

**Two receipts, because the recipients fail independently.**
`student_notice_id` / `instructor_notice_id` are stamped separately, and a
re-invoke fills only the gap. An instructor record with no address must not stop
the student being told.

## In-app notification

Separate from the email, and more reliable than it: `book_appointment` writes a
`notifications` row for each party **in the same transaction as the insert**, so
if the booking exists the notification does. The actor is not notified — a
message telling you what you just clicked is not news. See `docs/notifications.md`.

## Deliberately not done

- **No invoice.** A session is free. Billing stays a deliberate act on
  `/payments`, the same call the enrolment work made.
- **No approval step.** Booking is instant. Round robin only makes sense
  self-serve — if staff review every booking they may as well pick the teacher.
- **Not tied to a course.** Any active student may book; the session is academy
  time, not course time.
- **No reschedule.** Cancel and book again. Staff can move one by editing
  `starts_at`; the exclusion constraint still protects them.
- **No reminders.** Confirmation is sent at booking; nothing is sent the day
  before, and nothing is sent on cancel. Both are the same shape as the
  confirmation and can be added when asked for.
- **No location.** There was a `location` on the booking policy, copied onto
  every appointment at insert. No academy ever set it and no appointment ever
  carried one, so both columns went. Where a session happens is a per-session
  fact — if it comes back it belongs on the appointment, not on an academy-wide
  default that is wrong the moment two rooms are in use.

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
