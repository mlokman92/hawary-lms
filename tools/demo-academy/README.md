# Hawary Demo Academy — the store reviewers' tenant

Apple and Google sign in to the apps to review them. They do it on the
production project, so they get an academy of their own: **Hawary Demo
Academy** (`de3a0000-0000-4000-8000-000000000001`, slug `hawary-demo`), a
second academy row isolated by `academy_id` + RLS exactly like a branch
([single-owner.md](../../docs/single-owner.md)). Nothing they do can reach
Hawary Academy, and no app rebuild was needed — the apps already serve
whichever academy an account belongs to.

| account | app | role in the demo academy |
| --- | --- | --- |
| `demo.user@hawary.my` | Hawary Student LMS | student (Aina Sofea binti Ahmad) |
| `demo.staff@hawary.my` | Hawary Academy LMS | admin, not a Director |

Two accounts because `academy_members` is unique on (academy, user): one
account cannot be a student and staff in the same academy. Neither account may
belong to any other academy — `seed.sql` refuses to run if one does.

## What is in it

One published course (*DKM Prasekolah Siri Demo*, all three LPKC parts, two
modules of notes), three trainers, the reviewer's student record plus twelve
invented students and one join request, an RM 2,500 invoice each with a mix of
FPX, transfer, KWSP and cash payments, a fortnight of sessions, thirteen LPKC
threads and the notifications those would have produced. The reviewer's own
invoice is fully paid: the demo academy has no ToyyibPay credentials, so a
"Pay online" would only fail.

The invented students have **no email and no account**, so nothing the
reviewers do sends mail to anybody; reminders reach only
`demo.user@hawary.my`. The LPKC sample PDFs live in `student-reports` under
`de3a0000-0000-4000-8000-000000000001/`.

## Reset it

After a review, or whenever the dates have gone stale:

```bash
npx -y supabase@latest db query --linked --project-ref vpklztxqkvqmmzsxfqgp -f tools/demo-academy/seed.sql
```

It deletes the demo academy (everything cascades from it) and seeds it again
with dates relative to today, in one transaction. The two auth accounts and
the storage files are left as they are.

If a reviewer deletes `demo.user@hawary.my` from the app (Home → My profile →
Delete my account), sign up again with the same address at app.hawary.my and
run the seed: the new account claims the student record.

## Keep it out of the real numbers

Anything that reads across academies — a sweep, a report, an export — must
filter on Hawary Academy's id (`9c5fd727-65cd-4657-ab4d-fe52fa93d8b7`), or
the demo's rows join in.
