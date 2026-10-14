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

### 3. One report per (student, course, part)

This began as one thread per (student, course): a student's LPKC, slide and
portfolio were checked together — the appointment notes name those three in one
breath — as versions and files on one thread with one status and one checker.
It is now one thread per **part** of the LPKC (summary, report, slides; see
"The parts of an LPKC"), because each is approved for itself.
`report_submissions_one_per_stage` says so. Within a part the rest holds: not
one thread per document.

Sending again does not open a second thread: `submit_report` bumps `version`,
files the new documents under a `submitted` event carrying that number, sets the
status to `in_review` and **keeps the same checker**. The person who asked
for the changes is the person who should see them.

## Tables

| table                | holds                                                        |
| -------------------- | ------------------------------------------------------------ |
| `report_submissions` | one thread per (student, course, part): title, status, version, checker |
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

## Stages staff see (Oct 2026)

Inside `in_review`, staff read two stages
(`20261012130000_report_stages.sql`):

| stage              | when                                                       | label (EN)                |
| ------------------ | ---------------------------------------------------------- | ------------------------- |
| `moderating`       | `in_review`, no staff-only entry on the current version (never a summary) | Moderating |
| `pending_approval` | `in_review`, a staff-only entry on the current version     | Pending trainer approval  |

`changes_requested` and `approved` are read as they are. An academy with no
system admin has no first step, so there `in_review` reads `pending_approval`
and nobody is ever "moderating".

- **A reading, not a status.** `report_submissions.status` keeps its four
  values and a student keeps seeing "Being checked": a student's JWT reads that
  column straight from PostgREST, so a stored `moderating` would have shown them
  the step. The stage is built from the staff-only entry, which they cannot
  read.
- **`public.report_stage(report_submissions)`** returns it, and PostgREST
  serves it as a computed column — the queue selects `report_stage` and filters
  on it. It re-reads the row by id and checks `app.report_role`, because it is
  also callable as `/rpc/report_stage` with a row the caller made up: no access
  gives null, the student whose report it is gets the plain status.
- **`report_stage_counts`** is the tiles' query. `report_counts` is untouched,
  for app builds that already read it.
- **A new version goes back to `moderating`**, because the staff-only entry is
  matched on `version`. Reopening an approved report lands on
  `pending_approval` when its version already has the entry.
- The status is not stored, so it moves nothing and notifies nobody; the
  entries and notices are exactly as in the section above.

## The parts of an LPKC (Oct 2026)

The LPKC is produced in three parts, and each is sent, checked and approved for
itself:

| `lpkc_stage` | the part            | what a send is made of                                  |
| ------------ | ------------------- | ------------------------------------------------------- |
| `summary`    | LPKC summary        | title, introduction, objectives, problem statement; **no documents** |
| `report`     | LPKC report         | title and at least one document                         |
| `slide`      | LPKC slides         | title and at least one document                         |

`20261013100000_course_lpkc_stage.sql`, `20261013110000_lpkc_stages_per_report.sql`.

- **The summary takes no documents** (the owner, the day parts arrived). Every
  door refuses a student's file on a summary — see "What each part takes"
  below. Staff still attach on a summary thread — the checker's copy arrives
  that way. The 9 documents students had sent with a summary before this
  were removed on 15 Oct 2026 (see "The reset of 15 Oct 2026").

- **A course says which parts it is taking** — `courses.lpkc_stages`, a set.
  More than one can be open at once: an intake sends its report and its slides
  side by side. Empty means the course takes no LPKC yet. Seeded from where the
  intakes were on the day: Siri 1 and Siri 2 `{report, slide}`, Siri 3
  `{summary}`. A new course — and a duplicated one, since `duplicate_course`
  names its columns — starts at `{summary}`.
- **A thread is one part** — `report_submissions.lpkc_stage`, and the unique
  key is now (student, course, part). The first cut of this gave a course ONE
  stage and kept one thread per course; the owner corrected it the same day: a
  student submits the LPKC and/or its slides, so they cannot share a status.
- **An admin sets a course's parts**, with three checkboxes in the Edit course
  dialog (`CourseFormDialog`). `courses` is writable by every staff member,
  because a trainer builds the course they teach, so the column has its own
  guard: `app.guard_course_lpkc_stage` refuses a change from a JWT that is not
  an admin of the academy, and anything but `{summary}` on a trainer's insert.
  It also keeps the set in order with no repeats. A trainer is not shown the
  field and their save does not carry the column.
- **Starting a part needs the course to be taking it; carrying on does not.**
  Unticking a part stops new threads on it, but a student halfway through their
  corrections can still send the next version, and the row stays on their list
  (`my_reports` lists every open part plus any part they have a thread on).
- **The same checker follows the student.** A new part goes to whoever holds
  the student's other part on that course, while that person is still in the
  rota; only otherwise does the rota choose. The reason is the one for keeping
  a checker across versions — they already know the project.
- **What was sent before this** was backfilled by course: Siri 3's 29 threads
  are `summary`; Siri 1 and 2's six are `report`. Most of those six carry the
  slides on the same thread — they stay where they are, and slides sent from
  now on get their own.
- **Not the same word as "Stages staff see" above.** `report_stage` /
  `ReportStage` is where one thread sits in the checking queue; `lpkc_stage` /
  `LpkcStage` is which part of the work it is. The owner calls both "stage", so
  the code keeps them apart by name.

### What each part takes (Oct 2026)

`20261015090000_lpkc_file_types.sql`. A thread's part is the type of every
document on it, so a student's file has to be that part's kind:

| part    | a student may send        |
| ------- | ------------------------- |
| summary | nothing                   |
| report  | `.pdf`, `.doc`, `.docx`   |
| slides  | `.pptx`, `.ppt`, `.pdf`   |

- **Checked by the file name's extension**, in `app.assert_lpkc_files`, on
  every door a student's file comes through: all three `submit_report`
  overloads (through `app.submit_report_impl`) and `comment_on_report`. A PDF
  is allowed on both the report and the slides, because slides are often
  exported to PDF — the part decides which it is.
- **Staff are not limited.** The checker's copy and anything an admin attaches
  go on as before.
- **The web says so before uploading**: the picker offers only those types and
  refuses another with `report.file.wrong_type` (`LPKC_FILE_TYPES`), because
  the server's refusal would come after a 40 MB upload.
- **A student's file is always the next version.** Before this, a file sent
  from the reply box was filed as a comment on the version already there: the
  documents of "version 2" were not everything the student had sent for it,
  and it went to the checker instead of the system admins. `comment_on_report`
  now files a student's reply that carries a file exactly as `submit_report`
  files a resubmission — version + 1, a `submitted` entry (with the reply as
  its text), `in_review`, the system admins told — leaving the title and the
  summary's fields as they are. An approved report takes no more versions, so
  its student gets no picker there.

Found when this was built: 7 slides on report threads, 6 of them sent from the
reply box. The 5 belonging to the 3 students who had no slides thread were
moved onto a new one each on 15 Oct 2026 (same checker, version 1, read as
moderating, nobody notified) — the entry and its files re-pointed, nothing
deleted. The other 2 are byte-for-byte copies of files already on that
student's slides thread and stay where they are.

### The reset of 15 Oct 2026

At the owner's request every thread was put back to its first submission:
each keeps only its earliest `submitted` entry and that entry's files, at
version 1, `in_review`, `reviewed_at` / `approved_at` cleared and
`submitted_at` the first send — so all 142 read as moderating, summaries
included (their "Diterima." entry went too). 122 entries and 26 file rows were
removed. They, and every thread as it was, are kept in
`app.report_events_reset_20261015`, `app.report_files_reset_20261015` and
`app.report_submissions_reset_20261015` (no client access;
`20261015120000_report_thread_reset_backup.sql`). The storage objects were not
touched, so anything can be put back. Nobody was notified.

The same day the 9 documents still attached to summary submissions were
removed as well — a summary takes none — leaving each summary its text only.
Their rows are in the same `app.report_files_reset_20261015`.

### The doors, and the builds that do not name a part

`submit_report` has a third overload that takes `_stage` and asks for what that
part is made of (the table above). The web sends through it. Nothing else about
a thread changed: status, versions, the timeline, the notices and the two
checking stages all work per thread as before, and the queue tiles count
threads.

The two older overloads are untouched in what they ask for, because the mobile
apps in people's hands still call them and still list one report per course.
They do not name a part, so `app.lpkc_legacy_stage` picks one: the earliest
part the student has unfinished; failing that, the first part the course is
taking that they have not started; failing that, the latest part they finished.
`my_reports` keeps its `report` key on the same rule, beside the new `stages`
list. By part and not by date, so the one report an older build shows does not
change under the student each time they send the other one. The cost is that
an older build reaches only one part at a time — the rest is on the web until
the mobile apps learn about parts.

On the screens: `/learn/reports` is one row per (course, part); the send dialog
is titled with the part and shows the summary's three fields only for the
summary; the queue, the trainer dashboard card and the thread header name the
part in their second line. `set_report_brief` is unchanged, and the thread
offers its fill-in boxes on a summary only.

`app.submit_report_impl` has a seven-argument predecessor that nothing calls.
The MCP tool declines a `drop function`, and the CLI could not connect, so it
is still there: no client role can execute it. Remove it with
`drop function app.submit_report_impl(uuid, uuid, text, text, text, text, jsonb);`.

## What a report says (Oct 2026)

Sending a report asks for four things: **Title** (`title`, what it always was),
**Introduction** (Pengenalan), **Objectives** (Objektif) and **Problem
statement** (Penyata masalah) — `introduction`, `objectives`,
`problem_statement` on `report_submissions`
(`20261012110000_report_brief.sql`).

- **They live on the thread, not on a version.** One thread per (student,
  course) means one introduction per thread. Sending a new version opens the
  same dialog seeded from what is stored, required again, and what is sent
  replaces it. Earlier wording is not kept — the timeline keeps the *files* per
  version, and nobody asked for the text's history.
- **Required by the server**, not only the button: the 7-argument
  `submit_report` raises for a blank one. A report sent before this has all
  three null and is not backfilled; the next version has to fill them in.
- **Shown on `/learn/reports/:id` and `/lpkc/:id`** — one `ReportThreadView`,
  so the checker reads what the student wrote beside the documents. Nothing is
  drawn for a field that is empty.
- **The 4-argument `submit_report` still exists**, as a wrapper over the same
  `app.submit_report_impl`, for Student app builds installed before this: it
  passes the three as null and leaves whatever the thread already holds. It is a
  deliberate hole in "required" and should be removed (one `drop function`) once
  the Student app that asks for the fields has shipped. The two overloads have
  no shared defaults so PostgREST never sees an ambiguous call.
- Capped at 5000 characters each by a check constraint.
- **A student can fill in a blank without sending a version.**
  `set_report_brief` (`20261012150000_report_brief_fill_in.sql`) writes only the
  fields that are still empty, for the student the report belongs to, at any
  status. It cannot overwrite wording — changing what is written is still a new
  version — and it is not a reply: no timeline entry, no notification, no status
  move. The thread screen shows a box for each blank to its student, on both web
  and mobile; staff see nothing for a blank.
- **Documents are optional** (`20261012160000_report_files_optional.sql`). The
  four fields are the substance of a send; a null or empty file list is a
  complete submission, with its `submitted` entry, version and notice. Documents
  can follow as a reply. A `files` value that is not a list is still refused.
- **The mobile Student app asks for the same fields** — both send sheets and the
  thread screen (`features/reports/BriefFields.tsx`). Builds installed before
  that ships keep working through the 4-argument door.

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
- **It carries no person's name.** `actor_name` is null and `actor_role` is
  `system`; the timeline headlines it "Hawary Academy LMS" (`report.event.annotated`,
  the same in EN and BM, for old entries and new). It is a document for the
  checker, not a message from somebody.
- **It is the moment the checker is told** — with `report_submitted`, the notice
  they would have had when the report came in, worded the same.

**Nothing in the product says this step exists**, and that is the owner's rule,
not an oversight. From the student's side nothing happens between sending a
report and hearing from their checker. On the staff side there is the copy and
nothing about where it came from: no badge, no "pre-checked", no name on the
entry, no line in an email or a push. Do not add one.

### A summary is received by itself (Oct 2026)

`20261013120000_summary_received.sql`. A summary is four fields of text and
takes no documents, so there is no copy to prepare. Every summary sent — the
first time or as a new version, through any of the three `submit_report` doors
— gets its staff-only entry in the same statement as the send: body
`Diterima.`, no name, `actor_role = 'system'`, `actor_id` null.

What follows is what follows a system admin adding one, because it is the same
entry (the owner asked for exactly that, after asking what such a reply
affects):

- the report stays `in_review` and `reviewed_at` is untouched;
- the student is not told and cannot read it — verified as a signed-in student:
  `get_report` and a direct read of `report_events` both leave it out;
- the checker is told at once, in the app and on their phone, and staff read
  the report as `pending_approval` — a summary is never `moderating`;
- the system admins are **not** told about a summary. Their notice exists to
  ask for the entry, and it is already there.

Three details:

- **`actor_id` is null**, where a system admin's own entry carries theirs.
  Nobody did this, and `send-report-notice` skips a recipient who is the actor
  — a system admin who is also the checker must still be told.
- **`created_at` is `clock_timestamp()`**, so it sorts after the `submitted`
  entry it answers; `now()` is the same instant for both in one transaction.
- **The email.** The client sends its notice for the `submitted` entry, as
  always — it never holds the other entry's id. So `send-report-notice` reads a
  `submitted` entry whose version already has a staff-only entry with no actor
  as the checker's notice, and mails the checker instead of the system admins.

The report and the slides still wait for a system admin, and an academy with no
system admin is unchanged (no entry; the checker was already told at once).

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
| `submit_report` | the student | create or bump a version of one part; assigns on creation; asks for what the part is made of |
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
| `submitted` | the academy's system admins — or the checker, when it has none, or when it is a summary (received by itself) |
| a staff-only entry | the checker |
| `comment` | whichever side did not write it — except a student's reply while the version still waits for its copy (`in_review`, nothing staff-only on it yet), which goes to the system admins |
| `status` | the student |
| `assigned` | the incoming checker **and** the student, minus whoever acted |

`assigned` tells both for the same reason `appointment_reassigned` does: a
student whose checker changed without being told would be waiting on the wrong
person.

The owner's chain, and the rule both the in-app notice (`comment_on_report`)
and the email (`send-report-notice`) follow: a student's new document reaches
the system admins only; the system admins' entry reaches the checker; the
checker's reply reaches the student; and round again. Before Oct 2026 a
student's reply could break it two ways — a file in a reply, and any reply
sent before the copy — both of which told the checker early. A student's file
is now a version, and a reply before the copy goes to the system admins.

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

**`/lpkc`** (staff) — the queue, paged 50 server-side with `id` as the final
tie-break. It has been through three shapes in a week; this is the one the owner
settled on (Oct 2026):

- **The cards are All and the three parts of the LPKC** — summary, report,
  slides — and they are the page's only filter, each with its count. A checker
  works through one kind at a time, so the kind is what they pick. **It opens
  on All** (it opened on the summaries for a day); pressing the pressed kind
  goes back to All. Every row carries its part as a
  filled, coloured badge beside the student's name (sky, violet, pink — colours
  no status uses, so it is not read for the outlined status badge). A row does
  not show the report's title — the student's own wording is read on the
  thread.
- **No filter by status; the list is sorted by it instead**: moderating,
  pending trainer approval, changes needed, approved — what needs somebody at
  the top, what is finished at the bottom. Within a status the oldest
  `updated_at` comes first, and that is the date the row shows.
  `public.report_stage_rank` is a computed column like `report_stage`, so the
  server sorts and pages on it.
- **A trainer is not shown what is still being moderated** — here or on their
  dashboard card — and the card counts leave it out for them. Their three
  statuses are pending trainer approval, changes needed and approved. This is
  what the screens list, **not a boundary**: the report is assigned from the
  moment it is sent and is the trainer's under RLS, so the thread still opens
  from a direct link, and the mobile Academy app still lists it. Making it a
  boundary would mean a stage test inside the `reports` SELECT policy.
- **The part is in the address** (`?type=report`; absent means every kind).
  Opening the page from the menu therefore lands on every kind, while a row
  hands its query string to the thread page as
  `state.back`, so Back returns to the kind being worked through.
- **The counts** are `report_part_counts`, one grid of part × stage, summed per
  card.

The sidebar badge is separate and unchanged: it counts the reader's own stage
(`deskStage`) — moderating for an admin, pending trainer approval for a trainer
— across every part, through RLS. The mobile Academy app's tab badge and queue
are as they were (everything waiting, longest since sent first).

There is **no instructor filter**, and that is not an omission: RLS already
narrows a trainer to their own reports, so a picker could not change the result
— the same conclusion `/appointments/list` reached. The "who holds it" column is
drawn for an admin only; for a trainer the answer is always "you".

Paged from the start rather than when it hurts. One report per (student, course,
part) means the ceiling is three times the enrolment count — already 677 here — and PostgREST
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

**The Competency Profile Chart is a button pinned bottom-right**, for staff on
a summary thread only (the owner's placement — a summary is what gets matched
to a competency unit and work activity): it opens a drawer showing the
programme's CPC (NOSS P851-002-4:2025 — the competency
units and work activities an LPKC is written against), so a checker reads it
beside the thread instead of hunting for the PDF. The PDF ships with the web
app (`features/reports/cpc-p851-002-4-2025.pdf`), not a bucket: it is the
published standard, the same for everyone, and changes only with a new NOSS.

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
queues; the learner's lists the parts of the LPKC that apply to them, each with
its status ([web-surface.md](web-surface.md) → "Two dashboards").

## Appointments on the dashboards

Fixed alongside, because it was the same gap: the trainer dashboard already had
**Your week** and **Needs closing**, but the **learner dashboard had no
appointments at all** — a student's only sight of their own sessions was
`/learn/appointments`.

It now names the next session on its Appointments card, cut on **`ends_at`,
not `starts_at`**, the same rule the register uses: a session being taught right
now is still today's session, not history.

The admin dashboard (`Dashboard.tsx`) still has no appointments card. Left
alone deliberately — it answers "how is the academy doing", and a diary is not
that question.

## Deliberately not done

- **No deadline on a report.** Coursework has `due_at` and a grading queue; this
  is a document going back and forth until it is right. A due date would want a
  late policy, and there is no evidence anybody wants one.
- **No grade.** A report is approved or it is not. Marks live on assignments.
- **No document-type entity beyond the three parts.** A thread is the summary,
  the report or the slides; anything finer ("portfolio") still lives in the
  title and the file names.
- **No academy-wide on/off setting.** The pool is the switch.
- **Nothing tells the outgoing checker on a handover** — the same gap
  `cancel_appointment` has, and for the same reason: `instructor_id` is
  overwritten in place, and recovering the previous one would cost a column.
- **Emails are English**, like every other mail function here.
