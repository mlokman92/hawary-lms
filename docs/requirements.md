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
| **Notes** | create/edit | read | oversee |
| **Assessments** | create, grade | take | oversee/report |
| **Assignments** | create, grade + feedback | submit | oversee |
| **Enrollment** | manage roster | self-enroll / request | manage, approve |
| **Invoicing & Payment** | — | view + pay (MYR) | issue, reconcile |

## Malaysian specifics

- Currency **MYR** (`RM`); store money as integer **sen**.
- **SST** consideration on invoices.
- Bilingual UI (Bahasa Melayu + English) — plan i18n from the start.
- Payment gateway candidates: **Billplz**, **ToyyibPay**, **Stripe**.

## Open questions

- Course/class structure: flat courses vs. cohorts/intakes with schedules?
- Assessment types: MCQ/quiz auto-grade vs. manual only? Time limits? Attempts?
- Assignment submission types: file upload, text, links? Plagiarism concerns?
- Billing model: per-student invoices, subscription plans, or both? Instalments?
- Who provisions academies and trainers — self-serve signup or Hawary-managed?
- Notifications: email, push (Expo), in-app? Which events?
