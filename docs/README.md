# Docs

Living documentation for Hawary LMS. This is where decisions live — `CLAUDE.md`
is only an index, and is kept under 200 lines.

Keep decisions with their rationale so future work (and Claude) understands
*why*, not just *what*. **Add an entry here when you create a new doc**, and a
row to the table in `CLAUDE.md` if it is a new area.

## Product and shape

- [requirements.md](requirements.md) — product scope, users, features, v1 decisions.
- [architecture.md](architecture.md) — system design, the data model, the `app.*`
  RLS helpers, server-side write guards, and the columns clients must never write.
- [web-surface.md](web-surface.md) — the two shells and why they share one
  component, auth/onboarding, staff sections, course authoring, the grading
  queues, both dashboards, the learner surface, members & roles, CSV import,
  storage.

## Courses and content

- [course-modules.md](course-modules.md) — one hierarchy, course → module →
  content, and why there is no loose course-level content.
- [question-types.md](question-types.md) — the six types, how an answer is
  encoded, and what Postgres scores without a human.
- [course-materials.md](course-materials.md) — the private bucket, and why a
  download is signed by id and never by path.
- [course-duplication.md](course-duplication.md) — what `duplicate_course`
  copies, what it deliberately does not, and why the intake lives in the title.
- [course-enrollment.md](course-enrollment.md) — the public enrollment link,
  requests and approval, and bulk enrolment by email.

## People

- [account-claiming.md](account-claiming.md) — the record *is* the invitation;
  the token flow that survives beside it, and how names cross the gap.
- [student-instructor-roles.md](student-instructor-roles.md) — the two role
  axes and the attempt/submission write guards.
- [academy-registration.md](academy-registration.md) — plan for academy
  self-registration and account setup.

## Sessions and coursework

- [appointments.md](appointments.md) — derived slots, the round-robin rota, the
  overlap constraint that makes double-booking impossible, cover on
  cancellation, blocked dates, and who sees whose sessions.
- [report-checks.md](report-checks.md) — one thread per (student, course), the
  checker rota, and why it is not built on booking slots.
- [notifications.md](notifications.md) — the bell in both shells, why a row is
  an event rather than a sentence, and the academy-id-as-a-prop bug.

## Money

- [money-is-admin-only.md](money-is-admin-only.md) — why the five money SELECT
  policies moved from `app.is_staff` to `app.is_admin`, and what that closed.
- [payment-screens.md](payment-screens.md) — `/payments` and `/payments/log`:
  the ledger, why `amount_paid_sen` is derived from it, back-dated payments,
  server-side pagination, and the clickable tiles.
- [payment-report.md](payment-report.md) — the money-received drill
  (month → course → student → payments) and why its rungs are independent
  narrowings rather than a path.
- [course-billing.md](course-billing.md) — the one question the other money
  screens cannot answer: who was never invoiced.
- [invoice-documents.md](invoice-documents.md) — pay tokens, academy details,
  and the invoice/receipt PDFs.
- [toyyibpay-payments.md](toyyibpay-payments.md) — money in: the FPX charge and
  part payment.
- [billplz-incentives.md](billplz-incentives.md) — money out: per-student
  government grants, and why there is no bulk endpoint.

## Platform

- [i18n.md](i18n.md) — EN/BM, compile-checked keys, and the **house-style list
  to read before writing Malay copy**.
- [production-urls.md](production-urls.md) — app.hawary.my, the auth redirect
  allow list, and how the mail functions resolve a base URL.
- [ci-cd.md](ci-cd.md) — Netlify (web), Expo EAS (mobile), Supabase migrations,
  GitHub Actions.
