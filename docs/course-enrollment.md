# Enrollment — joining an academy, and getting onto a course

**Anyone can enter an academy. Course access is what staff grant.**

## The model

Enrolling in a course *is* the intent to join the academy. Someone who opens a
course link has already decided; making them wait outside for approval before
they can even see a dashboard was friction with nothing behind it.

So there is **one public link per academy**, `/enroll/<slug>`. A visitor signs up
or signs in, picks a course, and in that same call:

1. a `students` record is created (or an existing one adopted — see below),
2. `app.link_claimed_record` links it to the account and upserts the `student`
   membership,
3. the chosen course is filed as `enrollments.status = 'pending'`.

They land on `/learn` a member, with no course open yet. Staff approve the
course, not the person.

Picking a course is what gates joining. There is no "join" button that does not
also ask for something, so nobody ends up sitting inside an academy having asked
for nothing.

## Why there is no application table

There was one, briefly, for a real reason: `enrollments.student_id` is `NOT NULL`
and an applicant had no student record. That premise is gone — the record exists
by the time anything is requested. Which means:

- `enrollments.status = 'pending'` expresses the request exactly;
- `app.is_enrolled` already requires `'active'`, so a pending row carries no
  content access, no seat, and no place in `course_enrollment_stats`;
- the long-standing `enrollments: staff update` policy already lets staff move
  it — the same right they exercise enrolling somebody from `/students/:id`.

**Approving is a plain UPDATE.** No RPC, no second table, no review dialog. If
you find yourself writing one, check whether the premise came back first.

## The two RPCs

| function | grant | job |
|---|---|---|
| `get_academy_enrollment(_slug)` | **anon** + authenticated | The public page: academy branding, `is_open`, `intro`, and the courses that can be picked. Explicit column list — `courses` and `academies` are not readable by a non-member and must stay that way. |
| `join_academy(_slug, _course_id)` | authenticated | Everything above, in one transaction. |

`join_academy` is **idempotent and re-entrant**: an existing member calling it
again simply requests another course, which is why there is no separate
"request" function and why the same page serves both.

It refuses staff of that academy. A trainer joining as a student would hand
`link_claimed_record` a membership to reconcile for no reason.

### Adopting an existing record

Before creating anything, `join_academy` looks for an unlinked, unarchived
`students` row whose email matches the caller's **confirmed** auth email. That is
the same standard `my_pending_invitations` holds — without a token, a verified
email is the entire proof of identity — and it is what stops a CSV-imported
student who later uses the public link from becoming a second row.

## The intent survives the auth hop

The reported bug: sign up from the join link, click the confirmation email, land
on **"create your academy"**.

`emailRedirectTo` carries `?next=`, but GoTrue silently drops the whole redirect
when the URL is not on its allow list and substitutes the Site URL — the failure
already written up in [production-urls.md](production-urls.md). The `?next=` is
therefore not something to rely on alone.

So the slug is stashed in `localStorage` ([lib/enrollIntent.ts](../apps/web/src/lib/enrollIntent.ts)),
exactly like the invite token, and consulted by every place that decides where a
signed-in person belongs:

- `useLandingTarget` ([lib/landing.ts](../apps/web/src/lib/landing.ts)) — after
  the invite token, before `/onboarding`;
- `AppShell` and `StudentShell`, whose gates mirror it;
- `PendingInviteRedirect`, which recovers it on any `LANDING_PATHS` route —
  including `/onboarding`, which is where a dropped `?next=` deposits people.

It is cleared on a successful join and on sign-out, with the other per-academy keys.

## Settings

`academy_enrollment_settings` — one row per academy, **admin-only**, `is_open`
off by default. An absent row or `is_open = false` means `/enroll/<slug>` is
closed. `intro` is free text shown above the course list.

`course_enrollment_settings` — `is_open`, `capacity`, `closes_at`, nothing else.
A course appears on the link only when it is **published** and switched on here
(`app.enrollment_open`). Capacity deliberately does **not** close a course: a
queue of people who want the next seat is the point of approving at all.

There is no form configuration. The join form asks for a course; the name, phone
and email come from the account, which sign-up already collected. Anything else
the academy needs, it edits on the student record.

`duplicate_course` copies `capacity` and resets `is_open`/`closes_at` — a new
intake must not inherit last term's window, or open on a course nobody has
finished writing.

## Surfaces

| where | what |
|---|---|
| `/enroll/:slug` | public. Academy, intro, the courses on offer, and sign-up / sign-in / join |
| `/enrollments` | **all of the staff side**: the link and its switch, which courses accept requests and their limits, the request list with Approve/Reject, and bulk enrol |
| `/courses/:id` | building the course. *New module* is the only button; Edit and Duplicate are in the `⋯` menu. No enrollment controls, no Grading button |
| `/learn/courses` | a plain row per pending request, so a student who just joined can see it landed |

## Bulk enrol by email

The dialog on `/enrollments` takes a pasted list or a CSV (`email` / `e-mel` /
`emel` header recognised; otherwise every cell is treated as an address).
Parsing reuses [lib/csv.ts](../apps/web/src/lib/csv.ts) and de-duplicates before
matching.

Addresses match against **`students` in this academy and nothing else** —
enrolling is adding a *record* to a course, and there is no record to add for an
address the academy has never seen. Five buckets, all shown before a single row
is written: to enroll · already enrolled · no student record · more than one
match · not an email.

Matching runs in the browser against the loaded roster, because stored addresses
keep whatever case they were typed in and Postgres `in` is case-sensitive — only
a client-side compare makes `Aina@` find `aina@`. Writes are
`upsert(onConflict: 'course_id,student_id')` chunked 100 at a time, so a student
previously dropped from the course is reactivated rather than colliding with the
unique index.

## Approval email

Approving a request is the one enrollment write that tells the student
anything. The other three paths stay silent, deliberately: staff enrolling from
the student page, bulk enrol, and the public link (which only creates a
request).

**The copy is per course, and silence is the default.** There is no
product-wide template. Each course carries its own body in
`course_enrollment_settings.access_email_body`, written by staff on
`/enrollments` beside `is_open`, `capacity` and `closes_at` — it is enrollment
configuration, not course metadata, and only a course that accepts requests can
produce an approval. **A course with no settings row, or a blank body, sends
nothing**, which is not an error: five of seven courses had no row at all when
this shipped. `approve_enrollment` tests for the body before it claims, so a
course that cannot send never stamps `access_email_at` — without that test the
column would record a send that was never attempted.

Staff write plain text with three placeholders (`{{student_name}}`,
`{{course}}`, `{{academy}}`); the subject stays generated and the *Open the
course* button is appended, so there is one field to fill, no way to ship a
blank subject, and no way to forget the link. The body is HTML-escaped **before**
the placeholders are filled with already-escaped values, so nothing typed can
become markup.

**Approving is now `approve_enrollment(uuid)`, not a plain UPDATE.** That
reverses an earlier decision, and the reason is new: approving acquired an
irreversible side effect, so the transition and the decision to email have to be
one statement. Two staff clicking Approve on the same row is the normal case,
and a select-then-update would send twice — the same argument as
`app.claim_incentive_payouts`. The RPC locks the row with `SELECT … FOR UPDATE`,
asserts it is not already active, flips it, and claims the email. The loser of
the race gets `already_active` and sends nothing. It stays SECURITY **INVOKER**:
RLS applies the `enrollments: staff update` policy's USING clause to the
`FOR UPDATE`, so a caller who may not write the row finds nothing.

**A trigger cannot do this job.** `bulkEnroll`'s upsert resolves to
`ON CONFLICT DO UPDATE` and re-activates a *pending* student — `classifyEmails`
only excludes rows already `active` — producing `old.status='pending'` →
`new.status='active'`, byte-identical to an approve. The tuples are the same, so
no trigger can tell them apart. Intent has to be declared by the caller.

The RPC returns **no student data**. Handing the recipient to the browser and
back to the Edge Function would make that function's recipient client input, and
an open relay. `send-course-access` re-reads the address itself under the
caller's own JWT, and refuses any row whose `access_email_at` is null — so the
column is the authorization to send, and no bulk-enrolled or directly-enrolled
student is reachable through it.

Three nullable columns carry the record, because Edge Function logs are gone at
seven days and "was this student emailed" has to stay answerable:
`approved_at` (the gesture happened) · `access_email_at` (a send was claimed) ·
`access_email_id` (Resend accepted it). `access_email_at` set with
`access_email_id` null is the one otherwise-invisible failure — claimed, never
confirmed. The claim necessarily precedes the send; a mutex that runs after the
side effect is not a mutex.

At most one email per enrollment, ever: `access_email_at IS NULL` guards it on
top of FROM-`pending`. The two guards are kept **separate** from the transition
on purpose — folding them together would make a legitimate re-approve silently
refuse to move the status, which is a worse bug than a missing email.

See `supabase/functions/send-course-access/README.md` for the four column
states, the resend path and the kill switch.

## Enrolment history

`enrollments` holds the present and nothing else. It has no `created_by`, and
the staff screens change a student's course by **deleting one row and inserting
another** — so when a student turns out to be in the wrong course, the table
cannot say who put them there, or that they were ever anywhere else. The owner
met exactly that on a Siri 3 student who belonged to Siri 2.

`enrollment_events` is the answer: an append-only log, shown under **Enrolled
courses** on `/students/:id` — what happened, who did it, when.

| kind | written when |
| --- | --- |
| `enrolled` | a row is inserted |
| `removed` | a row is deleted |
| `moved` | `course_id` changes on a row that stays (today only SQL does this) |
| `status` | `status` changes — `pending` → `active` is an approval |

**A trigger writes it, not the mutations.** Enrolments are written from six
places — the student page, the course roster, bulk enrol, CSV import, the
public link's `join_academy`, approvals — plus SQL by the owner. A log that
depends on every caller remembering it has holes exactly where the mistakes
are. `app.log_enrollment_event` is SECURITY DEFINER and reads `auth.uid()`, so
the actor is whoever made the change by whatever route, including the student
themself on a self-enrol. An UPDATE that changes neither course nor status
(stamping `access_email_at`) writes nothing.

**Titles and the actor's name are snapshots.** A line has to stay readable
after the course is renamed or deleted and after the staff member's account is
gone — those are the cases it is read in. The ids sit beside them and go NULL
when the row they point at does.

**The log can never block an enrolment.** When a student or a course is
deleted its enrolments cascade, and the trigger fires for each after the parent
is already gone; it finds nothing to attach a line to and skips. Any other
failure is swallowed. A missing history line is a nuisance; an enrolment
refused because the log could not be written is an outage.

**The actor is blank on two kinds of line, on purpose.** The 800 enrolments
that existed when the log was created were back-filled as `enrolled`, dated by
`enrolled_at`, with no actor: who made them was never recorded, and a guess in
an audit log is worse than a blank. And a change made in SQL has no signed-in
user. Everything done through the app from 2026-10-10 carries a name.

Staff read it (`app.is_staff`); clients have no DML on it. A student has no use
for the name of the admin who enrolled them, so there is no `owns_student` arm.

## One student, one course

The business rule was always "one student, one course". Until 2026-10-10
nothing held it: a student could be put in two courses, and one was.

**`enrollments_one_course_per_student`** is a partial unique index on
`student_id where status <> 'cancelled'`. An index, not a check in the client,
so it holds when two admins enrol the same student at once. `cancelled` is left
out because it is not an enrolment — it is a join request that was refused, and
a refused request must not stop the student being accepted somewhere.
`pending` counts: a student waiting on one course cannot also be put in
another.

**A second course is always refused; nothing moves a student.** That was the
owner's choice over a "change course" action. Changing course is remove, then
add — two deliberate steps — because the student's invoices move with them and
a move nobody meant would re-file real money. So:

- the student page offers **Add course** only when the student has none;
- bulk enrol sorts addresses already in another course into their own bucket
  and does not send them (the database would refuse the whole batch);
- `join_academy` raises "You are already enrolled in a course at this academy"
  before it writes anything, so a refused request leaves no record behind;
- anything else gets the index's unique violation, which `useEnrollStudent`
  turns into a sentence.

### An invoice belongs to its student's course

`invoices.course_id` used to be chosen when the invoice was raised, and it
drifted from where the student actually was — twice in one day the owner found
an invoice in one course and its student in another, and 25 live invoices had
no course at all. Now it is a **consequence** of the rule above:

- `app.set_invoice_course` (BEFORE INSERT OR UPDATE on `invoices`) sets it to
  `app.student_course(student_id)` on every write. Whatever a client sends is
  overwritten; no client sends it any more.
- `app.sync_invoice_course` (AFTER INSERT/UPDATE/DELETE on `enrollments`)
  re-files every invoice the student has — paid ones included — when their
  enrolment changes. Remove the course and their invoices have none; enrol
  them elsewhere and the invoices follow.

The column stays rather than becoming a join at read time. Every money function
and the `/payments` course filter read it, and a join would have put a second
RLS-guarded table inside each of them — the shape that timed out before. Kept
as a column the database owns, every existing read is already right and a
mismatch is impossible rather than unlikely. **Never write it.**

A student with no enrolment has invoices under "No course", which is the truth
about them.

### Approving a student raises their invoice

`approve_enrollment` calls `app.ensure_course_invoice` on the transition out of
`pending` — the same condition that claims the acceptance email, so a
double-click raises one invoice. It is the shape staff were making by hand: one
line, "Yuran <course>", at the course's `price_sen`, no tax, no due date,
instalment terms left NULL to follow the academy's setting.

It does nothing when the course has no price, or when the student already has
a live invoice: one student, one course, one course invoice, and an invoice an
admin already raised by hand (with a discount, say) must not be duplicated.
SECURITY DEFINER, because the approver may be a trainer and money is admin-only
— the invoice is a consequence of the approval, not something they wrote.

Only **approval** does this. Adding a course on the student page or by bulk
enrol does not raise an invoice; those students show on
`/courses/:id/billing` as never invoiced, as before.

## Not done

- **Rejection is silent, and a rejected student cannot re-apply.**
  `join_academy` inserts `on conflict (course_id, student_id) do nothing`, so
  re-using the public link is a no-op against the surviving `cancelled` row.
  Fixing it means deciding whether a rejected request can be re-opened.
- **Bulk enrol silently consumes pending requests** and sends nothing, so
  "every approved student is told" is false — the true claim is "every student
  approved *through the request list* is told".
- No retry, queue or sweeper for a failed send. `pg_cron`/`pg_net` are now
  installed (for the appointment reminder) but nothing here uses them.
- No waitlist entity. Over-capacity requests stay `pending`.
- No bulk approve.
- Bulk enrol does not create student records. Deliberate — see above.
