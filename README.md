# Hawary LMS

Malaysian SaaS **Learning Management System** for academies — manage courses,
learning material, assessments, assignments, enrollment, and payments in one place.

Multi-tenant: each academy is an isolated tenant with its own trainers and students.

## Users

- **Trainer** — authors notes/assessments/assignments, grades work, tracks progress.
- **Student** — learns, submits work, enrolls in courses, pays invoices.
- **Admin** — runs the academy back-office: users, courses, enrollment, billing.

## Features

Notes · Assessments · Assignments · Enrollment · Invoicing & Payment

## Stack

Monorepo (**pnpm + Turborepo**):

- `apps/web` — Vite + React + TypeScript (admin + trainer web)
- `apps/mobile` — Expo + React Native + TypeScript (student + trainer)
- `packages/shared` — shared types, Supabase client, validation, business logic
- Backend — **Supabase** (Postgres, Auth, Storage, Edge Functions)

## Getting started

Requires Node 20+ and pnpm 9 (`npm i -g pnpm`).

```bash
pnpm install            # install all workspace deps

# Environment: copy the templates and fill in real values
cp apps/web/.env.example    apps/web/.env.local
cp apps/mobile/.env.example apps/mobile/.env.local

pnpm dev                # run all apps via turbo
pnpm --filter web dev   # just the web app
pnpm --filter mobile start   # just the mobile app
```

### Environment variables

| App    | File                     | Vars |
|--------|--------------------------|------|
| web    | `apps/web/.env.local`    | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` |
| mobile | `apps/mobile/.env.local` | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |

These use the Supabase **publishable** key, which is safe to ship in client
bundles — access is bounded by Row Level Security. The service-role key must
never appear in an app; privileged work goes through Supabase Edge Functions.

### Database

Schema lives in [`supabase/migrations/`](supabase/migrations/). To work against
it with the Supabase CLI:

```bash
supabase link --project-ref vpklztxqkvqmmzsxfqgp
supabase db push        # apply local migrations
```

See [CLAUDE.md](CLAUDE.md) for architecture and conventions, and [`docs/`](docs/)
for requirements and decisions.
