# Report checks

A student uploads the document, the rota picks a checker, and the whole
conversation happens in the app instead of in a room.

## The number this was built from

Of the 621 appointments in this database, 179 carry a note. **154 of those 179
say some version of "semakan LPKC", "check LPKT", "slide dan portfolio",
"fail", "tugasan".** Eighty-six per cent of the notes on the diary are a
document being looked at.

That is the wrong shape for an appointment. It costs a room, a travelling
student and an hour of an instructor's week to do something that has no reason
to be synchronous, it is capped by `booking_hours` and the four-person bookable
pool, and when it is over there is no record of what was said — so the next
session starts by asking again.

Appointments stay. Some things genuinely need a person in front of you. This
module is for the ones that do not.

## Three decisions

### 1. Slots are not involved

`app.booking_slots` gates on weekly hours, `min_notice_hours`, `horizon_days`
and `booking_time_off`. Every one of those is a rule about opening a booking
**window** — and a report has no window. It is work in a queue.

So `app.report_checkers` is its own generator and consults nothing but pool
membership (`is_report_checker`, `status = 'active'`, unarchived) and how much
each checker is already holding. There is no time off, no notice period, no
horizon, and nothing to configure per weekday.

The ordering differs from `book_appointment`'s on one point that matters:
**fewest OPEN reports, not fewest in the last 30 days.** A session is over when
it is over, so a rolling window measures a teacher's load correctly. A report
sits on somebody's desk until it is approved, so the open count *is* the load.

Unlike `book_appointment` there is no insert loop, because there is no
exclusion constraint to lose a race against — two students submitting at the
same instant can both be handed to the same checker, and the next submission
corrects the balance. A load balancer, not a uniqueness guarantee.

### 2. The pool is the switch

There is no `academy_report_settings`. An academy with nobody flagged
`is_report_checker` cannot receive a report: `submit_report` refuses, and
`my_reports` returns `is_open: false` so the learner page says so instead of
offering a button that fails.

Same discipline as `instructors.is_bookable` defaulting to **false** — turning a
feature on must not silently enlist every instructor. The two flags are
separate on purpose: only 4 of this academy's 11 active instructors take diary
bookings, and requiring somebody's diary to be open before they may read a PDF
would be a rule about the wrong thing.

The rota is edited from a dialog behind the `⋯` menu on `/reports`, admin-only.
Not a settings page: `/appointments/settings` earned one by having three cards
on it, and this has one switch per instructor.

### 3. One report per (student, course)

Not one per document. A student's LPKC, slide and portfolio are checked
together — the appointment notes name those three in one breath — so they are
**versions and files on one thread** with one status and one checker.
`report_submissions_one_per_course` says so.

Sending again does not open a second thread: `submit_report` bumps `version`,
files the new documents under a `submitted` event carrying that number, sets the
status back to `submitted` and **keeps the same checker**. The person who asked
for the changes is the person who should see them.

## Tables

| table                | holds                                                        |
| -------------------- | ------------------------------------------------------------ |
| `report_submissions` | one thread per (student, course): title, status, version, checker |
| `report_events`      | the history — uploads, comments, verdicts, handovers           |
| `report_files`       | one document, pinned to the event it arrived with              |

Plus `instructors.is_report_checker` — a flag, not a table, for the same reason
`is_bookable` is one.

A file belongs to the **event**, not the thread, so "version 2 of the LPKC" is a
fact the table states rather than one a reader reconstructs from timestamps.

`report_events.actor_name` and `actor_role` are **snapshots**, the notifications
discipline: the timeline then needs no joins, and a later rename does not
rewrite who said what at the time. `actor_id` is kept alongside for "was this
me".

## Statuses

    submitted ──▶ in_review ──▶ changes_requested ──▶ (student uploads) ──▶ submitted
                     │                                                          │
                     └──────────────────▶ approved ◀───────────────────────────-┘

`submitted` and `in_review` wait on the **checker**. `changes_requested` waits on
the **student**. `approved` is done.

That split is what makes both dashboards and the nav badge possible: "how many
are waiting on me" is `status in ('submitted','in_review')`, narrowed by RLS to
the reader's own.

**Only an upload puts a report back into `submitted`, and only a student
uploads**, which is why `submitted` is not one of the three verdict buttons. A
student who sends `_to_status` anyway is **ignored, not refused** — the same way
a student naming an instructor under round robin is ignored. Deciding is simply
not theirs to do.

## Who may see and do what

The SELECT policy is the appointments policy, verbatim in shape:

    reports: admin all, own instructor, own student
      using (app.is_admin(academy_id)
             or app.owns_instructor(instructor_id)
             or app.owns_student(student_id))

Deliberately **not** `app.is_staff`. See `docs/appointments.md` → "Who sees
whose sessions": a trainer is staff so they can teach, and another student's
draft thesis is not part of that. A trainer's own JWT plus the publishable key
would otherwise read every report in the academy straight from PostgREST, and
hiding rows in the client would have changed nothing.

`report_events` and `report_files` follow the thread with an `EXISTS` against
the parent rather than repeating the three tests, so the two cannot disagree.

Clients have **no DML on any of the three tables.** Assignment has to be fair,
and a status change has to be the same statement as the timeline entry and the
notification that reports it — the `approve_enrollment` lesson. Four RPCs are
the only doors:

| RPC | who | what |
| --- | --- | --- |
| `submit_report` | the student | create or bump a version; assigns on creation |
| `comment_on_report` | student, checker, admin | say something, and (staff only) decide something |
| `reassign_report` | the checker holding it, or an admin | hand it on |
| `get_report` | anybody the policy admits | the whole thread, projected |

Plus `my_reports` (the learner's list), `report_counts` (the four tiles) and
`report_download` (entitlement for the signing function).

A trainer who is **not** the checker gets `Report not found` from every one of
them — the `cancel_appointment` discipline: whether an id exists is not
something a colleague should be able to probe. Verified against live data: an
uninvolved trainer reads 0 rows, counts 0, and cannot reassign.

`get_report` is an RPC and not four selects because it carries the checker's
name, and **a student cannot read `instructors` at all**. It returns `my_role`,
which is what `ReportThreadView` gates its buttons on — so the rule lives on the
server and cannot drift between the two routes that mount the component.

## Files

Objects live in the **private `student-reports` bucket**. Same reasoning as
`course-materials`, with a sharper edge: a course material is the academy's
product, but a report is a student's own unfinished work, and 690 of them in a
public bucket is a directory of other people's draft theses.

`upload-media` gained a **member branch** for this — the first non-staff write
it accepts, and the student upload path CLAUDE.md had listed as deferred. The
key is `<academy_id>/<uploader user id>/<uuid>.<ext>`, built from verified
identity.

That middle segment is load-bearing. The client hands the *path* to
`submit_report`, so the path is client input, and `app.assert_own_upload`
re-checks that it starts with the caller's own prefix before it may be attached
to a thread. Without it, a student could attach a classmate's uploaded document
to their own thread and then download it through `report-url`. Verified: a
foreign path is refused with "That file was not uploaded by you".

Reading goes through **`report-url`**, which is `material-url` with a different
table: authorise in the database under the caller's own JWT
(`public.report_download`), then sign for 60 seconds with the service role. The
request carries a **file id, never a path**.

It is a separate function rather than a `bucket` parameter on `material-url`
because the thing that decides entitlement is the RPC it calls, and a shared
function would have to take the RPC name from the client.

Files upload **as they are picked**, not on submit: a 40 MB portfolio uploaded
inside the submit handler would leave a button spinning, and a failure would
lose the comment typed above it. The cost is an orphan object when somebody
picks a file and walks away — accepted, the same property `course_materials`
has, and an unreferenced key in a private bucket is unreachable.

## Telling people

Two channels, and they follow **different** rules from the appointment module.

**In-app** (`docs/notifications.md`): four new `notification_kind` values —
`report_submitted`, `report_comment`, `report_status`, `report_assigned` — all
written by `app.notify_report` **in the same transaction as the write they
report**. That is what makes them more reliable than the email: if the comment
exists, so does the notice. All four share one payload, so only `titleOf`
branches in `NotificationBell.tsx`.

Four kinds and not one `report_activity`, because a row is an event and not a
sentence: "your report was approved" and "somebody left a comment" are different
events with different urgency, and folding them would push the distinction into
`data` and make the client branch on a string it cannot typecheck.

**Email** (`send-report-notice`): four events, one function, the
`send-appointment-notice` shape. The body carries `report_id` and `event_id` and
nothing else — **what happened, who did it, and therefore who to tell all come
from the stored `report_events` row**, so a client cannot ask this function to
mail somebody about something that did not happen.

### Who is told: the other party, never the actor

This is the **opposite** of `send-appointment-notice`, deliberately.

There, an actor-skip was wrong because the student is nearly always the actor —
they book and cancel their own sessions — so skipping the actor meant never
telling the student anything at all (176 `appointment_booked` rows to
instructors against **one** to a student).

Here both sides act on the same thread, repeatedly. Mailing somebody a copy of
the comment they just wrote is noise, not a receipt. So:

| event | told |
| --- | --- |
| `submitted` | the checker |
| `comment` | whichever side did not write it |
| `status` | the student |
| `assigned` | the incoming checker **and** the student, minus whoever acted |

`assigned` tells both for the same reason `appointment_reassigned` does: a
student whose checker changed without being told would be waiting on the wrong
person.

No receipt columns, only a per-(event, recipient) Resend `Idempotency-Key`. A
timeline event is append-only and happens once, so there is nothing a column
would distinguish that the 24h key does not — the same conclusion the
appointment function reached for its two newer events.

## Screens

**`/reports`** (staff) — the queue, oldest first, paged 50 server-side with `id`
as the final tie-break. Four `FilterStatCard`s, because a tile is a sum over a
set and pressing it should show that set.

There is **no instructor filter**, and that is not an omission: RLS already
narrows a trainer to their own reports, so a picker could not change the result
— the same conclusion `/appointments/list` reached. The "who holds it" column is
drawn for an admin only; for a trainer the answer is always "you".

Paged from the start rather than when it hurts. One report per (student, course)
means the ceiling is the enrolment count — already 677 here — and PostgREST
silently caps a request at the project maximum.

**`/reports/:id`** and **`/learn/reports/:id`** mount the same
`ReportThreadView`. It works out for itself what the reader may do, from the
server's `my_role`. The two pages differ in their shell and in where Back goes.

The timeline is **oldest first**, unlike every list in the back office: this is a
conversation, and a conversation read bottom-up is a conversation you have to
reassemble. The reply box sits at the end of it, where what you are about to add
will appear.

The three verdicts are three buttons, not a select plus a Save — a verdict is one
decision and pressing it is the whole act. Handing the report on is behind the
`⋯` menu: occasional, and not something to have next to a reply box.

**`/learn/reports`** (learner) — one row per enrolled course, keyed on
**enrolments, not reports**, so a course with nothing sent is a row with a Send
button rather than an absence to interpret. Same argument
`/courses/:id/billing` makes about students who were never invoiced.

**Both dashboards** carry it: the trainer's gets a "Reports to check" card
showing how long each has **waited** (not when it arrived), beside the marking
queues; the learner's gets "Your reports" beside their sessions.

## Appointments on the dashboards

Fixed alongside, because it was the same gap: the trainer dashboard already had
**Your week** and **Needs closing**, but the **learner dashboard had no
appointments at all** — a student's only sight of their own sessions was
`/learn/appointments`.

It now carries a sessions card beside the reports one, cut on **`ends_at`, not
`starts_at`**, the same rule the register uses: a session being taught right now
is still today's session, not history.

The admin dashboard (`Dashboard.tsx`) still has no appointments card. Left
alone deliberately — it answers "how is the academy doing", and a diary is not
that question.

## Deliberately not done

- **No deadline on a report.** Coursework has `due_at` and a grading queue; this
  is a document going back and forth until it is right. A due date would want a
  late policy, and there is no evidence anybody wants one.
- **No grade.** A report is approved or it is not. Marks live on assignments.
- **No document-type entity.** "LPKC, slide dan portfolio" lives in the title,
  the same way a course intake lives in its title and there is no cohort table.
- **No academy-wide on/off setting.** The pool is the switch.
- **Nothing tells the outgoing checker on a handover** — the same gap
  `cancel_appointment` has, and for the same reason: `instructor_id` is
  overwritten in place, and recovering the previous one would cost a column.
- **Emails are English**, like every other mail function here.
