# Course billing

`/courses/:id/billing`, admin-only. One course's roster with each student's
standing on it: **never invoiced · nothing paid · part paid · paid**.

## The question no money screen could answer

The section already had three, and each reads `invoices` or `payments`:

| Screen | Question |
| --- | --- |
| `/payments` | What were people **asked** for? |
| `/payments/log` | What **arrived**? |
| `/payments/report` | Where did it come from, and **who still owes**? |

`docs/payment-report.md` explains why the receivables view had to be a second
query rather than a column: *a cash ledger cannot answer "who has not paid",
because a student who owes RM800 has no payment row.* Absence is invisible in a
book of arrivals.

This page is that same argument one level up, and it is the invoice book that
has the hole: **an invoice book cannot answer "who has never been billed".** A
student enrolled on a course with no invoice against them has no row in
`invoices` either. They are not missing from a list — they are absent from the
source the list is drawn from, so no filter, sort or export on any of the three
screens above can surface them.

It is not a corner case here. When this was built:

- **112 of 666** live enrolments had no invoice.
- One whole intake — *DKM Prasekolah Siri 3/2026*, 94 students — had never been
  billed at all, and nothing in the app said so.

`enrollments` is the only table that knows somebody is on a course before any
money is asked for. So `course_billing_summary` and `course_billing_roster`
start from the roster and LEFT JOIN the invoices onto it, which is what turns
"never billed" from a missing row into a row you can read.

## Why it lives under the course

The question is asked *about a course* — "who on Siri 2 still owes me" — so the
page hangs off the course rather than off Payments, and the ⋯ menu on
`/courses/:id` is where it is reached from.

But it is **its own route, not a panel on the course page**. `/courses/:id` is
where a trainer builds the course, and `docs/money-is-admin-only.md` moved the
`invoices` SELECT policy to `app.is_admin` while leaving `enrollments` and
`students` staff-readable. A trainer reading this join would get the whole
roster with **zero** invoices attached, and every student on the course reported
as never invoiced. That is not an empty answer, it is a **false** one — worse
than the empty ledger `AdminRoute` was invented for.

So the guard is in three places, and each does something the others cannot:

- `app.is_admin(_academy)` inside both functions, as a WHERE predicate. Zero
  rows rather than a lie, for anyone calling the RPC directly.
- `AdminRoute` on `/courses/:id/billing`, because the sidebar not linking to a
  page has never stopped anyone typing its URL.
- The ⋯ menu item, hidden for a trainer — linking a page they would be bounced
  out of is worse than not linking it.

## The invoice ↔ course link is `(student_id, course_id)`

`invoices.enrollment_id` exists and is **NULL on every row** in this database.
Invoices are raised per student and stamped with a course; nothing has ever
written the enrolment. Joining on `enrollment_id` would report every student as
unbilled — the exact failure this page exists to fix, dressed as a feature.

## No date window

Every other report function takes `_from`/`_to`. These deliberately do not.

The students being looked for are the ones with **no invoice**, and an absence
has no date. Any window would filter out precisely the answer. "Not yet billed"
is a state, not a period.

## Which enrolments count

`active` and `completed`.

- `pending` is a request staff have not accepted yet, and prompting an admin to
  bill somebody they have not admitted would be wrong.
- `dropped` / `cancelled` are off the course. Anything they still owe stays
  visible on `/payments/report`'s receivables view, which reads invoices and so
  does not depend on this roster at all.
- **Archived students are not excluded.** A debt does not stop existing when a
  record is filed away, and a debt report that hides debtors is worse than no
  report.

## Rows are a page, totals are an aggregate

The same split the rest of the section makes. `course_billing_roster` returns 50
rows and the *filtered* count for the pager; `course_billing_summary` returns
the course's four counts and three money figures, **unfiltered**.

That matters for more than tidiness. "9 students have never been invoiced" is a
fact about the course, not about the 50 rows in front of you — and it is what
the **Invoice 9 students** button acts on. Deriving it from the page would mean
the button silently billed the first page of a 94-student intake.

## The four tiles are the filter

Same bargain the `/payments` stat tiles make: a tile is a count over a set of
students, so pressing it shows that set. "Never invoiced" leads, because it is
the one that exists on no other screen. Pressing the pressed tile clears, so the
tiles are also the way back out.

## Invoicing the unbilled

**Invoice N students** opens the existing `InvoiceFormDialog` with every
unbilled student preselected and the course already chosen. It fetches the whole
set through `fetchCourseRosterAll` — not the rows on screen, and not whatever
filter is currently applied — because a report that identifies 94 students and
then bills them a page at a time has named the work without removing any of it.

Two new props carry that: `initialStudentIds` (the dialog already created one
invoice per selected student) and `initialCourseId`. The second is the same
control as the dialog's student-list filter, and deliberately so — `courseFilter`
is what stamps `course_id` on the invoices, so seeding it both narrows the list
and files the bills under the course the admin came from.

`invalidateMoney` gained both of this page's query keys. Raising an invoice is
exactly what moves a student out of the "never invoiced" bucket, so a money write
has to reach this roster like every other list in the section.

## Files

- `supabase/migrations/20260907120000_course_billing.sql`
- `apps/web/src/features/payments/courseBilling.ts`
- `apps/web/src/pages/CourseBillingPage.tsx`
- `apps/web/src/features/payments/InvoiceFormDialog.tsx` — the two seed props
- `apps/web/src/features/payments/api.ts` — `invalidateMoney`
