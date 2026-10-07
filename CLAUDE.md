# CLAUDE.md

Guidance for Claude Code in this repo.

> **Keep this file under 200 lines.** It is loaded into every session, so it
> holds only what an agent needs *before* reading anything else. Decisions and
> their rationale go in `docs/` — do not record a fix or its history here.

## Project

**Hawary LMS** is **Hawary Academy's** learning management system — a
Malaysian TVET academy running the **Diploma Kemahiran Malaysia (DKM) dalam
bidang Pengasuhan dan Pendidikan Awal Kanak-Kanak**, a programme under
**Jabatan Pembangunan Kemahiran (JPK)**. Students attend in intakes ("Siri"),
each a course; the business rule is **one student, one course**. New work serves
this programme first. Nothing JPK-specific (programme structure, assessment
rules, reporting formats) is modelled yet — ask, or read the doc once one exists
in `docs/`.

- **Hawary Academy** is academy `9c5fd727-65cd-4657-ab4d-fe52fa93d8b7`, the only
  one today. A future **branch** is another academy row, isolated by
  `academy_id` + RLS exactly like this one. Academies are created and closed by
  the owner in SQL, never through the app or the API.
- **Roles** (per academy, on `academy_members`):
  - **Director** — an admin with `is_director`. Grants and revokes staff access
    (admin/trainer), and owns the gateway & billing settings. Set by the owner in
    SQL only.
  - **admin** — runs the academy: students, courses, invoices, payments,
    incentives, appointments, reports.
  - **trainer** — teaches and grades the courses they are assigned to.
  - **student** — the learner surface (`/learn`) and the Student mobile app.
- **Malaysian**: MYR stored as integer **sen**, SST-aware invoices, **bilingual
  EN/BM** web UI. Money in through **ToyyibPay** (FPX), money out through
  **Billplz** (incentive payouts) — both live.

## Tech stack

Monorepo: **pnpm workspaces + Turborepo**.

- `apps/web` — Vite + React + TS. Staff back-office and learner surface.
- `apps/mobile` — Expo (React Native) + TS, EAS. **One project, two apps**:
  Hawary Student LMS and Hawary Academy LMS, picked by `APP_VARIANT`, each with
  its own route tree. Its data hooks are **synced copies** of the web's
  (`pnpm --filter mobile sync:data`) — edit the web file, never the copy.
- `packages/shared` — TS types, **generated** DB types, Supabase client, domain
  logic, and the EN/BM dictionary both surfaces render.
- Backend — **Supabase** (Postgres + RLS, Auth, Storage, Edge Functions).
  Project ref `vpklztxqkvqmmzsxfqgp`. Migrations in `supabase/migrations/`.
- **Web UI** — shadcn/ui (Radix + **Tailwind v4**), neutral theme in
  `apps/web/src/index.css`, `@` alias, `apps/web/src/components/ui` (add via
  `pnpm dlx shadcn@latest add <name>`). Data layer: **TanStack Query**; feature
  code in `apps/web/src/features/*`; shared page vocabulary in
  `apps/web/src/components/patterns/*`.
- **Mobile UI** — a small StyleSheet kit in `apps/mobile/src/ui` carrying the
  web's theme (zinc + teal, Figtree). No NativeWind. A text weight is a font
  family (`font(700)` or `<T>`), never `fontWeight`.
- **Email** — Resend, from `noreply@hawary.my`. `RESEND_API_KEY`,
  `INVITE_FROM_EMAIL`, `APP_URL`, `ALLOWED_ORIGINS` are shared by every mail
  function. Supabase Auth sends confirm/reset mail through Resend SMTP,
  configured in the dashboard. Auth's per-hour rate limit and Resend's plan cap
  are **separate and both real**.

## The web app

One shell, two trees:

- **Back-office** (`/`) — Dashboard · Courses · Students · Instructors ·
  Appointments · Reports for every staff member; admins also get Payments
  (+ Log, Report), Incentives and Members (a read-only roster unless Director);
  Directors also get Settings and Analytics. Course → module → content
  authoring, grading queues, enrollment, CSV import, notifications.
- **Learner** (`/learn`) — courses, work, billing, appointments, reports,
  profile.
- People get in by **invitation or claiming**: staff create the student record
  (a Director the instructor record), and the account that signs in with that
  email claims it.
  A signed-in account with no membership lands on `/onboarding` (its pending
  invitations, or "no record of you at this address"). The public join link is
  `/enroll/<academy slug>`.

## Where the decisions are written down

Read the doc before changing the area. Each one keeps the *why*.

| area | doc |
| --- | --- |
| system shape, data model, RLS helpers, write guards | [architecture.md](docs/architecture.md) |
| one owner, branches, Directors | [single-owner.md](docs/single-owner.md) |
| shells, nav, staff screens, dashboards, members, CSV import, storage | [web-surface.md](docs/web-surface.md) |
| course → module → content hierarchy | [course-modules.md](docs/course-modules.md) |
| question types and scoring | [question-types.md](docs/question-types.md) |
| course materials (private bucket) | [course-materials.md](docs/course-materials.md) |
| course duplication | [course-duplication.md](docs/course-duplication.md) |
| enrollment — the public link, requests, bulk enrol | [course-enrollment.md](docs/course-enrollment.md) |
| appointments — derived slots, rota, cover, blocked dates | [appointments.md](docs/appointments.md) |
| report checks | [report-checks.md](docs/report-checks.md) |
| notifications (the bell) | [notifications.md](docs/notifications.md) |
| account claiming, invitations, name fill | [account-claiming.md](docs/account-claiming.md) |
| why money is admin-only | [money-is-admin-only.md](docs/money-is-admin-only.md) |
| `/payments` + `/payments/log`, pagination, tiles | [payment-screens.md](docs/payment-screens.md) |
| `/payments/report` drill | [payment-report.md](docs/payment-report.md) |
| `/courses/:id/billing` — who was never invoiced | [course-billing.md](docs/course-billing.md) |
| invoice/receipt PDFs, academy details | [invoice-documents.md](docs/invoice-documents.md) |
| ToyyibPay: FPX charge, part payment | [toyyibpay-payments.md](docs/toyyibpay-payments.md) |
| Billplz: paying incentives out | [billplz-incentives.md](docs/billplz-incentives.md) |
| student vs instructor roles, write guards | [student-instructor-roles.md](docs/student-instructor-roles.md) |
| i18n — **read the house-style list before writing Malay** | [i18n.md](docs/i18n.md) |
| deployment, URLs, redirect allow list | [production-urls.md](docs/production-urls.md) |
| CI/CD plan | [ci-cd.md](docs/ci-cd.md) |
| the two mobile apps, push, deep links, attachments, announcements | [mobile-apps.md](docs/mobile-apps.md) |
| the logo, its colours and files (`brand/`) | [brand.md](docs/brand.md) |
| `/analytics` — what counts as a login, the `login_events` log | [analytics.md](docs/analytics.md) |
| product scope | [requirements.md](docs/requirements.md) |

## Not built

- Assignment attachments are **attached in the Student mobile app only**; the
  web shows them. Announcements are **mobile only**.
- Assessment settings have **no UI**: `duration_minutes`, `max_attempts`,
  `available_from/until` and `type` are enforced server-side but set only in
  SQL. The editor writes `title`, `is_published` and `instructions`.
- Opening a branch has no UI ([single-owner.md](docs/single-owner.md)).
- BM for transactional email and Edge Function errors — both are English.
- Scheduled expiry sweep for invitations; web code-splitting.

## Commands (use pnpm, not npm)

```bash
pnpm install
pnpm --filter web dev      # web dev server (http://localhost:5173)
pnpm --filter web build    # tsc -b && vite build
pnpm --filter web lint
pnpm --filter mobile dev:student   # or dev:academy
pnpm --filter mobile typecheck
pnpm --filter mobile sync:data     # after editing a web data hook
```

## Conventions

- **Functionality first. No UI cosmetics.** The owner does not want decorative
  interface. Do not add a card, banner, tile, badge, status list or explanatory
  paragraph whose only job is to narrate something the interface already shows,
  or to reassure the user that a thing happened. If a control does the work,
  ship the control and nothing else. Prefer **removing** UI to adding it; put a
  new thing on an existing page before inventing a page for it; when a screen
  has one obvious action, that is a button — everything occasional belongs
  behind a `⋯` menu. Hide a control the user's role cannot use rather than
  explaining why it fails.
- **TypeScript only.** Shared-first: cross-app types/logic go in
  `packages/shared`.
- **DB types are generated** (Supabase `generate_typescript_types`), never
  hand-written.
- **Access is enforced in the DB** via RLS: every academy-scoped table has
  `academy_id` + policies, and checks go through SECURITY DEFINER helpers in the
  `app` schema (`app.is_staff` / `is_admin` / `is_director` / `owns_student` /
  `owns_instructor` / `is_enrolled` / `can_grade_course`). **Never rely on
  client filtering** — a staff JWT plus the publishable key reads PostgREST
  directly, so hiding a card is not a boundary.
- **Never narrow `app.is_staff` itself.** Dozens of policies rest on it and
  nearly all are teaching grants a trainer must keep. Narrow the individual
  policies.
- **Secrets** (service-role key, gateway keys) never ship to clients —
  anon/publishable key + RLS only; privileged work via SECURITY DEFINER RPCs or
  Edge Functions.
- **Money in integer sen.** Never floats, never ringgit in the database.
- **Columns a client must never write**, because a trigger or a generated column
  owns them: `invoices.amount_paid_sen`, `invoices.balance_sen`,
  `assessments.total_points`, `academy_members.is_director`.
- **Clients have no DML** on `academy_invitations`, `notifications`,
  `incentive_payouts`, `assessment_questions`, `appointments`,
  `announcements` or `assignment_submission_files`, and no INSERT
  or DELETE on `academies` — those move only through RPCs or the owner. Check
  before adding a policy. `login_events` and `push_devices` have no client access at all.
- **i18n**: keys are flat and self-prefixed, so `TKey = keyof typeof en` — a bad
  key **and** a missing Malay entry are both compile errors. Use `useT()` →
  `t`/`tn`; `translate()` is the non-reactive escape hatch for plain helpers
  only.
- Web: `@` path alias; Vite `resolve.dedupe` pins a single React (pnpm
  monorepo).

## Working agreements

- Before schema work: `list_tables`; run `get_advisors` (security + perf) after
  any DDL.
- Applying SQL: the Supabase MCP tools first. If they return
  `{"status":"declined"}`, use
  `npx -y supabase@latest db query --linked --project-ref vpklztxqkvqmmzsxfqgp -f <file>`
  and insert the `supabase_migrations.schema_migrations` row yourself.
  **Never `supabase db push`** — remote versions are MCP-stamped and never match
  the local filenames, so it would re-run every migration.
- Production data is live (real students, invoices and payments). Confirm with
  the owner before deleting or rewriting rows.
- After a migration: regenerate the `packages/shared` DB types, then wire the app.
- Verify: `pnpm --filter web build` + `pnpm --filter web lint`.
- **Record decisions in `docs/`, not in this file.** Add the doc to
  `docs/README.md` and, if it is a new area, one row to the table above.
- Production is **app.hawary.my** and the owner deploys it — push to `main`
  only when asked.
