# CLAUDE.md

Guidance for Claude Code in this repo.

> **Keep this file under 200 lines.** It is loaded into every session, so it
> holds only what an agent needs *before* reading anything else. Decisions and
> their rationale go in `docs/` — do not record a fix here.

## Project

**Hawary LMS** — Malaysian multi-tenant SaaS LMS. Each **academy** is an
isolated tenant (trainers/students/data never cross academies). Roles: **admin**
& **trainer** (web back-office), **student** (mobile, later). Features: courses,
students/enrollment, notes, assessments, assignments, payments. Malaysian: MYR
(store as **sen**), SST-aware invoices, **bilingual EN/BM** (web); payment
gateways are live for ToyyibPay (money in) and Billplz (money out).

## Tech stack

Monorepo: **pnpm workspaces + Turborepo**.

- `apps/web` — Vite + React + TS. Admin/trainer surface. **Built.**
- `apps/mobile` — Expo (React Native) + TS. Student surface. **Scaffolded, not wired.**
- `packages/shared` — TS types, **generated** DB types, Supabase client, domain logic.
- Backend — **Supabase** (Postgres + RLS, Auth, Storage, Edge Functions).
  Project ref `vpklztxqkvqmmzsxfqgp`; use the Supabase MCP tools. Migrations in
  `supabase/migrations/`.
- **Web UI** — shadcn/ui (Radix + **Tailwind v4**), neutral theme in
  `apps/web/src/index.css`, `@` alias, `apps/web/src/components/ui` (add via
  `pnpm dlx shadcn@latest add <name>`). Data layer: **TanStack Query**; feature
  code in `apps/web/src/features/*`; shared page vocabulary in
  `apps/web/src/components/patterns/*`.
- **Mobile UI** — React Native Reusables + NativeWind (pending).
- **Email** — Resend, from `noreply@hawary.my`. `RESEND_API_KEY`,
  `INVITE_FROM_EMAIL`, `APP_URL`, `ALLOWED_ORIGINS` are set and shared by every
  mail function. Supabase Auth sends its own confirm/reset mail through Resend
  SMTP, configured in the dashboard, not in this repo. Auth's per-hour rate
  limit and Resend's plan cap are **separate and both real**.

## What's built (web)

Staff back-office and a learner surface, both on the same shell. Auth,
onboarding and academy creation; Courses · Students · Instructors ·
Appointments; course → module → content authoring with grading queues;
enrollment; report checks; notifications; four money screens; members & roles;
CSV import; EN/BM throughout.

A trainer's nav is Dashboard + those four sections. Admins also get Payments
(+ Log), Incentive, Members and Settings.

## Where the decisions are written down

Read the doc before changing the area. Each one keeps the *why*.

| area | doc |
| --- | --- |
| system shape, data model, RLS helpers, write guards | [architecture.md](docs/architecture.md) |
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
| product scope | [requirements.md](docs/requirements.md) |

## Not built / next

- Assignment **attachments** — the student branch in `upload-media` exists
  (report checks needed it), so what is left is a private `submissions` bucket
  and the wiring to `assignment_submissions`.
- Assessment settings have **no UI**: `duration_minutes`, `max_attempts`,
  `available_from/until` and `type` are enforced server-side but can only be set
  in SQL. The editor writes `title`, `is_published` and `instructions` only.
- Mobile app wiring (the i18n dictionary moves to `packages/shared` when it
  lands).
- BM for transactional email and Edge Function errors — both stay English.
- Scheduled expiry sweep for invitations; web code-splitting.
- Plans in `docs/`: academy registration/reconciliation, CI/CD.

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
- **TypeScript only.** Shared-first: cross-app types/logic go in
  `packages/shared`.
- **DB types are generated** (Supabase MCP `generate_typescript_types`), not
  hand-written.
- **Multi-tenancy is enforced in the DB** via RLS: every tenant table has
  `academy_id` + policies. Tenancy checks use SECURITY DEFINER helpers in the
  `app` schema (`app.is_staff` / `is_admin` / `owns_student` / `owns_instructor`
  / `is_enrolled` / `can_grade_course`). **Never rely on client filtering** — a
  staff JWT plus the publishable key reads PostgREST directly, so hiding a card
  is not a boundary.
- **Never narrow `app.is_staff` itself.** Dozens of policies rest on it and
  nearly all are teaching grants a trainer must keep. Narrow the individual
  policies.
- **Secrets** (service-role key, gateway keys) never ship to clients —
  anon/publishable key + RLS only; privileged work via SECURITY DEFINER RPCs or
  Edge Functions.
- **Money in integer sen.** Never floats, never ringgit in the database.
- **Columns a client must never write**, because a trigger or a generated column
  owns them: `invoices.amount_paid_sen`, `invoices.balance_sen`,
  `assessments.total_points`.
- **Clients have no DML** on `academy_invitations`, `notifications`,
  `incentive_payouts`, `assessment_questions`, or `appointments` — those move
  only through RPCs. Check before adding a policy.
- **i18n**: keys are flat and self-prefixed, so `TKey = keyof typeof en` — a bad
  key **and** a missing Malay entry are both compile errors. Use `useT()` →
  `t`/`tn`; `translate()` is the non-reactive escape hatch for plain helpers
  only.
- Web: `@` path alias; Vite `resolve.dedupe` pins a single React (pnpm
  monorepo).

## Working agreements

- Before schema work: `list_tables`; run `get_advisors` (security + perf) after
  any DDL.
- After a migration: update `packages/shared` DB types, then wire the app.
- Verify: `pnpm --filter web build` + `pnpm --filter web lint`.
- **Record decisions in `docs/`, not in this file.** Add the doc to
  `docs/README.md` and, if it is a new area, one row to the table above.
- Production is live at **app.hawary.my** and the owner deploys it himself —
  push to `main` only when asked.
