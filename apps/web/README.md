# @hawary/web

Web application — **Vite + React + TypeScript**. Serves the **Admin** back-office
and the **Trainer** desktop surface for Hawary LMS.

## Status

Not scaffolded yet. Planned scaffold:

```bash
pnpm create vite@latest . --template react-ts
```

Then depend on `@hawary/shared` for types, the Supabase client, and domain logic.

## Responsibilities

- Admin: academy settings, users, courses, enrollment, invoicing & payments, reports.
- Trainer: authoring notes/assessments/assignments, grading, progress dashboards.
