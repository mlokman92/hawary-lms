# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

**Hawary LMS** is a Malaysian SaaS Learning Management System. Academies (training
centres, tuition centres, skills providers) subscribe to run their learning
operations end-to-end. It is **multi-tenant**: each academy is an isolated tenant,
and its trainers, students, and data must never be visible to another academy.

### User roles

| Role        | Primary surface        | What they do |
|-------------|------------------------|--------------|
| **Trainer** | Mobile app + Web       | Create notes/assessments/assignments, grade submissions, track student progress |
| **Student** | Mobile app             | Read notes, take assessments, submit assignments, enroll in courses, pay invoices |
| **Admin**   | Web (academy back-office) | Manage academy, users, courses, enrollment, invoicing & payments, reporting |

### Core features

- **Notes** — course learning material authored by trainers, consumed by students.
- **Assessments** — quizzes/exams with grading (auto or trainer-marked).
- **Assignments** — student submissions (files/text), trainer grading and feedback.
- **Enrollment** — students join courses/classes; admin/trainer manage rosters.
- **Invoicing & Payment** — issue invoices, collect payment (MYR), track status.

## Tech stack

Monorepo managed with **pnpm workspaces + Turborepo**.

- **Web** — Vite + React + TypeScript (`apps/web`). Admin back-office + trainer surface.
- **Mobile** — Expo (React Native) + TypeScript (`apps/mobile`). Student + trainer surface.
- **Backend** — Supabase (Postgres, Auth, Storage, Realtime, Edge Functions).
  - Project ref: `vpklztxqkvqmmzsxfqgp` (configured in `.mcp.json`).
  - Use the Supabase MCP tools for schema/queries/logs/advisors.
- **Shared** — `packages/shared`: TypeScript types, generated DB types, Supabase
  client factory, validation schemas, and cross-platform business logic reused by
  both apps. **Put anything used by both web and mobile here — do not duplicate.**

### UI & styling

Design system: the **shadcn** approach on both platforms — components are copied
into the repo (we own and edit them), themed with CSS variables so web and mobile
stay visually consistent.

- **Web** — **shadcn/ui** (Radix UI primitives + **Tailwind CSS**). Add components
  with `pnpm dlx shadcn@latest add <name>`; they live in `apps/web/src/components/ui`.
- **Mobile** — **React Native Reusables** (the shadcn equivalent for React Native,
  built on **NativeWind** = Tailwind for RN). Same token names, RN implementations.
- **Shared tokens** — colour / spacing / radius tokens are kept in sync across both
  (a shared Tailwind preset + CSS variables) so a brand tweak updates both apps.

Note: shadcn/ui components are web-only (Radix/DOM) — the identical component can't
be reused on RN; mobile uses the RNR counterpart with matching tokens.

Status: **web is set up** — Tailwind v4 (`@tailwindcss/vite`), neutral theme via CSS
variables in `apps/web/src/index.css`, `@` path alias, and `components/ui` (button,
input, label, card, select). Add more with `pnpm dlx shadcn@latest add <name>`.
**Mobile (RNR + NativeWind) is still pending** — set up when mobile UI begins.

### Malaysian context

- Currency **MYR**; format as `RM`. Be mindful of **SST** on invoices where relevant.
- Likely **bilingual** UI (Bahasa Melayu + English) — design copy for i18n from day one.
- Payment gateways to evaluate: **Billplz**, **ToyyibPay**, **Stripe** (card).

## Repository layout

```
hawary-lms/
├── apps/
│   ├── web/            # Vite + React + TS (admin + trainer web)
│   └── mobile/         # Expo + React Native + TS (student + trainer)
├── packages/
│   └── shared/         # types, supabase client, validation, business logic
├── docs/               # architecture, requirements, decisions
├── package.json        # root workspace scripts (turbo)
├── pnpm-workspace.yaml
├── turbo.json
└── tsconfig.base.json  # shared TS compiler options
```

## Commands

> Both apps are scaffolded and dependencies are installed. **Use pnpm, not npm**
> (this is a pnpm workspace). Prefer the root turbo scripts:

```bash
pnpm install          # install all workspace deps
pnpm dev              # turbo run dev (all apps)
pnpm build            # turbo run build
pnpm lint             # turbo run lint
pnpm typecheck        # turbo run typecheck

# Target one app:
pnpm --filter web dev
pnpm --filter mobile start
```

## Conventions

- **TypeScript everywhere.** No plain JS for app code.
- **Shared-first.** Types, DB access, and domain logic used by both apps live in
  `packages/shared`. Import from there rather than redefining.
- **UI: use shadcn/ui (web) and React Native Reusables (mobile)** rather than
  hand-rolling components. Keep design tokens shared so both apps match.
- **Database types are generated**, not hand-written. Regenerate after schema
  changes (Supabase MCP `generate_typescript_types`) into `packages/shared`.
- **Multi-tenancy is enforced in the database** via Row Level Security (RLS).
  Every tenant-scoped table needs an `academy_id` and RLS policies. Never rely on
  client-side filtering alone for tenant isolation.
- **Secrets** (Supabase service-role key, gateway keys) never ship in the mobile or
  web bundle. Client apps use the anon/publishable key + RLS; privileged work goes
  through Edge Functions.
- Keep money in the smallest unit (sen) as integers to avoid float errors.

## Working agreements for Claude

- Before schema work: `list_tables` to understand current structure; check
  `get_advisors` (security + performance) and `get_logs` when debugging.
- When adding a feature that touches both apps, land the shared logic/types in
  `packages/shared` first, then wire each app to it.
- Update `docs/` when you make an architectural decision worth remembering.
