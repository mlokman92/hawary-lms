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

> Greenfield — the folder skeleton and workspace config exist; the app packages
> are not scaffolded yet.

```bash
pnpm install     # once at least one app is scaffolded
pnpm dev         # run all apps via turbo
```

See [CLAUDE.md](CLAUDE.md) for architecture and conventions, and [`docs/`](docs/)
for requirements and decisions.
