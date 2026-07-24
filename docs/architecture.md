# Architecture

> Direction, not final. Update as decisions are made — keep the *why*.

## Shape

```
        ┌─────────────┐        ┌──────────────┐
        │  apps/web   │        │ apps/mobile  │
        │ Vite+React  │        │    Expo RN   │
        │ admin+trainer│       │student+trainer│
        └──────┬──────┘        └──────┬───────┘
               │   import @hawary/shared │
               └────────────┬───────────┘
                            │
                   ┌────────▼────────┐
                   │ packages/shared │  types, supabase client,
                   │                 │  validation, domain logic
                   └────────┬────────┘
                            │
                   ┌────────▼────────┐
                   │    Supabase     │  Postgres + RLS, Auth,
                   │  vpklztxqkvqmm… │  Storage, Edge Functions
                   └─────────────────┘
```

## Key decisions

- **Monorepo (pnpm + Turborepo).** Web and mobile share types and domain logic;
  a monorepo makes that first-class and keeps them in lockstep.
- **Supabase as backend.** Postgres with Row Level Security is the tenant-isolation
  mechanism. Auth, Storage (assignment files, notes media), and Edge Functions
  (privileged/server-only work: payment webhooks, invoice generation) included.
- **RLS-enforced multi-tenancy.** Every tenant-scoped table carries `academy_id`;
  policies restrict rows to the caller's academy. Client filtering is never the
  security boundary.
- **Generated DB types** live in `packages/shared` and are regenerated after schema
  changes — the apps consume typed queries, not stringly-typed access.
- **Money as integer sen.** Avoids float rounding in invoicing/payment.
- **Secrets stay server-side.** Client bundles use the anon/publishable key + RLS;
  the service-role key and gateway secrets live only in Edge Functions / server env.

## Data model (early sketch — to validate)

- `academies` (tenant root)
- `profiles` / `memberships` (user ↔ academy ↔ role: trainer/student/admin)
- `courses`, `enrollments`
- `notes`
- `assessments`, `assessment_questions`, `assessment_attempts`
- `assignments`, `assignment_submissions`
- `invoices`, `invoice_items`, `payments`

Each tenant-scoped table gets `academy_id` + RLS. Validate against requirements
before creating migrations.
