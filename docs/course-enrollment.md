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

It is cleared on a successful join and on sign-out, with the other tenant keys.

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

## Not done

- No email when a request is approved. The student sees it on `/learn`. A
  `send-*` function in the shape of `send-invitation` is the addition once
  transactional email is configured.
- No waitlist entity. Over-capacity requests stay `pending`.
- No bulk approve.
- Bulk enrol does not create student records. Deliberate — see above.
