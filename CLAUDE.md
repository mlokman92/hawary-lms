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
  Courses · Students · Instructors · Payments. Nav is these four + Dashboard;
  admins also get Members + Settings. The **header search** (`HeaderSearch` +
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
    `/enrollments` is the third child and the same shape of thing: the
    enrollment-application queue, narrowed by the same rule.
    Awaiting/Marked/All tiles, search, and a `?course=` filter the course page
    deep-links into (its **Grading** button now points at
    `/assessments?course=:id`). `/courses/:id/grading` (`CourseGradingPage`)
    still resolves for older links. Authoring stays inside a course — there is
    no academy-wide content inventory, and `LibraryPage`/`features/library`
    were removed when this replaced them.
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
- **Enrollment** (`docs/course-enrollment.md`): two ways onto a course. Staff
  **bulk-enrol** existing records from the course page's *Enrollment* card —
  paste/CSV of emails matched against `students` in this academy only, bucketed
  (to enroll · already · no record · ambiguous · invalid) *before* any write,
  upserted so a dropped student reactivates. Strangers **apply**: each course can
  open a public page at `/enroll/:slug/:courseId` (per-course is the artifact —
  the intake lives in the title; `/enroll/:slug` is a directory of open+listed
  intakes). Viewing is anon; applying needs an account, and the half-filled form
  survives the `/signup?next=` hop via `lib/enrollDraft.ts`. An application is
  its own table because `enrollments.student_id` is NOT NULL — **approval is the
  conversion** into students + academy_members + enrollments, reusing
  `app.link_claimed_record`. Gated by `app.can_grade_course` (queue at
  `/enrollments`, `?course=` deep-link). `course_enrollment_settings` is 1:1 with
  a course; **an absent row means no enrollment page**, and `required_fields`
  decides what the form *asks for*. Capacity never closes the form (over-capacity
  approval needs `_force`). No client DML on `enrollment_applications` at all —
  every write is a SECURITY DEFINER RPC. Duplicate matches are only `linkable` on
  a **confirmed** email; IC/typed-email matches are warnings. **No invoice is
  created** — billing stays a deliberate act on `/payments`. No decision email
  either, so `MyApplicationList` on `/onboarding` + both profile pages is how an
  applicant finds out.
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
- **Transactional email is not configured** — sign-up confirmation uses Supabase's
  low-rate test mailer and the functions want `APP_URL`/`ALLOWED_ORIGINS` set.
  Less load-bearing since self-claim landed: an invitee signs up and finds the
  academy waiting on `/onboarding` without any email being sent.
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
