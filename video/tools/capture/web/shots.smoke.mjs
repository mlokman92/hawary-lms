// Not for the film: one low-res frame of (nearly) every route, as each persona,
// so you can see at a glance what a page still asks the fake backend for.
//
//   node tools/capture/web/run.mjs tools/capture/web/shots.smoke.mjs --port 5311 --serve --trace
//   node tools/capture/web/run.mjs tools/capture/web/shots.smoke.mjs learn-home --port 5311 --trace
//
// Add `db: 'teaching'` (or pass your partition through `defaults`) to see the
// same routes with your data in. Frames land in video/.cache/smoke, which git ignores.

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ID } from '../fake/ids.js'

const here = path.dirname(fileURLToPath(import.meta.url))
export const outDir = path.resolve(here, '../../../.cache/smoke')
export const defaults = { lang: 'en', theme: 'light', db: process.env.SMOKE_DB ?? '' }

const VP = { w: 1440, h: 900, dpr: 1 }
const w1 = ID.content.siri3.week1
const shot = (id, url, as, extra = {}) => ({ id, url, as, viewport: VP, settle: 700, ...extra })

export default [
  // --- back-office, Director ---------------------------------------------------
  shot('dashboard', '/', 'director', { settle: 2200 }),
  shot('courses', '/courses', 'director'),
  shot('course', `/courses/${ID.course.siri3}`, 'director'),
  shot('course-billing', `/courses/${ID.course.siri3}/billing`, 'director'),
  shot('course-grading', `/courses/${ID.course.siri3}/grading`, 'director'),
  shot('note-editor', `/notes/${w1.notes[0]}`, 'director'),
  shot('assessment-editor', `/assessments/${w1.assessment}`, 'director'),
  shot('assignment-editor', `/assignments/${w1.assignment}`, 'director'),
  shot('assessments', '/assessments', 'director'),
  shot('assignments', '/assignments', 'director'),
  shot('enrollments', '/enrollments', 'director'),
  shot('lpkc', '/lpkc', 'director'),
  shot('lpkc-thread', `/lpkc/${ID.hero.report}`, 'director'),
  shot('students', '/students', 'director'),
  shot('student', `/students/${ID.hero.student}`, 'director'),
  shot('instructors', '/instructors', 'director'),
  shot('instructor', `/instructors/${ID.instructor.hajar}`, 'director'),
  shot('appointments', '/appointments', 'director'),
  shot('appointment-list', '/appointments/list', 'director'),
  shot('appointment-settings', '/appointments/settings', 'director'),
  shot('payments', '/payments', 'director'),
  shot('invoice', `/payments/${ID.hero.invoice}`, 'director'),
  shot('payment-log', '/payments/log', 'director'),
  shot('payment-report', '/payments/report', 'director'),
  shot('incentives', '/incentives', 'director'),
  shot('members', '/members', 'director'),
  shot('settings', '/settings', 'director'),
  shot('analytics', '/analytics', 'director'),
  shot('profile', '/profile', 'director'),
  // client-side navigation keeps the persona: land on /, click through the sidebar
  shot('nav-keeps-persona', '/', 'director', { steps: [{ click: { text: 'Students', exact: true } }, { wait: 600 }] }),

  // --- back-office, trainer ------------------------------------------------------
  shot('trainer-dashboard', '/', 'trainer'),
  shot('trainer-lpkc', '/lpkc', 'trainer'),
  shot('trainer-appointments', '/appointments', 'trainer'),
  shot('trainer-payments-redirect', '/payments', 'trainer'),
  // the film's clock walks a thread through its beats (see fake/db/base.reports.ts)
  shot('trainer-thread', `/lpkc/${ID.hero.report}`, 'trainer'),
  shot('trainer-thread-approved', `/lpkc/${ID.hero.report}`, 'trainer', { now: '2026-10-07T12:06' }),

  // --- learner -------------------------------------------------------------------
  shot('learn-home', '/learn', 'student'),
  shot('learn-courses', '/learn/courses', 'student'),
  shot('learn-course', `/learn/courses/${ID.course.siri3}`, 'student'),
  shot('learn-note', `/learn/notes/${w1.notes[0]}`, 'student'),
  shot('learn-assessment', `/learn/assessments/${w1.assessment}`, 'student'),
  shot('learn-assignment', `/learn/assignments/${w1.assignment}`, 'student'),
  shot('learn-work', '/learn/work', 'student'),
  shot('learn-billing', '/learn/billing', 'student'),
  shot('learn-invoice', `/learn/billing/${ID.hero.invoice}`, 'student'),
  shot('learn-appointments', '/learn/appointments', 'student'),
  shot('learn-reports', '/learn/reports', 'student'),
  shot('learn-report', `/learn/reports/${ID.hero.report}`, 'student'),
  shot('learn-report-ai-asked-for-changes', `/learn/reports/${ID.hero.report}`, 'student', { now: '2026-10-07T09:30' }),
  shot('learn-reports-before-upload', '/learn/reports', 'student', { now: '2026-10-07T09:10' }),
  shot('learn-profile', '/learn/profile', 'student'),

  // --- signed out / nowhere yet ----------------------------------------------------
  shot('signin', '/signin', 'anon'),
  shot('signup', '/signup', 'anon'),
  shot('protected-bounces-to-signin', '/courses', 'anon'),
  shot('enroll', '/enroll/hawary-academy', 'anon'),
  shot('pay', '/pay/hawary-demo-pay-0412', 'anon'),
  shot('onboarding', '/onboarding', 'newcomer'),
]
