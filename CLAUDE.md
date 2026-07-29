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
  Courses · Students · Instructors · Payments. Nav is these four + Dashboard.
- **Course → module → content**: a course is a card grid (`/courses`) showing per-course
  counts; opening one (`/courses/:id`) lists its **modules**, each holding notes,
  assessments and assignments. `course_modules` is the only hierarchy —
  `module_id` is **NOT NULL** on all three content tables, so there is no
  course-level loose content and notes are a flat list per module (the old note
  folder tree is gone). Editors stay routable at `/notes/:id`, `/assessments/:id`,
  `/assignments/:id`. Reorder/move via `reorder_course_modules` +
  `reorder_module_items(module, kind, ordered_ids)`.
- **Data model**: identity is global (`profiles`, one per email); roles/records are
  per-academy. A **student is an academy record** (`students`, not necessarily an auth
  user); enrollment/invoices/payments reference `students`. An **instructor is the same
  shape** (`instructors`, CRM-style record); `course_instructors` assigns them to
  courses. Money in integer **sen**.
- **Account linking**: `academy_invitations` (`student_id` **or** `instructor_id`) +
  `create_invitation`/`create_instructor_invitation`/`accept_invitation` RPCs reconcile
  an invited student/instructor to a profile — accepting an instructor invite grants the
  `trainer` role (email delivery needs SMTP).
- **Block content**: shared editor (`lib/blocks.ts` + `components/BlocksEditor.tsx`) —
  text / image / youtube — used by assessments and assignments (notes use the
  rich-text `content` column).
- **Student visibility** of content is `is_published AND app.module_visible(module_id)`
  — unpublishing a module hides everything under it. `app.is_enrolled` requires an
  **active membership** plus an unarchived `active`/`trial` student record, so
  suspending a member revokes content immediately.
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

### Deferred / next
- **Transactional email is not configured** — sign-up confirmation uses Supabase's
  low-rate test mailer and `send-invitation` needs `APP_URL`/`ALLOWED_ORIGINS`.
  Until then, link accounts with the admin RPCs above.
- Assignment **attachments** (needs a private `submissions` bucket + a student
  branch in `upload-media`); scheduled expiry sweep for invitations; student
  billing view; assessment auto-scoring for objective question types.
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
