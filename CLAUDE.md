# CLAUDE.md

Guidance for Claude Code in this repo.

## Project

**Hawary LMS** — Malaysian multi-tenant SaaS LMS. Each **academy** is an isolated
tenant (trainers/students/data never cross academies). Roles: **admin** & **trainer**
(web back-office), **student** (mobile, later). Features: courses, students/enrollment,
notes, assessments, assignments, payments. Malaysian: MYR (store as **sen**),
SST-aware invoices; bilingual BM/EN + payment gateways are future work.

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

- **Auth + onboarding**: email/password sign in/up, self-serve academy creation
  (creator becomes admin), academy switcher, light/dark theme.
- **Modules** (each: list + add/edit, staff-gated, academy-scoped by RLS):
  Courses · Students · Notes · Assessments · Assignments · Payments.
- **Data model**: identity is global (`profiles`, one per email); roles/records are
  per-academy. A **student is an academy record** (`students`, not necessarily an auth
  user); enrollment/invoices/payments reference `students`. Money in integer **sen**.
- **Account linking**: `academy_invitations` + `create_invitation`/`accept_invitation`
  RPCs reconcile an invited student to a profile (email delivery needs SMTP).
- **Block content**: shared editor (`lib/blocks.ts` + `components/BlocksEditor.tsx`) —
  text / image / youtube — used by notes, assessments, assignments.
- **Storage**: public `avatars` + `note-media` buckets, staff-scoped by `<academy_id>/`.

### Deferred / next
- Student-facing **answering/grading**: `assessment_attempts` + `assignment_submissions`
  still reference `profiles` (repoint to `students` when built).
- Mobile app wiring; SMTP email; web code-splitting.
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
