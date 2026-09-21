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

## Data model

**Identity is global; roles and records are per-academy.**

- `profiles` — one per email, global. Readable by every co-member, so it must
  never carry an address (see `list_academy_staff` in
  [web-surface.md](web-surface.md)).
- `academies` — the tenant root. `created_by` is the Director.
- `academy_members` — account ↔ academy ↔ role (`admin` / `trainer` /
  `student`). This is **access**.
- `students` — an academy **record**, not necessarily an auth user. Enrollment,
  invoices and payments all reference `students`, never an account.
- `instructors` — the same shape, CRM-style. `course_instructors` assigns them
  to courses. This is **teaching**, which is independent of access.
- `courses` → `course_modules` → `notes` / `course_materials` / `assessments` /
  `assignments` (`module_id` NOT NULL on all four —
  [course-modules.md](course-modules.md)).
- `enrollments`, `assessment_attempts`, `assignment_submissions`.
- `invoices`, `invoice_items`, `payments`, `payment_intents` — money in integer
  **sen** ([payment-screens.md](payment-screens.md)).
- `appointments` ([appointments.md](appointments.md)),
  `report_submissions` ([report-checks.md](report-checks.md)),
  `notifications` ([notifications.md](notifications.md)).

An account claims a record rather than being created alongside one — **the
record is the invitation**. See [account-claiming.md](account-claiming.md).

## Tenancy and access helpers

Every tenant-scoped table carries `academy_id` + RLS policies. Checks go
through SECURITY DEFINER helpers in the `app` schema, never through client
filtering:

- `app.is_staff` — admin or trainer. **Never narrow this**: dozens of policies
  rest on it and nearly all are teaching grants a trainer must keep. Narrow the
  individual policies instead, as
  [money-is-admin-only.md](money-is-admin-only.md) did.
- `app.is_admin`, `app.owns_student`, `app.owns_instructor`
- `app.is_enrolled` — requires an **active membership** plus an unarchived
  `active`/`trial` student record, so suspending a member revokes content
  immediately.
- `app.can_grade_course` = `is_admin` OR (`is_staff` AND `teaches_course` via
  `course_instructors`). Admins are academy-wide; trainers see only assigned
  courses.

Student visibility of content is `is_published AND
app.module_visible(module_id)` — unpublishing a module hides everything under
it.

## Server-side write guards

`app.guard_attempt_write` / `app.guard_submission_write` run
`BEFORE INSERT OR UPDATE`, force grading fields null for non-graders, stamp
`graded_by`/`graded_at` from `auth.uid()`, and derive
`started_at`/`submitted_at` server-side — so `due_at`, `allow_late`,
`available_*` and `duration_minutes` are actually enforceable. See
[student-instructor-roles.md](student-instructor-roles.md).

Columns clients must **never** write, because a trigger or generated column
owns them: `invoices.amount_paid_sen`, `invoices.balance_sen`,
`assessments.total_points`.
