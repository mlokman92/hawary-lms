# Money is admin-only

**Status:** implemented (migration `20260829120000_money_admin_only`, `send-pay-link`
v5, web `AdminRoute` + `TrainerDashboard`).

A trainer is staff so they can **teach**: build a course, mark work, take a
session. None of that needs to know what a student was charged. Until now every
money table's SELECT policy was keyed on `app.is_staff`, which put both roles on
the same side of the line.

## What was actually wrong

Not the cards. The **policies**. A trainer holding nothing but their own JWT and
the publishable key could `GET /rest/v1/invoices` and read the academy's entire
book — 572 invoices, 1,985 payments, every `pay_token` — with the web app out of
the picture entirely. Hiding the UI would have changed none of it, which is why
the migration is the fix and everything else is consequence.

The **write** side was already right (`invoices: admin insert` and its siblings
are all `app.is_admin`), so this is a read-side change only. One live
side effect of that asymmetry got fixed on the way past: `StudentDetailPage`
offered a trainer a **New invoice** button whose submit the database had always
rejected with a raw `42501`.

## The five policies

Each table had exactly **one** SELECT policy and RLS enabled, so `drop` +
`create` genuinely closes the read — there is no second permissive policy to
fall through.

| table | policy now | reads |
| --- | --- | --- |
| `invoices` | `invoices: admin view all, student view own` | `app.is_admin(academy_id) or app.owns_student(student_id)` |
| `invoice_items` | `invoice_items: admin all, student own-invoice` | admin, or an `exists` on the parent invoice's student |
| `payments` | `payments: admin view all, student view own` | `app.is_admin(academy_id) or app.owns_student(student_id)` |
| `payment_intents` | `payment_intents: admin read` | `app.is_admin(academy_id)` |
| `academy_payment_settings` | `payment_settings: admin read` | `app.is_admin(academy_id)` |

Policies were **renamed**, not `ALTER`ed: one still called "staff view all" that
admits only admins is a trap for the next reader.

Every `app.owns_student` arm is preserved verbatim. That arm is the whole of
`/learn/billing` and the learner's own invoice + receipt PDFs, and it is the one
thing a more aggressive version of this migration would have broken.
`payment_intents` gets **no** student arm: an intent is the gateway's working
state, not a document addressed to anybody.

`academy_payment_settings` had to be `drop`-then-`create` **in one migration**:
its other three policies are per-command, so a bare drop would have left no
SELECT policy at all and blinded the admins who own `/settings`.

### What was deliberately not done

- **`app.is_staff` was not narrowed.** Dozens of policies rest on it and nearly
  all of them are the teaching grants a trainer must keep. The change is per
  table, per policy, for exactly that reason.
- **The three money RPCs were left alone.** `invoice_totals`, `payment_log_page`
  and `payment_log_totals` are SECURITY **INVOKER**, so they inherited the new
  policies for free — verified returning `0` for a trainer. Revoking EXECUTE
  would have broken `/payments` for admins, who are also `authenticated`.
- **`courses.price_sen` is still trainer-readable.** `get_academy_enrollment` is
  SECURITY DEFINER granted to `anon` and returns the price to the signed-out
  `/enroll/:slug` page. Hiding from a trainer a number a stranger can read is
  theatre. A trainer can also still *write* it (`courses: staff can update`
  covers the whole row); closing that needs a column-level trigger, not a policy
  swap, and is a product decision that has not been taken.

## Client closure

RLS denial is **silent** — a denied SELECT returns zero rows, not an error — so
the migration alone would have left a trainer staring at RM 0.00 tiles and an
empty ledger, which reads as data loss rather than a closed door. The client
changes ship with it.

- **Nav** — the Payments item (and its `/payments/log` child) moved from `nav()`
  to `adminNav()` in `AppSidebar`.
- **Routes** — `components/AdminRoute.tsx`, the app's first role gate that lives
  on the route instead of inside a page, now wraps `/payments`, `/payments/log`,
  `/payments/:id`, `/incentives` and `/incentives/:id`. It **redirects** rather
  than explaining, because those pages would otherwise render an empty ledger
  with a live Export button. `/settings`, `/appointments/settings` and `/members`
  keep their in-place "admins only" panels: those are pages somebody might
  legitimately land on, and they show nothing confidential when they do.
  It waits on `loading` and then demands `admin`, which avoids both of the
  neighbouring bugs — `active && active.role !== 'admin'` renders the page when
  `active` is null, and `loading || !active` spins forever in that same state.
- **Student record** — the Billing card on `/students/:id` is `isAdmin`-gated as
  a **whole**, not just its three totals: every row beneath them carries an
  invoice number, a total and an amount paid. `useStudentInvoices` is passed
  `null` for a non-admin, which disables the query outright, so the Network tab
  agrees with the hidden card.
- **`send-pay-link`** now checks `role = 'admin'` explicitly on top of RLS. RLS
  alone would do it today, but this function **mails a customer**, and "whoever
  can read the row may bill the student" is too implicit a rule to leave to a
  policy a later migration might widen. Same shape as `toyyibpay-connect`.

## Promotion and demotion

`app.is_admin` re-evaluates per statement, so promoting a trainer on `/members`
restores the whole money surface with no migration; the client needs a reload
(or an academy switch) for `useAcademy`'s cached `active.role`. An admin who is
**also** a linked instructor keeps everything — `app.is_admin` reads
`academy_members` and is orthogonal to the `instructors` record. A **suspended**
admin loses money access, because `app.is_admin` requires `status = 'active'`.

## The trainer's dashboard

`/` forks on role in `pages/DashboardRoute.tsx`. `Dashboard.tsx` is untouched and
still serves admins.

The fork is a **component boundary, not an `isAdmin &&`**, because hooks cannot
be skipped conditionally: branching inside the 1027-line file would still have
*fired* `useInvoices` and `usePaymentActivity` for a trainer, however many cards
were hidden. It also means the admin's page cannot regress as a side effect of
building the trainer's.

`pages/TrainerDashboard.tsx` must import nothing from `@/features/payments`,
`@/features/settings/api` or `@/features/dashboard/api`, and must never import
`formatMYR`. That grep is the regression test.

Its question is not "how is the academy doing" but **what is in front of me**.
Three lists, no stat-tile row and no chart — a tile whose value is the length of
the list directly beneath it is decoration:

1. **Needs closing** — sessions that already happened and are still `booked`.
   Self-hiding, and the dashboard is the only place they *can* surface:
   `/appointments` is a week grid, so an unclosed session drops out of sight the
   moment the week turns over while staying open forever.
   The two session lists split on **`ends_at`, not `starts_at`**, and they are
   exact complements. A lesson is still today's lesson while it is being taught:
   splitting on `starts_at` would drop a 10:00–11:00 session out of the diary at
   10:00:01 and simultaneously file it under "nobody said whether the student
   turned up" — every live appointment is a full hour, so that is an hour of the
   day going missing and an hour of being told to close a lesson in progress.
2. **Your week** — the next seven days of their own sessions, **grouped by day**.
   Bookings cluster onto the two or three days an academy runs, so a flat list
   can be one Tuesday and never reveal that Thursday exists. Rows open the
   existing `AppointmentDialog`; mark-done / no-show / cancel are all writes a
   trainer already holds under `appointments: staff update`.
3. **Assessments to mark** and **Assignments to mark** — two cards, because they
   are two nav destinations and a merged one could only link to one of them.
   Each row shows how long the work has **waited**, not when it arrived: "32
   days" is a deadline, "28 Jul 2026, 17:04" is arithmetic homework.

The header names the next **teaching day** rather than counting today's
sessions — with bookings clustered on two days a week, a today-keyed line reads
"no sessions today" most mornings and stops being read.

Both marking cards distinguish two empty states, and the distinction is
load-bearing — and the claim is only made once `useMyGradableCourses` has
actually answered. "You are not assigned to a course" is a statement about the
person, and that query is three sequential round trips against the queue's one,
so a `?? 0` default would paint the alarming message first and then correct
itself: `course_instructors` is sparsely filled, so most trainers have
nothing to mark because **nobody assigned them a course**, not because the
students are up to date. `useMyGradableCourses` returns `linked: true` in that
state, so the existing "no instructor record" message does not fire.

No course filter is applied to the marking queues. `attempts: graders all,
student own` is `app.can_grade_assessment` → `app.can_grade_course`, so RLS
already returns exactly this trainer's courses; a client-side filter would be a
second, weaker copy of the rule. Conversely `.eq('instructor_id', …)` on the two
session queries is a **display** narrowing, not an authorisation boundary — a
trainer may legitimately read the whole academy diary, and `/appointments`
already shows it to them.

## Known, deliberately left

- The sidebar's `useUpcomingAppointmentCount` badge counts the **whole academy's**
  booked sessions, so it can disagree with a trainer's own dashboard. Not
  financial; worth deciding on its own terms rather than as a side effect.
- `invoices.pay_token` — the bearer credential for the login-less `/pay/:token`
  page — still ships to anyone who can read the row, because `useInvoices` and
  `DETAIL_SELECT` both `select('*')`. That is admins only now, which is
  acceptable; narrowing those two selects so a token is fetched only by
  `PayLinkCard` is a worthwhile follow-up.
- `academies.sst_number` stays readable by every member: `features/payments/pdf.ts`
  draws it onto the invoice the learner downloads.
- **Prerequisite, data not code:** the active trainers have zero rows in
  `course_instructors`. Until they are assigned to their courses on
  `/instructors`, both marking cards are correctly empty and only
  `dash.trainer.no_courses` explains why.
