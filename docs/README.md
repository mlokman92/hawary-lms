# Docs

Living documentation for Hawary LMS.

- [requirements.md](requirements.md) — product scope, users, features, v1 decisions.
- [architecture.md](architecture.md) — system design, data model direction, decisions.
- [academy-registration.md](academy-registration.md) — plan for academy self-registration
  and account setup (invitations).
- [ci-cd.md](ci-cd.md) — CI/CD strategy: Netlify (web), Expo EAS (mobile), Supabase
  migrations, GitHub Actions, and monorepo guidance.
- [course-enrollment.md](course-enrollment.md) — the public enrollment page,
  applications and approval, and bulk enrolment by email.
- [appointments.md](appointments.md) — one-to-one session booking: derived
  slots, the round-robin rota, and the overlap constraint that makes
  double-booking impossible.

Add an entry here when you create a new doc. Keep decisions with their rationale so
future work (and Claude) understands *why*, not just *what*.
