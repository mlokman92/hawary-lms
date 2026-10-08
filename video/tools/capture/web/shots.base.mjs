// The proving shots: the admin dashboard, the course list, one course.
//
//   node tools/capture/web/run.mjs tools/capture/web/shots.base.mjs --port 5311 --serve     (from video/)
//
// Copy this file's shape for your own: `defaults` are harness URL params every
// shot gets unless it sets its own (as fields on the shot or in its url);
// `outDir` is where the PNG + JSON land.

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ID } from '../fake/ids.js'

const here = path.dirname(fileURLToPath(import.meta.url))

export const outDir = path.resolve(here, '../../../public/shots/web')
export const defaults = { as: 'director', lang: 'en', theme: 'light' }

const VP = { w: 1440, h: 900, dpr: 2 }
const CARD = '[data-slot="card"]'
const siri3 = ID.course.siri3
const weeks = ID.content.siri3

// CourseDetailPage remembers which modules are open in sessionStorage; the
// harness's `ss.<key>` param presets it, so both weeks are open with no click
// and no half-finished accordion animation.
const bothOpen = `ss.hawary.course.${siri3}.open=${encodeURIComponent(JSON.stringify([weeks.week1.module, weeks.week2.module]))}`

// Things every back-office frame has.
const shell = {
  sidebar: '[data-slot="sidebar-container"]',
  academy: '[data-slot="sidebar-header"]',
  user: '[data-slot="sidebar-footer"]',
  search: 'header input',
  bell: 'header button[aria-label]:last-of-type',
  navEnrollments: { text: 'Enrollments', within: '[data-slot="sidebar-content"]', closest: 'li' },
  navLpkc: { text: 'LPKC', within: '[data-slot="sidebar-content"]', closest: 'li' },
  navAppointments: { text: 'Appointments', within: '[data-slot="sidebar-content"]', closest: 'a' },
}

const dashboardTags = {
  ...shell,
  title: 'h1',
  subtitle: 'h1 + p',
  addStudent: { text: 'Add student', closest: 'button' },
  newInvoice: { text: 'New invoice', closest: 'button' },
  tileOverdue: { text: 'Overdue', within: 'main', closest: CARD },
  tileNoCourse: { text: 'No course yet', within: 'main', closest: CARD },
  tileInvites: { text: 'Invites pending', within: 'main', closest: CARD },
  tileNotLive: { text: 'Not live yet', within: 'main', closest: CARD },
  statStudents: { text: '803 active', within: 'main', closest: CARD },
  statEnrollments: { text: 'Active enrollments', within: 'main', closest: CARD },
  statPublished: { text: 'Published courses', within: 'main', closest: CARD },
  statCollected: { text: 'Collected this month', within: 'main', closest: CARD },
  revenueCard: { text: 'Collected · 6 months', within: 'main', closest: CARD },
  revenueCollected: { text: 'RM 1,184,500.00', within: 'main' },
  revenueInvoiced: { text: 'RM 1,432,800.00', within: 'main' },
  chart: '.recharts-wrapper',
}

const courseTags = {
  ...shell,
  back: { text: 'Courses', within: 'main', closest: 'a' },
  title: 'h1',
  status: { text: 'Published', within: 'main' },
  meta: { text: 'DKM-PRA-S3/26', within: 'main' },
  newModule: { text: 'New module', closest: 'button' },
  modules: '[data-slot="accordion"]',
  week1: { text: 'Perkembangan kanak-kanak dan keselamatan di TASKA', closest: '[data-slot="accordion-item"]' },
  week2: { text: 'Pemakanan, kesihatan dan pembelajaran melalui bermain', closest: '[data-slot="accordion-item"]' },
  note1: { text: 'Perkembangan Kanak-Kanak 0–4 Tahun', closest: 'li' },
  note2: { text: 'Keselamatan & Kesihatan di TASKA', closest: 'li' },
  material1: { text: 'Slaid Kuliah Week 1', closest: 'li' },
  quiz1: { text: 'Kuiz 1: Perkembangan Fizikal', closest: 'li' },
  tugasan1: { text: 'Tugasan 1: Rancangan Aktiviti Harian', closest: 'li' },
  publishSwitch: 'main [data-slot="switch"]',
}

export default [
  {
    id: 'dashboard',
    url: '/',
    viewport: VP,
    // The revenue chart is a lazy chunk and its bars animate in.
    waitFor: '.recharts-wrapper',
    settle: 2400,
    tag: dashboardTags,
  },
  {
    id: 'dashboard-full',
    url: '/',
    viewport: VP,
    fullPage: true,
    waitFor: '.recharts-wrapper',
    settle: 2400,
    tag: {
      ...dashboardTags,
      followUp: { text: 'People to follow up', within: 'main', closest: CARD },
      // innerText follows CSS text-transform, so an uppercase heading is matched in uppercase.
      invitations: { text: 'PENDING INVITATIONS', within: 'main', closest: 'div' },
      readiness: { text: 'Course readiness', within: 'main', closest: CARD },
      readinessSiri3: { text: 'DKM Prasekolah Siri 3/2026', within: 'main', closest: 'li' },
      recentPayments: { text: 'FPX', within: 'main', closest: CARD },
      firstPayment: { text: 'FPX', within: 'main', closest: 'li' },
    },
  },
  {
    id: 'courses',
    url: '/courses',
    viewport: VP,
    waitFor: CARD,
    tag: {
      ...shell,
      title: 'h1',
      subtitle: 'h1 + p',
      newCourse: { text: 'New course', closest: 'button' },
      siri3: { text: 'DKM Prasekolah Siri 3/2026', closest: CARD },
      siri2: { text: 'DKM Prasekolah Siri 2/2026', closest: CARD },
      siri1: { text: 'DKM Prasekolah Siri 1/2026', closest: CARD },
      siri3Title: { text: 'DKM Prasekolah Siri 3/2026' },
      siri3Students: { text: '178', closest: 'div' },
      siri3Status: { text: 'Published', within: 'main' },
    },
  },
  {
    id: 'course',
    url: `/courses/${siri3}?${bothOpen}`,
    viewport: VP,
    waitFor: '[data-slot="accordion-item"]',
    tag: courseTags,
  },
  {
    id: 'course-full',
    url: `/courses/${siri3}?${bothOpen}`,
    viewport: VP,
    fullPage: true,
    waitFor: '[data-slot="accordion-item"]',
    tag: {
      ...courseTags,
      note3: { text: 'Pemakanan Seimbang untuk Kanak-Kanak', closest: 'li' },
      note4: { text: 'Bermain Sambil Belajar', closest: 'li' },
      quiz2: { text: 'Kuiz 2: Pemakanan & Kesihatan', closest: 'li' },
      draftItem: { text: 'Tugasan 2: Pemerhatian Kanak-Kanak', closest: 'li' },
      draftSwitch: { text: 'Draft', within: 'main' },
    },
  },
  // The same page in a window as tall as its content: the fixed sidebar runs
  // the whole height instead of stopping at 900px as it does in a fullPage capture.
  {
    id: 'course-tall',
    url: `/courses/${siri3}?${bothOpen}`,
    viewport: { w: 1440, h: 1325, dpr: 2 },
    waitFor: '[data-slot="accordion-item"]',
    tag: courseTags,
  },
]
