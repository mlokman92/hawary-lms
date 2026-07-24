# Requirements (working draft)

> Initial capture from project kickoff. Refine as scope firms up.

## Vision

A Malaysian SaaS Learning Management System that academies subscribe to in order to
run their learning operations: material, assessment, enrollment, and billing.

## Tenancy

Multi-tenant. **Academy** is the tenant boundary. All data is scoped to an academy
and isolated from other academies (enforced via Supabase RLS on `academy_id`).

## Roles

- **Trainer** — authoring + grading + progress tracking.
- **Student** — learning + submissions + enrollment + payment.
- **Admin** — academy back-office: users, courses, enrollment, billing, reporting.

## Feature scope (v1 direction)

| Feature | Trainer | Student | Admin |
|---|---|---|---|
| **Notes** | create/edit (per module) | read | oversee |
| **Assessments** | create; grade open-ended (MCQ auto) | take | oversee/report |
| **Assignments** | create, grade + feedback | submit (text/docs) | oversee |
| **Enrollment** | manage roster | view enrolled courses | manage roster |
| **Invoicing & Payment** | — | view invoices (MYR) | issue invoices |
| **Accounts** | — | — | invite/manage trainers & students |

## Malaysian specifics

- Currency **MYR** (`RM`); store money as integer **sen**.
- **SST** consideration on invoices.
- Bilingual UI (Bahasa Melayu + English) — plan i18n from the start.
- Payment gateway candidates: **Billplz**, **ToyyibPay**, **Stripe**.

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
  it in their portal (read-only). No subscriptions, plans, or instalments yet. Online
  payment gateway integration deferred (schema already supports recording payments).
- **Provisioning** — the **academy provisions its own people**. Academies **self-register**
  (public signup creates the academy + its first admin); the academy admin then creates/
  invites **trainers** and **students**. Not Hawary-managed. → see
  [academy-registration.md](academy-registration.md).
- **Notifications** — **email only** for v1 (Supabase Auth emails + transactional email
  for invites/invoices). No push or in-app yet.

## Deferred (post-v1)

Cohorts/intakes with schedules · timed assessments & attempt limits (fields exist, UI
later) · plagiarism checks · subscriptions/instalments · online payment gateways
(Billplz/ToyyibPay/Stripe) · push & in-app notifications · bilingual (BM/EN) i18n ·
bulk student import / self-service join codes.
