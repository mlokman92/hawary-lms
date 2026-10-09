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

The rota is edited from a dialog behind the `⋯` menu on `/lpkc`, admin-only.
Not a settings page: `/appointments/settings` earned one by having three cards
on it, and this has one switch per instructor.

### 3. One report per (student, course)

Not one per document. A student's LPKC, slide and portfolio are checked
together — the appointment notes name those three in one breath — so they are
**versions and files on one thread** with one status and one checker.
`report_submissions_one_per_course` says so.

Sending again does not open a second thread: `submit_report` bumps `version`,
files the new documents under a `submitted` event carrying that number, sets the
status to `in_review` and **keeps the same checker**. The person who asked
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

**The status follows whoever spoke last** (Oct 2026,
`20261009090000_report_auto_status.sql`). Nobody sets it by hand except to
approve.

    student sends anything ──▶ in_review ◀──┐
                                  │         │ student sends anything
            academy sends anything ▼        │
                           changes_requested┘
                                  │
            staff press Approve   ▼
                              approved ──(staff press Reopen)──▶ in_review

`in_review` waits on the **checker**. `changes_requested` waits on the
**student**. `approved` is done.

- "Sends anything" is a new version, a reply or a file — from the student it
  means the checker has something to look at, from the academy it means the
  student does. So the status answers one question: whose turn is it.
- **`approved` is sticky.** A "well done" after approval must not reopen the
  report, so the automatic rule leaves an approved report alone, whoever writes.
  Staff undo an approval with Reopen, which is an explicit `_to_status`.
- **`submitted` ("Waiting") is no longer written.** It stays in the enum because
  timeline entries from before the rule carry it, and because dropping an enum
  value is not worth a table rewrite. Nothing reads it as a live state.
- An empty post is refused unless it is a decision — otherwise sending nothing
  would be a way to flip the status back and forth.

Before this a checker chose "Being checked" or "Changes needed" with a button,
and a fresh upload sat in `submitted` until somebody did. The owner asked for
it to run itself: the buttons were one more thing to press after writing the
reply that already said what the status was.

"How many are waiting on me" is `status in ('submitted','in_review')`, narrowed
by RLS to the reader's own — the `submitted` half is now always zero.

Staff may still pass `_to_status` to `comment_on_report`; an explicit status
wins over the automatic one. That is how Approve and Reopen work, and it is what
the three verdict buttons in app builds installed before this change send. A
student who sends `_to_status` is **ignored, not refused** — the same way a
student naming an instructor under round robin is ignored. Deciding is simply
not theirs to do.

## The copy a checker starts from

In an academy that has a **system admin** ([single-owner.md](single-owner.md) →
"System admins"), a report passes through one more pair of hands before its
checker hears of it (Oct 2026,
`20261009100000_system_admin_report_handoff.sql`):

    student sends, or sends again   ──▶ the system admins are told
    a system admin adds a copy      ──▶ the checker is told
    the checker replies             ──▶ changes_requested; the student is told

The copy is the student's document with notes on it. The system admin adds it
the ordinary way — attach, Send — and the server, seeing who is writing, files
it as a **staff-only entry** (`report_events.staff_only`):

- **It moves nothing.** The report stays `in_review`, and `reviewed_at` is left
  alone — the student's own list reads that as "last activity".
- **The student cannot read it, or its files.** `get_report` leaves it out of a
  student's thread and does not carry the flag at all; the SELECT policies on
  `report_events` and `report_files` refuse it, because a student's JWT reads
  those tables straight from PostgREST; and `report_download` will not sign its
  file. The student is not notified, mailed or pushed.
- **It carries no name.** `actor_name` is null and `actor_role` is `system`; the
  timeline calls it "Annotated copy". It is a document for the checker, not a
  message from somebody.
- **It is the moment the checker is told** — with `report_submitted`, the notice
  they would have had when the report came in, worded the same.

**Nothing in the product says this step exists**, and that is the owner's rule,
not an oversight. From the student's side nothing happens between sending a
report and hearing from their checker. On the staff side there is the copy and
nothing about where it came from: no badge, no "pre-checked", no name on the
entry, no line in an email or a push. Do not add one.

Three edges:

- **No system admin, no extra step.** `submit_report` tells the checker at once
  when the academy has none (a branch, or this academy if the flag is ever
  cleared), so a report can never arrive with nobody told.
- **Only the telling is held back.** The report is assigned by the rota when it
  is sent and sits in the checker's queue from that moment. A checker who opens
  it early and replies has replied.
- **A decision is still a decision.** Approve and Reopen from a system admin are
  ordinary, visible entries with their name on them. So is anything they write
  on a report they are themselves the checker of.

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
the parent rather than repeating the three tests, so the two cannot disagree —
plus one test of their own: a student does not see a staff-only entry (see
"The copy a checker starts from").

Clients have **no DML on any of the three tables.** Assignment has to be fair,
and a status change has to be the same statement as the timeline entry and the
notification that reports it — the `approve_enrollment` lesson. Four RPCs are
the only doors:

| RPC | who | what |
| --- | --- | --- |
| `submit_report` | the student | create or bump a version; assigns on creation |
| `comment_on_report` | student, checker, admin | say something — the status follows; staff may also approve or reopen |
| `reassign_report` | the checker holding it, or an admin | hand it on |
| `get_report` | anybody the policy admits | the whole thread, projected |

Plus `my_reports` (the learner's list), `report_counts` (the tiles) and
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
| `submitted` | the academy's system admins — or the checker, when it has none |
| a staff-only entry | the checker |
| `comment` | whichever side did not write it |
| `status` | the student |
| `assigned` | the incoming checker **and** the student, minus whoever acted |

`assigned` tells both for the same reason `appointment_reassigned` does: a
student whose checker changed without being told would be waiting on the wrong
person.

A reply that moved the status by itself is told as a **comment** — reading it is
what the other side has to do. Only a decision (approve, reopen) is told as a
`status`.

**Phones** get the same events a third way: every `notifications` row is copied
to the person's registered devices by `send-push`
([mobile-apps.md](mobile-apps.md) → "Push"), so nothing report-specific is
needed for it. The email is the odd one out — it is sent by a second call from
the client that made the write, so it depends on that client staying open for a
moment longer.

**Known gap:** when an admin replies on a report somebody else holds, the
student is told and the checker holding it is not.

No receipt columns, only a per-(event, recipient) Resend `Idempotency-Key`. A
timeline event is append-only and happens once, so there is nothing a column
would distinguish that the 24h key does not — the same conclusion the
appointment function reached for its two newer events.

## Screens

The sidebar item is labelled **LPKC** in both shells and both languages — the
academy's own word for what is being checked. Only the sidebar: the page
headings and Back links say "LPKC checks" (staff) / "My reports" (learner)
through their own keys (`report.title`, `report.learn.title`), so do not point
them back at `nav.reports`.

The staff queue lives at **`/lpkc`**. `/reports` and `/reports/:id` redirect
there and must stay: emails already sent link to the old address, and
`send-report-notice` still writes it. The learner side is unchanged at
`/learn/reports`.

**`/lpkc`** (staff) — the queue, oldest first, paged 50 server-side with `id`
as the final tie-break. Three `FilterStatCard`s — being checked, changes needed,
approved — because a tile is a sum over a set and pressing it should show that
set. There is no "Waiting" tile: nothing is ever in that state now.

There is **no instructor filter**, and that is not an omission: RLS already
narrows a trainer to their own reports, so a picker could not change the result
— the same conclusion `/appointments/list` reached. The "who holds it" column is
drawn for an admin only; for a trainer the answer is always "you".

Paged from the start rather than when it hurts. One report per (student, course)
means the ceiling is the enrolment count — already 677 here — and PostgREST
silently caps a request at the project maximum.

**`/lpkc/:id`** and **`/learn/reports/:id`** mount the same
`ReportThreadView`. It works out for itself what the reader may do, from the
server's `my_role`. The two pages differ in their shell and in where Back goes.

The timeline is **oldest first**, unlike every list in the back office: this is a
conversation, and a conversation read bottom-up is a conversation you have to
reassemble. The reply box sits at the end of it, where what you are about to add
will appear.

**Send is the only button on the thread**, for both sides. It belongs to the
reply box, and the status moves by itself when it is pressed (see **Statuses**),
so there are no status buttons to choose between.

**Approve is behind the `⋯` menu**, with handing on. It ends the thread — the
student can no longer send a version — and happens once per report, and beside
the reply box it was one mis-click from Send. On an approved report the same
menu item reads **Reopen**: Approve has no confirmation step, so it needs an
undo. Anything typed in the reply box goes with either, as the note explaining
it. The mobile thread screen has the same shape.

A timeline entry reads "{who} commented" whenever something was said, and shows
the status it moved to as a badge; "{who} updated the status" is kept for a
decision made with nothing said.

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
