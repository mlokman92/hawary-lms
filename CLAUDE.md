# CLAUDE.md

Guidance for Claude Code in this repo.

## Project

**Hawary LMS** — Malaysian multi-tenant SaaS LMS. Each **academy** is an isolated
tenant (trainers/students/data never cross academies). Roles: **admin** & **trainer**
(web back-office), **student** (mobile, later). Features: courses, students/enrollment,
notes, assessments, assignments, payments. Malaysian: MYR (store as **sen**),
SST-aware invoices, **bilingual EN/BM** (web); payment gateways are future work.

## Tech stack

Monorepo: **pnpm workspaces + Turborepo**.

- `apps/web` — Vite + React + TS. Admin/trainer surface. **Built.**
- `apps/mobile` — Expo (React Native) + TS. Student surface. **Scaffolded, not wired.**
- `packages/shared` — TS types, **generated** DB types, Supabase client, domain logic.
- Backend — **Supabase** (Postgres + RLS, Auth, Storage). Project ref
  `vpklztxqkvqmmzsxfqgp`; use the Supabase MCP tools. Migrations in `supabase/migrations/`.
- **Web UI** — shadcn/ui (Radix + **Tailwind v4**), neutral theme in
  `apps/web/src/index.css`, `@` alias, `apps/web/src/components/ui` (add via
  `pnpm dlx shadcn@latest add <name>`). Data layer: **TanStack Query**; feature code in
  `apps/web/src/features/*`.
- **Mobile UI** — React Native Reusables + NativeWind (pending).

## Status — what's built (web)

- **Auth + onboarding**: email/password sign in/up, forgot → `/reset-password`
  (the recovery link's own landing page; `lib/recoveryLink.ts` snapshots the URL
  params before the Supabase client consumes them), self-serve academy creation
  (creator becomes admin), academy switcher, light/dark theme.
- **Sections** (each: list + add/edit, staff-gated, academy-scoped by RLS):
  Courses · Students · Instructors · Payments · Appointments. Nav is these five + Dashboard;
  admins also get Incentive + Members + Settings. The **header search** (`HeaderSearch` +
  `features/search`) finds students and instructors across the active academy by
  name, email, phone, IC or record number and jumps straight to the record.
- **Course → module → content**: a course is a card grid (`/courses`) showing per-course
  counts; opening one (`/courses/:id`) lists its **modules as an accordion**
  (`type="multiple"`, open set kept per course in `sessionStorage`, first module
  open by default), each holding notes, **materials**, assessments and
  assignments. `course_modules` is the only hierarchy — `module_id` is **NOT
  NULL** on all four content tables, so there is no course-level loose content
  and notes are a flat list per module (the old note folder tree is gone).
  Editors stay routable at `/notes/:id`, `/assessments/:id`,
  `/assignments/:id`. Reorder/move via `reorder_course_modules` +
  `reorder_module_items(module, kind, ordered_ids)`. Items are **drag-sortable**
  (`features/courses/ModuleItemList.tsx`, dnd-kit): by handle, not whole-row —
  the row also holds a link, a switch and a menu — and within one
  (module, kind) section only, since that is what the RPC takes and a note
  cannot be dropped into "Assessments". Crossing modules stays on the ⋯ menu,
  which still works when the target module is collapsed. `useReorderModuleItems`
  is optimistic or the row springs back mid-drag. Publishing is an inline
  `PublishSwitch` on the row (also optimistic); one `useTogglePublished` covers
  all four kinds.
- **Sub-nav under Courses** (`NavItem.children` → `SidebarMenuSub`, always
  open), and the two shells mean different things by it:
  - **staff** `/assessments` · `/assignments` are the **grading queues** —
    `GradingQueuePage` over `useAcademyQueue`, academy-wide because RLS
    (`app.can_grade_*`) already narrows a trainer to their assigned courses.
    `/enrollments` is the third child — the whole enrollment surface, not a
    queue: the public link, which courses accept requests, who is waiting, and
    bulk enrol.
    Awaiting/Marked/All tiles, search, and a `?course=` filter. `/courses/:id`
    carries **no Grading button** and no enrollment controls — it is for
    building the course, so *New module* is the only button and Edit/Duplicate
    sit in a `⋯` menu. `/courses/:id/grading` (`CourseGradingPage`) still
    resolves for older links. Authoring stays inside a course — there is no
    academy-wide content inventory, and `LibraryPage`/`features/library` were
    removed when this replaced them.
  - **learner** `/learn/assessments` · `/learn/assignments` are their own lists
    of work (`LearnTaskListPage`, off the existing dashboard query).

  Notes and materials stay module-only on both sides.
- **Question types** (`docs/question-types.md`): six — `essay` · `short_text`
  (marked by a person) and `true_false` · `single_choice` · `multiple_choice` ·
  `matching` (marked by Postgres). `options` is public, `correct_answer` never
  leaves the server, and **a student's answer is encoded exactly like
  `correct_answer`** (string / boolean / array of ids / `{leftId: rightId}`), so
  scoring is a comparison and the v1 string answers still work untouched.
  Matching's right column is shuffled by `app.shuffled_matching_options` —
  authoring order is itself the answer key. `submit_attempt` auto-scores via
  `app.question_fraction` (partial credit for matching) and reaches `graded` only
  when no question needs a human; otherwise it banks the objective marks and
  leaves the rest to the grader. `assessments.total_points` is now
  trigger-maintained — clients must not write it. Model + client mirror:
  `apps/web/src/lib/questions.ts`.
- **Materials** (`docs/course-materials.md`): `course_materials` is shaped like
  `notes` (same FKs, same four policies) but its file lives in the **private**
  `course-materials` bucket — this is the product, and in a public bucket the URL
  *is* the product. Upload extends `upload-media` (50 MB, document MIME list, key
  `<academy_id>/<course_id>/<uuid>.<ext>`); reads go through the new
  **`material-url`** function, which asks `public.material_download` — under the
  caller's own JWT — whether they may have it, then signs for 60s with the
  service role. The request carries an **id, never a path**. Deleting a material
  deletes the row, **not** the object: `duplicate_course` points copies at the
  same file.
- **Course duplication** (`docs/course-duplication.md`): `duplicate_course(id,
  title, code)` deep-copies modules · notes · materials · assessments +
  questions + answer keys · assignments · instructor assignments. Not enrolments,
  attempts, submissions or invoices. The intake lives in the **title** — there is
  no cohort entity and none should be invented. `code` is asked for, not copied
  (uniquely indexed per academy); status resets to `draft` and all schedule dates
  to NULL, so a new intake never opens already closed. Gated by
  `app.can_grade_course`, stricter than course creation because it carries a
  question bank.
- **Enrollment** (`docs/course-enrollment.md`): **enrolling is joining.**
  *Anyone can enter an academy; course access is what staff grant.* The academy
  publishes **one** public link, `/enroll/:slug` (`academy_enrollment_settings`,
  admin-only, off by default). A visitor signs up or signs in, **picks a
  course**, and `join_academy(slug, course)` creates the student record, links it
  and upserts the `student` membership via `app.link_claimed_record` — then files
  the course as `enrollments.status = 'pending'`. They land on `/learn` a member,
  with nothing open. Picking a course is what gates joining, so nobody lands in
  an academy without asking for something.
  There is **no application table**: the student record exists by the time
  anything is requested, `app.is_enrolled` already demands `'active'`, and the
  long-standing `enrollments: staff update` policy already lets staff move it.
  Approving *was* a plain UPDATE for exactly that reason; it is now
  **`approve_enrollment(uuid)`**, because approving acquired an irreversible
  side effect (the access email) and the transition must be the same statement
  as the decision to send — two staff clicking Approve at once is the normal
  case. **Rejecting is still a plain UPDATE**: it has no side effect to guard.
  See `docs/course-enrollment.md` → "Approval email", and note that a trigger
  cannot serve here — bulk enrol's upsert produces a byte-identical
  `pending → active` tuple pair. The email's **copy is per course**
  (`course_enrollment_settings.access_email_body`, written on `/enrollments`
  beside `is_open`/`capacity`/`closes_at`): **blank means that course sends
  nothing**, which is the default, and the RPC tests for it before it claims so
  a silent course never stamps `access_email_at`. An unlinked record carrying the
  caller's **confirmed** email is adopted rather than duplicated (the
  `my_pending_invitations` standard), which is what stops a CSV-imported student
  becoming a second row. `course_enrollment_settings` now holds only `is_open` ·
  `capacity` · `closes_at`; capacity never closes a course (a queue is the
  point). Staff also **bulk-enrol** existing records by pasted/CSV email,
  matched against `students` in this academy only and bucketed (to enroll ·
  already · no record · ambiguous · invalid) *before* any write.
  **Everything staff-side lives on `/enrollments`** — the link, which courses
  accept requests, the request list, bulk enrol. The course page is for building
  the course. **No invoice** is created; billing stays a deliberate act on
  `/payments`.
  The **intent survives the auth hop** in `localStorage` (`lib/enrollIntent.ts`),
  because GoTrue drops `emailRedirectTo` whenever the redirect allow list misses
  the URL and the confirmation link then lands on `/onboarding` — "create your
  academy" being the exact opposite of what the person came to do.
  `useLandingTarget`, both shells and `PendingInviteRedirect` all consult it,
  the same way they consult a stashed invite token.
- **Appointments** (`docs/appointments.md`): one-to-one sessions. **Slots are
  not rows** — `app.booking_slots(academy, from, to)` derives them from
  `booking_hours` (recurring weekly windows, academy-wide, in
  `academies.timezone`), `instructors.is_bookable` and what is already taken or
  closed (`booking_time_off`, whose null `instructor_id` closes the whole
  academy). Changing 10:00–18:00 to 09:00–17:00 is one UPDATE, not a
  regeneration. That one generator feeds the learner page, the staff booking
  dialog **and** `book_appointment`'s own check, the same reason
  `app.enrollment_open` exists. Double-booking is an **EXCLUDE constraint** on
  `(instructor_id, tstzrange)` — and a second on `student_id` — not a
  check-then-insert, because two students taking the last 15:00 slot at once is
  the normal case; the predicate skips `cancelled`/`no_show`, so cancelling
  frees the slot with no second write. `assignment_mode` is `round_robin`
  (candidates ordered fewest-sessions → longest-since-assigned → id, then walked
  until one inserts) or `student_choice`; under round robin the RPC **omits the
  instructor list entirely**, since `instructors` is staff-readable and naming
  the free teachers would defeat the mode. Naming an instructor is gated on *who
  is asking*, not the mode: staff may always name one or leave it to the rota, a
  student under round robin is ignored rather than refused. Students have **no
  DML policy at all** on `appointments` — `book_appointment` /
  `cancel_appointment` are the only doors — but marking done/no-show is a plain
  staff UPDATE. `app.bookable_student` mirrors `app.is_enrolled`'s membership
  test, not `app.my_student_id`, so suspending a member revokes booking at once.
  Staff-side `/appointments` is the week grid alone; the policy, hours
  and pool moved to **`/appointments/settings`** (admin-only, reached by the gear
  beside *Book a session*) — setup is visited once and does not belong under the
  screen staff open daily. Learner-side `/learn/appointments` is pick a
  day → pick a time → book. Day maths is `YYYY-MM-DD` strings in the academy's
  zone (`features/appointments/calendar.ts`), never the browser's. Two
  independent caps on a student: `max_open_per_student` bounds the **queue**
  (how much future they may hold), `max_per_week_per_student` the **rate** (how
  often they may come, counted over a **Monday-start week in the academy's
  timezone**, `booked` + `completed`, so cancelling frees the week). Both NULL =
  no limit, both students-only; `get_booking_options` withholds slots in a
  filled week rather than failing the booking, and `book_appointment` checks
  anyway. `location` is **gone** from both the policy and `appointments` —
  nobody ever set it, and where a session happens is a per-session fact, not an
  academy default. **No
  invoice**, no approval step, not tied to a course.
- **Notifications** (`docs/notifications.md`): the header bell, in **both**
  shells (mounted in `shell/SidebarShell`, not per layout). A row is an
  **event, not a sentence** — `kind` + `data`, with the words assembled client
  side, so the same row reads Malay for a Malay reader; `data` is a snapshot
  (the other party's name, the time, the academy's `tz`) so the list needs no
  joins and a rename does not rewrite history. The recipient is an **account**,
  not a record: `app.notify` no-ops on a null `user_id`, because an unclaimed
  record is the ordinary case. Clients have **no DML** — SELECT is
  `user_id = auth.uid()` and read state moves through
  `mark_notifications_read` / `mark_all_notifications_read`, since an UPDATE
  policy would also let a person rewrite their own row's `kind`. The badge
  polls (a `head: true` count, 60s); the twenty rows load only when the panel
  opens. First and so far only kind: `appointment_booked`, written by
  `book_appointment` **in the same transaction as the insert** — which is what
  makes it more reliable than the email. **The actor is not notified** (a
  message telling you what you just clicked is not news), and neither is staff
  at large (they have the diary). A new kind costs three cases in
  `NotificationBell.tsx`, one enum value and two dictionary lines.
- **Appointment confirmation email** (`send-appointment-notice`,
  `docs/appointments.md` → "Confirmation email"): every confirmed booking
  emails **both** parties. It is a second call after `book_appointment`, soft
  failure only — the session is booked either way. Unlike the other mail
  functions it uses the **service role**: it emails two people and a student
  cannot read `instructors` at all, so it authorises under the caller's JWT
  (RLS on `appointments`) and only then reads and sends. Addresses come from
  the record, falling back to the linked account's auth email. Two receipts
  (`student_notice_id` / `instructor_notice_id`) because the recipients fail
  independently; a re-invoke fills only the gap.
- **Data model**: identity is global (`profiles`, one per email); roles/records are
  per-academy. A **student is an academy record** (`students`, not necessarily an auth
  user); enrollment/invoices/payments reference `students`. An **instructor is the same
  shape** (`instructors`, CRM-style record); `course_instructors` assigns them to
  courses. Money in integer **sen**.
- **Account linking** (`docs/account-claiming.md`): two routes, one shared body
  (`app.link_claimed_record` — archived/already-linked guards, monotonic role
  upsert, suspended stays suspended). **The record is the invitation**: a
  student/instructor row whose email matches the caller's *confirmed* auth email
  and has no `user_id` is claimable via `my_pending_invitations()` +
  `accept_pending_invitation(kind, record_id)` — derived from the records, not
  from `academy_invitations`, because a CSV import mints no tokens. Role comes
  from the record kind, never from client input. The **token flow**
  (`create_invitation` / `create_instructor_invitation` (admin) /
  `accept_invitation` / `resend` / `revoke` + `/accept-invite?token=`) survives
  for emailed and shareable links; the token was never the authorisation — the
  email match always was. Accepted risk, decided deliberately: a trainer can
  create an instructor record with an email they control and self-claim it
  (lateral, not escalation); close it by tightening `instructors: staff insert`
  to `is_admin`, not by special-casing the RPC. Invitees see waiting academies on
  `/onboarding` (which no longer traps them in "create your academy") and on
  `/profile` + `/learn/profile` via `features/invitations/PendingInviteList`.
  **`/onboarding` is not a landing page**: an existing member who reaches it is
  returned to `useLandingTarget()`, and only `?new=1` — sent by the switcher's
  "Add academy" — still opens the founder form. Without that guard an accepted
  invitee who pressed Back got "Create your academy", and one student founded a
  second academy named after her own school, which then outranked her student
  membership on every sign-in.
  **Adding somebody invites them**: there is no "Invite to app" button and no
  separate invite dialog — the create branch of the student/instructor form
  calls `features/invitations/autoInvite.ts`, which mints a token and emails it.
  It **never throws**: the record exists and is claimable without a token, so a
  failure is a missed notification, not a missed grant. A **trainer adding an
  instructor sends nothing** (`create_instructor_invitation` is admin-only on
  purpose) and a record with no email sends nothing — both silently, because
  refusing is correct and there is no action to offer. CSV import asks once, a
  checkbox **on by default**, admin-only on instructors, and invites the batch
  sequentially with a 550 ms gap: the provider limits *requests* and each
  invitation costs two, and a 429 comes back as `ok: false` with no backpressure
  signal. The dialog reports the invited count **only when it falls short** of
  the imported count. `PendingInvitations` is now the only place staff resend or
  revoke.
  **Names cross the gap at link time**: `app.fill_record_identity` (a `BEFORE
  INSERT OR UPDATE OF user_id` trigger on both `students` and `instructors`)
  fills a blank `full_name` from the claimer's profile, and
  `app.sync_profile_identity` catches a profile filled in later. On the column,
  not in the RPCs, because `link_student_account` / `link_instructor_account`
  and a plain staff PostgREST update all write `user_id` without going through
  `app.link_claimed_record`. Fills blanks only, matches on `user_id` never on a
  matching email, and **name only** — see `docs/account-claiming.md` for why
  phone is excluded. On screen, `personName(name, email)` in `lib/format.ts`
  prefers an address to the word "Unnamed".
- **Members & roles** (`/members`, admin-only): the staff roster — students are
  excluded (they are an academy record, managed on their own page, where their
  app access can also be suspended). Two independent axes, never merged into one
  ladder: **access** is `academy_members.role` (admin/trainer) and **teaching**
  is a linked `instructors` record, so one account can be an admin *and* an
  instructor. **Director** is the academy creator (`academies.created_by`) — a
  name for the founder, not a fourth role; `Membership.isCreator` carries it to
  the client. Contact details come from the admin-only `list_academy_staff` RPC,
  which joins `auth.users` for the email: `profiles` is readable by every
  co-member, so an email column there would be an address book for students.
  There is **no `/members/:id`** — a row opens the person's own record
  (`memberRecordPath`: instructor, else student). `/members` is where a
  membership is managed (role, suspend/restore, attach/detach the instructor
  record); the instructor page carries only a **"Make admin" checkbox**, the one
  control worth having next to the person.
  `unlink_instructor_account` is the inverse of `link_instructor_account` (which
  preserves an `admin` role on purpose).
- **CSV import** (`features/import`): bulk creation for students and
  instructors, one spec-driven dialog (`ImportSpec` → `ImportDialog`) plus a
  hand-rolled `lib/csv.ts` (BOM, CRLF, quoted commas/newlines, `;`/tab
  delimiters — no dependency). Headers match loosely against per-field aliases
  in EN and BM, so a spreadsheet with `Nama Penuh` / `No. Telefon` lands without
  a mapping step; parsing, validation and duplicate detection (`email`,
  `ic_number`, against the loaded list *and* earlier rows) all happen in the
  browser, and a row with a problem is listed with its line number and excluded
  rather than dropped silently. Inserts are chunked 100 at a time and report how
  many landed if a later chunk fails.
- **Own profile**: `/profile` (staff) and `/learn/profile` (learner) edit the
  same `profiles` row via `features/profile/api.ts`; both are reached by clicking
  your name in the sidebar footer (`UserMenu`'s `profileTo` prop).
- **Block content**: shared editor (`lib/blocks.ts` + `components/BlocksEditor.tsx`) —
  text / image / youtube — used by assessments and assignments (notes use the
  rich-text `content` column).
- **Student visibility** of content is `is_published AND app.module_visible(module_id)`
  — unpublishing a module hides everything under it. `app.is_enrolled` requires an
  **active membership** plus an unarchived `active`/`trial` student record, so
  suspending a member revokes content immediately.
- **Invoice documents** (`docs/invoice-documents.md`): every invoice gets its
  `pay_token` from a BEFORE INSERT trigger, so the pay link exists at creation
  (`ensure_pay_token` remains as the idempotent repair). `/settings` has an
  **Academy details** card (name — the only mandatory field — logo, address,
  phone, SST number) writing the long-existing `academies` columns; learners
  download **invoice / receipt PDFs** from `/learn/billing*`, drawn by
  `features/payments/pdf.ts` with a dynamically imported jsPDF. `pdf.ts` splits
  **build from deliver** — `buildInvoicePdf`/`buildReceiptPdf` return
  `{doc, fileName}` and the `download*` pair are wrappers — so the same drawing
  serves a download and the **Preview invoice** button on the Academy details
  card (`InvoicePreviewDialog`, an `<iframe>` over `doc.output('blob')`). The
  preview reads the form's *current* values, not the saved row, and draws a
  fictional `sampleInvoice()`, so a brand-new academy can check its letterhead
  before saving and a stray print can never pass for a real bill.
- **Payment log** (`/payments/log`): the money-in **ledger**, a sub-nav child of
  Payments. `/payments` is the invoice book — what people were *asked* for;
  this is what *arrived*, when, by what means and against which invoice. Neither
  derives from the other: an invoice carries no paid-on date, a refund never
  decrements `amount_paid_sen`, and one invoice can be settled by several
  payments — which is why `usePaymentLog` reads `payments` directly rather than
  re-deriving from `useInvoices`. Staff-wide, because `payments: staff view all`
  is; no migration was needed. Search + status filter are client-side over one
  unbounded ordered read (`paid_at desc nullsFirst:false`, `created_at` as the
  tie-break — PostgREST sorts nulls first, which would float an unsettled row
  above today's takings). Only `succeeded` rows count towards "received"; a
  status badge is drawn **only** when the row is not succeeded. A manual row
  names **who recorded it** (`created_by` → `profiles`, readable via
  `profiles: self or co-member can view`); a gateway row names the gateway and
  its reference instead, because a callback wrote it and there is nobody to
  name. The recorder is searchable — "everything Aisyah took in cash" is a real
  question to ask a ledger. **Export CSV**
  reuses `lib/csv.ts`'s `downloadCsv` and writes ISO dates + ringgit decimals,
  because the file's job is reconciliation in a spreadsheet.
  This is the **first child nested under its parent's own path**, which exposed a
  bug in `isNavActive` (`components/shell/nav.ts`): `pathname.startsWith` made
  `/payments/log` light up the Payments row *and* the Log row, when the shell's
  rule is that a parent whose child is active gets the brand colour on its icon
  alone. `isNavActive` now yields to a matching child, so only one row ever
  claims "the page you are on". `/courses`' children (`/assessments` etc.) never
  hit this because they do not share its prefix.
  The dashboard's recent-payments card links here as its "View all"; its revenue
  chart is now a **single** `collected` series (the invoiced figure survives as
  a number on the card, not a bar), so `dash.chart.invoiced` is gone.
- **Back-dated payments** (`payment_log_page._sort`): `RecordPaymentDialog` asks
  for the *payment* date and stores it at midday, so staff catching up on
  historical payments enter them back-dated — **737 of 742** rows in this
  database have a `paid_at` on a different day from their `created_at`. Ordering
  the ledger by `paid_at` therefore buries fresh data entry: a payment banked
  today for money that arrived in May sorted to row 338 of 742, page 7. It was
  never missing, but "I just recorded it and cannot see it" is
  indistinguishable from missing, and on a ledger that is the worst ambiguity
  available. So the log takes a `_sort` of **`recorded`** (`created_at`, the
  **default** — what a person doing data entry means by "recent") or `paid`
  (value-date order, for reconciliation), and each row shows the recorded
  timestamp **only when it was back-dated** — when the two days agree the
  payment date already said it. `_sort` is **not** part of `PaymentLogFilters`:
  a sum and a count do not care about ORDER BY, so changing it must not
  re-fetch the totals. The ORDER BY is **dynamic SQL over a two-clause
  whitelist**, not a CASE inside ORDER BY — a CASE is not indexable and would
  force a full sort of the academy's payments on every page turn, defeating
  both `payments_academy_paid_at_idx` and `payments_academy_created_at_idx`.
- **Pagination** (`/payments` + `/payments/log`, 50 rows): both lists are paged
  **server-side**, because both used to fetch every row and one academy is
  already at 543 invoices / 702 payments — PostgREST caps a request at the
  project's "Max rows" (1000 by default) and a *ledger* that silently stops at
  row 1000 is worse than one that is slow.
  The split that makes it work: **rows are a page, totals are an aggregate**. A
  page of 50 cannot answer "how much is outstanding", and deriving the tiles
  from the page would quietly reinterpret the question — so `invoice_totals`
  (four money tiles, optionally narrowed by `_course` / `_no_course`) and
  `payment_log_totals` (count + money received) are their own calls.
  `invoice_totals` mirrors the old client `computeStats` **exactly**, asymmetries
  included — `collected` is the raw sum of `amount_paid_sen`, `outstanding` and
  `overdue` clamp each invoice at zero first — verified equal on live data, so
  the numbers on screen did not move.
  The **log rows need an RPC** (`payment_log_page`) because its search spans five
  tables and PostgREST cannot OR across embedded resources; the **invoice rows
  stay on PostgREST** (`.range()` + `count: 'exact'`) because a course filter is
  one `eq`. All three functions are **SECURITY INVOKER** — RLS already scopes the
  caller, so definer rights would buy nothing but risk.
  Two details that are load-bearing, not polish: every ordering carries **`id` as
  a final tie-break** (OFFSET paging over a non-unique sort repeats one row and
  skips another), and both lists use **`keepPreviousData`** (without it a page
  turn blanks the table through the empty state and back, which reads as an
  error). Search is debounced through the extracted `lib/useDebounced.ts` —
  otherwise a keystroke is two round trips. **CSV export walks the whole filtered
  set** in 200-row chunks via `fetchPaymentLogAll`, never the 50 rows on screen:
  a reconciliation that stops at row 50 is worse than none, and 200 is the
  `_limit` clamp the RPC enforces. `invalidateMoney` is the one place a money
  write invalidates all five cached lists.
  Still unbounded and deliberately left so: the **dashboard**'s `useInvoices`,
  which reads every invoice for its 6-month chart and stat tiles.
- **ToyyibPay charge** (`docs/toyyibpay-payments.md`): the flat RM1 FPX fee can
  be passed to the payer via `billChargeToCustomer='0'`. Academy default
  `academy_payment_settings.toyyibpay_charge_to_payor`, per-invoice override
  `invoices.charge_to_payor` (**NULL = follow the default**); the terms are
  pinned onto `payment_intents.{charge_to_payor,fee_sen}` at bill time.
  `record_gateway_payment` no longer demands an exact amount — it accepts
  `[amount_sen, amount_sen + fee_sen]` and **always credits `amount_sen`**, since
  the surcharge is ToyyibPay's, not the academy's. Off by default.
- **Part payment** (`docs/toyyibpay-payments.md` → "Part payment"): per invoice
  (`invoices.allow_partial_payment` + `min_partial_sen`), **no academy default**.
  The ledger always supported it — `payments` rows sum and
  `record_gateway_payment` recomputes `amount_paid_sen` from them — so only the
  gateway needed opening up. `create-bill` takes `amount_sen` as a **request**
  and re-derives it under the service role; `get_public_invoice` resolves
  `min_pay_sen = least(due_sen, greatest(min_partial_sen ?? 100, 100))`, so the
  last instalment is always payable and the pay page hides the choice when the
  floor has met the balance. Intent reuse is now **amount-scoped** (an
  amount-blind reuse handed a payer the wrong bill); intents at other amounts
  are left live so `verify-payment` still sweeps them. The RM1 charge composes
  unchanged and applies **per transaction** — set at creation
  (`InvoiceFormDialog`) or after issue (`PayLinkCard`, the real case).
- **Billplz incentives** (`docs/billplz-incentives.md`): paying a per-student
  government grant **out** to each student's own bank account — money out, so no
  invoice and no `payments` row; `/payments` stays money in. Billplz **Payment
  Order**: two keys (API Secret = Basic auth, X Signature = an HMAC-SHA512
  `checksum` whose value order differs **per endpoint**), a prefunded Payment
  Order Limit separate from the Credit Balance, `total` in sen, sandbox settles
  only `DUMMYBANKVERIFIED`. **There is no bulk endpoint** — a bulk transfer is a
  loop of `POST /payment_orders`, which is why `billplz-disburse` is chunked (25,
  cap 50), claims rows in **one** `UPDATE … FOR UPDATE SKIP LOCKED` statement
  (`claim_incentive_payouts`, service-role only) and is resumable; insufficient
  funds releases the claim and halts. Settlement is **reconciliation-driven** —
  the callback fires only on `completed`/`refunded` and retries once, so
  `billplz-payout-status` is authoritative and the callback (nonce + constant-time
  checksum) is a fast path. Bank details are a **separate table**
  (`student_bank_accounts`, `app.is_admin OR app.owns_student` — never
  `app.is_staff`) because RLS is row-level and columns on `students` would be
  trainer-readable; a payout **snapshots** them. Clients have **no DML** on
  `incentive_payouts`, and `incentive_batches` UPDATE/DELETE are pinned to
  `status = 'draft'` so a sent batch cannot be reopened and re-sent. Admin-only
  `/incentives`; students see their own on `/learn/billing`.
- **Learner surface** (`/learn/*`, `StudentShell`): enrolled courses → published
  modules → notes / assignments / assessments, plus **Billing** (own invoices,
  read-only) and **My profile** (editable `profiles.full_name`/`phone`). It renders
  the *same* shell as the back-office — `components/shell/{SidebarShell,ShellSidebar}`
  is shared by `AppLayout` and `LearnLayout`, so the learner gets the shadcn sidebar,
  `UserMenu` (identity + theme) and an academy switcher with **no** "Add academy"
  (creating one makes the caller staff, which evicts them from `/learn`). Shared page
  vocabulary lives in `components/patterns/*` (PageHeader, StatTile, StatCard,
  FilterStatCard, EmptyState, QueryState, ListCard, BackLink) + `lib/{tone,format}.ts`.
  Students submit assignments through
  RLS; they take assessments **only** through the SECURITY DEFINER RPCs
  `start_attempt` / `get_attempt` / `save_attempt_answers` / `submit_attempt`, which
  project an explicit column list so `assessment_questions.correct_answer` never
  reaches a client. `assessment_questions` has no student policy at all.
- **Grading** (`/courses/:id/grading`): gated by `app.can_grade_course` =
  `is_admin` OR (`is_staff` AND `teaches_course` via `course_instructors`). Admins
  are academy-wide; trainers see only assigned courses. Never narrow `app.is_staff`
  itself — 58 policies depend on it.
- **Write guards**: `app.guard_attempt_write` / `app.guard_submission_write` run
  `BEFORE INSERT OR UPDATE`, force grading fields null for non-graders, stamp
  `graded_by`/`graded_at` from `auth.uid()`, and derive `started_at`/`submitted_at`
  server-side (so `due_at`, `allow_late`, `available_*` and `duration_minutes` are
  actually enforceable). See `docs/student-instructor-roles.md`.
- **Invitations**: clients have **no** DML on `academy_invitations` (an
  unrestricted staff UPDATE let a trainer set `role='admin'` and accept it). Use
  `create_invitation` / `create_instructor_invitation` (admin-only) /
  `revoke_invitation` / `resend_invitation`, plus admin-only
  `link_student_account` / `link_instructor_account` for linking without email.
- **i18n** (`lib/i18n/`): English (default) + **Bahasa Melayu**, one dictionary
  per feature namespace under `locales/{en,ms}/`. Keys are flat and
  self-prefixed, so `TKey = keyof typeof en` — a bad key **and** a missing Malay
  entry are both compile errors, not runtime fallbacks. `useT()` → `t` / `tn`
  (plurals via `<base>_one`/`_other`); `translate()` is the non-reactive escape
  hatch for plain helpers only. Switcher: a **Language** submenu in `UserMenu`
  (both shells) + standalone `LanguageToggle` on `AuthCard` for signed-out
  pages. Preference in `localStorage['hawary.lang']`, seeded from
  `navigator.languages`; `lib/format.ts` follows it (`en-MY` ⇄ `ms-MY`).
  Enum→label maps (`{students,instructors,learn}/status.ts`) carry
  `labelKey: TKey`, not strings. Server/Edge-Function errors are still English.
  See `docs/i18n.md` — read its house-style list before writing Malay copy.
- **Storage**: public `avatars` + `note-media` buckets, keyed `<academy_id>/<uuid>.<ext>`.
  Uploads go through the **`upload-media` Edge Function** (`lib/storage.ts` →
  `uploadPublicImage`), which verifies the caller's JWT, re-checks staff membership
  for the target academy, and writes with the service role. Direct browser
  `storage.upload()` is not used: the storage RLS policies calling `app.is_staff`
  rejected every upload even for valid staff on a correct path — see
  `supabase/functions/upload-media/README.md`.

- **Production URLs** (`docs/production-urls.md`): the web app is deployed to
  **app.hawary.my** (Netlify). Auth **Site URL + redirect allow list** must list
  it or GoTrue silently drops `emailRedirectTo` and sends confirm/reset links to
  the Site URL instead. `send-invitation` / `send-pay-link` / `create-bill` build
  their links via an identical `resolveBase` — `APP_URL`, with a client `origin`
  honoured only when it matches `ALLOWED_ORIGINS`, never raw client input.

### Deferred / next
- **Transactional email is configured** — Resend, sending from
  `noreply@hawary.my` (domain verified). `RESEND_API_KEY`, `INVITE_FROM_EMAIL`,
  `APP_URL` and `ALLOWED_ORIGINS` are all set and shared by every mail function.
  Supabase Auth sends its own confirm/reset mail through Resend SMTP, which is
  configured in the dashboard, not in this repo. Note the two limits are
  **separate and both real**: Supabase Auth has its own per-hour email rate
  limit (raise it under Authentication → Rate Limits — a signup surge hit it and
  returned `429 over_email_send_rate_limit` on `/signup`, which Resend never
  saw), and Resend's plan carries its own cap. Still deferred: BM for
  transactional email and Edge Function errors, both of which stay English.
- Assignment **attachments** (needs a private `submissions` bucket + a student
  branch in `upload-media`); scheduled expiry sweep for invitations.
- Assessment settings still have **no UI**: `duration_minutes`, `max_attempts`,
  `available_from/until` and `type` are enforced server-side but can only be set
  in SQL. The editor writes `title`, `is_published` and `instructions` only.
- Mobile app wiring (i18n dictionary moves to `packages/shared` when it lands);
  BM for transactional email + Edge Function errors; web code-splitting.
- Plans in `docs/` (academy registration/reconciliation, CI/CD).

## Commands (use pnpm, not npm)

```bash
pnpm install
pnpm --filter web dev      # web dev server (http://localhost:5173)
pnpm --filter web build    # tsc -b && vite build
pnpm --filter web lint
```

## Conventions

- **Functionality first. No UI cosmetics.** The owner of this repo does not want
  decorative interface. Do not add a card, banner, tile, badge, status list or
  explanatory paragraph whose only job is to narrate something the interface
  already shows, or to reassure the user that a thing happened. If a control
  does the work, ship the control and nothing else. Prefer **removing** UI to
  adding it; put a new thing on an existing page before inventing a page for it;
  and when a screen has one obvious action, that is a button — everything
  occasional belongs behind a `⋯` menu. A section that exists to explain the
  product back to the user is slop and will be deleted.
- **TypeScript only.** Shared-first: cross-app types/logic go in `packages/shared`.
- **DB types are generated** (Supabase MCP `generate_typescript_types`), not hand-written.
- **Multi-tenancy is enforced in the DB** via RLS: every tenant table has `academy_id`
  + policies. Tenancy checks use SECURITY DEFINER helpers in the `app` schema
  (`app.is_staff/is_admin/owns_student/is_enrolled`). Never rely on client filtering.
- **Secrets** (service-role key, gateway keys) never ship to clients — anon/publishable
  key + RLS only; privileged work via SECURITY DEFINER RPCs or Edge Functions.
- Web: `@` path alias; Vite `resolve.dedupe` pins a single React (pnpm monorepo).

## Working agreements

- Before schema work: `list_tables`; run `get_advisors` (security + perf) after any DDL.
- After a migration: update `packages/shared` DB types, then wire the app.
- Verify: `pnpm --filter web build` + `lint`. Record decisions in `docs/`.
