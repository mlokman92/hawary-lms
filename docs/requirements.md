# Requirements (working draft)

> Initial capture from project kickoff. Refine as scope firms up.

## Vision

Hawary Academy's own Learning Management System, steered toward delivering the
**Diploma Kemahiran Malaysia (DKM) dalam bidang Pengasuhan dan Pendidikan Awal
Kanak-Kanak** under JPK: material, assessment, enrollment, and billing.

## Branches

Hawary Academy may open branches. A branch is an academy row, opened by the owner
([single-owner.md](single-owner.md)). All data is scoped to a branch and isolated
from the others (enforced via Supabase RLS on `academy_id`).

## Roles

- **Trainer** — authoring + grading + progress tracking.
- **Student** — learning + submissions + enrollment + payment.
- **Admin** — back-office: students, courses, enrollment, invoices, payments,
  incentives, reporting.
- **Director** — an admin with owner-granted authority to add or remove admins and
  trainers, and to change payment-gateway credentials, payment defaults and the
  invoice letterhead. Hawary Academy has two.

## Feature scope (v1 direction)

| Feature | Trainer | Student | Admin |
|---|---|---|---|
| **Notes** | create/edit (per module) | read | oversee |
| **Assessments** | create; grade open-ended (MCQ auto) | take | oversee/report |
| **Assignments** | create, grade + feedback | submit (text/docs) | oversee |
| **Enrollment** | manage roster | view enrolled courses | manage roster |
| **Invoicing & Payment** | — | view invoices (MYR) | issue invoices |
| **Accounts** | — | — | invite/manage students; trainers & admins: Director only |

## Malaysian specifics

- Currency **MYR** (`RM`); store money as integer **sen**.
- **SST** consideration on invoices.
- Bilingual UI (Bahasa Melayu + English) — plan i18n from the start.
- Payment gateways: **ToyyibPay** (money in) and **Billplz** (money out) are live.

## Decisions (v1)

Confirmed at kickoff (2026-07-24). Keep v1 simple; revisit as needed.

- **Course structure** — **flat courses**, each broken into **modules** (a course is a
  sequence of modules). Different course shapes (e.g. *short course* vs *long course*)
  are just courses with different module sets. Notes/assessments/assignments hang off a
  module. No cohorts/intakes/schedules yet.
  - *Schema impact:* add a `modules` table (`course_id`, `title`, `sort_order`) and give
    content a nullable `module_id`. Not in the current migrations — near-term follow-up.
- **Assessments** — two grading modes:
  - **MCQ / objective** (single/multiple choice, true-false) → **auto-graded**.
  - **Open-ended** (short_text, essay) → **trainer-graded**.
  - (The `question_type` enum already supports both; auto-grading logic lives in an
    Edge Function so answers never reach the client.)
- **Assignments** — submission = **text and/or document upload** (files in Supabase
  Storage; `attachment_url` on the submission). No links or plagiarism checks yet.
- **Billing** — **simple invoicing**: an **admin issues an invoice**; the student sees
  it in their portal (read-only). No subscriptions or plans. ToyyibPay FPX (money in,
  with part payment) and Billplz (incentives out) are live →
  [toyyibpay-payments.md](toyyibpay-payments.md),
  [billplz-incentives.md](billplz-incentives.md).
- **Provisioning** — **Hawary-managed**. Branches are opened by the owner in SQL; a
  Director invites trainers and admins; admins add students by hand, by CSV, or through
  the public `/enroll/:slug` link → see [single-owner.md](single-owner.md).
- **Notifications** — **email only** for v1 (Supabase Auth emails + transactional email
  for invites/invoices), plus the in-app bell ([notifications.md](notifications.md)).
  No push yet.

## Deferred (post-v1)

Cohorts/intakes with schedules · timed assessments & attempt limits (fields exist, UI
later) · plagiarism checks · subscriptions · push notifications.
