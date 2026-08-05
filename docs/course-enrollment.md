# Course enrollment — applications, approval, bulk enrol

Two ways onto a course, for the two kinds of people there are.

- **The academy already has a record for you** → staff enrol you. One at a time
  from `/students/:id` (unchanged), or a list of email addresses at once from
  the course page (below).
- **The academy has never heard of you** → you apply from a public link, and
  staff approve. Approval is what mints the student record.

## Why an application is its own table

`enrollments.student_id` is `NOT NULL`. A person with no student record cannot
hold a pending enrollment — and not having one is the whole point. The other
obvious shortcut, letting the public write `students` directly, turns the roster
into a spam target.

So `enrollment_applications` is the third thing, and **approval is a conversion**:
one application becomes a `students` row, an `academy_members` row and an
`enrollments` row, in that order.

`enrollments.status` still has a `pending` value. It is still dead. Leave it
that way — a pending *enrollment* would need the student_id we do not have.

## Why approval at all

This is not an online course. A seat is subject to availability, so somebody
decides. That is also why **capacity does not close the form**: `app.enrollment_open`
deliberately ignores `capacity`, and a full intake keeps accepting applications.
A queue of people who want the next seat is the feature, not a bug. Approving
past capacity needs `_force`, which the review dialog passes after showing the
reviewer how full it is.

## Why an account is required

Viewing a course page needs nothing. Applying needs an account.

`?next=` already carries a person through sign-up *and* email confirmation for
the invite flow ([SignUp.tsx](../apps/web/src/pages/SignUp.tsx),
`ProtectedRoute`), so the plumbing existed. What the account buys:

- one identity per applicant, so a second application is a duplicate rather than
  a second stranger;
- somewhere to *show* the decision. **No email is sent when an application is
  reviewed** — transactional email is still not configured — so the applicant
  learns the answer by coming back to `/enroll/…`, `/onboarding` or `/profile`.
  Take the account away and there is nowhere to tell them.

A signed-out visitor still gets the whole form. Their answers are stashed in
`localStorage` before the `/signup` hop and rehydrated on the way back
([lib/enrollDraft.ts](../apps/web/src/lib/enrollDraft.ts)) — a form filled in and
then emptied by an authentication redirect is the single most likely place to
lose someone. The read is deliberately non-destructive; it is cleared only once
the application is actually sent.

## Per-course link, plus an academy index

`/enroll/:slug/:courseId` is the shareable artifact — the thing that goes on a
poster or into a WhatsApp group. `/enroll/:slug` lists whatever is open.

Per-course is not a preference, it follows from the model already here: *the
intake lives in the title*, and `duplicate_course` mints a new course per intake
(see [course-duplication.md](course-duplication.md)). Open/closed, capacity and a
closing date are therefore per-course by construction; an academy-wide form would
need a "which intake?" selector to say the same thing. The directory is a read
over the same settings — one page, no second entity.

`is_listed = false` keeps a private intake out of the directory while its link
keeps working.

## Schema

`course_enrollment_settings` — 1:1 with a course, shaped like
`academy_payment_settings`. **An absent row means the course has no enrollment
page at all**; that is what the public functions test.

| column | note |
|---|---|
| `is_open` | master switch, default **false** — publishing a course must not quietly open a public form on it |
| `is_listed` | appears in the academy directory |
| `capacity` | null = unlimited; does not close the form |
| `closes_at` | null = open until switched off. The dialog stores the **end** of the chosen day, so "closes on the 14th" includes the 14th |
| `intro` | free text above the form |
| `required_fields` | `students` column names. Decides what the form **asks for**, not merely what is starred — see below |

A separate table rather than columns on `courses` for one concrete reason:
`duplicate_course` lists its columns explicitly, so a new column there is either
silently copied or silently dropped, and both are wrong. It copies the settings
row with `is_open = false` and `closes_at = null`, for the same reason it already
resets the schedule dates.

`enrollment_applications` — the submitted detail mirrors `students` 1:1, so
approval is a copy and not a mapping table. `unique (course_id, user_id) where
status = 'pending'`: one live application each, but a rejected applicant may
apply again next intake.

### required_fields decides what is asked

Full name and email are always on the form. Everything ticked is shown **and**
mandatory. A form that renders eight fields so two of them can be optional is
the version people abandon; an academy that wants an IC number ticks IC number.
The DB check constraint pins `full_name` into the array and rejects any name that
is not a real `students` column.

## Security

- **No client DML on `enrollment_applications`.** SELECT only —
  `app.can_grade_course(course_id) OR user_id = auth.uid()`. Every write is a
  SECURITY DEFINER RPC. This is the `academy_invitations` lesson
  ([account-claiming.md](account-claiming.md)) applied to a table whose writer is
  a **non-member**, the widest audience anything in this schema has. Verified:
  an admin's direct `UPDATE … SET status='approved'` changes 0 rows.
- **Two functions reach `anon`** — `get_enrollment_page` and
  `list_enrollment_openings` — and both project an explicit column list.
  `courses` and `academies` are not readable by a non-member and must stay that
  way. A closed intake still resolves and reports `is_open: false`, because
  "this intake is closed" beats "not found" for a poster link, and a published
  title and price is not a secret.
- **Reviewing is `app.can_grade_course`** — admin academy-wide, trainer only
  their assigned courses. Same scope as the grading queue, so `/enrollments` can
  be academy-wide with no client-side narrowing.
- **`app.is_staff` of the academy cannot apply.** A trainer applying to their own
  course is a mistake, not a use case.
- The applicant's contact email is theirs to type, but it can never be blank —
  it falls back to the account's own address.

### Duplicate detection, and the one rule that matters

`application_match_candidates` returns existing unlinked student records that
look like the applicant, each with a `linkable` flag.

`linkable` is true **only** when the record's email equals the applicant's
*confirmed* auth email — the same standard `my_pending_invitations` holds,
because without a token a verified email is the entire proof of identity. A match
on the IC number, or on the address they typed into the form, is shown to the
reviewer as a warning and cannot be selected: `review_enrollment_application`
re-checks `linkable` server-side and refuses anything else. Approve as a new
record and merge by hand.

When an existing record is reused, only its **NULL** columns are filled from the
application. Self-reported detail never overwrites what staff have curated.

Linking and the membership upsert are `app.link_claimed_record`, reused rather
than reimplemented: it already holds the archived/already-linked guards, the
monotonic role ladder (admin > trainer > student, never demoted) and
suspended-stays-suspended. It takes the caller explicitly, so passing the
*applicant's* id rather than `auth.uid()` is supported by design.

## No invoice

Approval creates the student and the enrollment. Nothing else. Billing stays a
deliberate act on `/payments`, whenever the academy is ready. The data model
supports adding it later (`invoices.enrollment_id` and `invoices.course_id` both
exist) without changing anything here.

## Bulk enrol by email

The course page's **Enroll students** dialog takes a pasted list of addresses or
a CSV (`email` / `e-mel` / `emel` header recognised; otherwise every cell is an
address). Parsing reuses [lib/csv.ts](../apps/web/src/lib/csv.ts); duplicates are
removed before anything is matched.

Addresses are matched against **`students` in this academy and nothing else**.
Enrolling is adding a *record* to a course, and there is no record to add for an
address the academy has never seen. Five buckets, all shown before a single row
is written:

| bucket | meaning |
|---|---|
| to enroll | exactly one non-archived record, not already active on the course |
| already enrolled | matched a record already active here |
| no student record | nothing matches — add them on `/students`, or send the enrollment link |
| more than one match | two records share the address (a guardian's inbox — a documented reality). Enrol from the student's own page so the right record is picked |
| not an email | failed the format check |

Matching is done in the browser against the loaded roster, because stored
addresses keep whatever case they were typed in and Postgres `in` is
case-sensitive — only a client-side compare makes `Aina@` find `aina@`.

Writes are `upsert(onConflict: 'course_id,student_id')` chunked 100 at a time, so
a student previously *dropped* from the course is reactivated rather than
colliding with the unique index, and a partial failure reports how many landed.

## Surfaces

| where | what |
|---|---|
| `/enroll/:slug` | academy directory of open, listed intakes (public) |
| `/enroll/:slug/:courseId` | course + apply form + your own application status (public) |
| `/enrollments` | the review queue, under Courses in the sidebar. `?course=` deep-link |
| `/courses/:id` | the **Enrollment** card: the switch, the link, capacity/deadline summary, bulk enrol |
| `/onboarding` | `MyApplicationList` beside `PendingInviteList`. An applicant has no membership either, and "create your academy" is not what they came for — the same trap invitations were rescued from |
| `/profile`, `/learn/profile` | the same list, for someone who already belongs somewhere |

Copy lives in the `enrollment` namespace (`locales/{en,ms}/enrollment.ts`).
Server error sentences are still English, as everywhere else.

## Not done

- No email on a decision. A `send-application-decision` function in the shape of
  `send-invitation` is the addition once transactional email is configured.
- No custom per-course questions. `required_fields` toggles the fixed
  student-detail set; a question builder is a separate feature.
- No waitlist entity. Over-capacity applications stay `pending` and are flagged.
- No bulk approve.
- Bulk enrol does not create student records. That is deliberate — see above.
