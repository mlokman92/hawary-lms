// Money, the learner, and the public pay page.
//
//   node tools/capture/web/run.mjs tools/capture/web/shots.money.mjs --port 5322 --serve          (from video/)
//   node tools/capture/web/run.mjs tools/capture/web/shots.money.mjs invoice --port 5322 --serve   one shot by id
//
// Every shot loads the `money` partition (fake/db/money.ts) on top of base.
// The clock (`now`) is part of the story — see the header of that file:
//
//   2026-10-06T16:21   in the middle of Kuiz 1          2026-10-07T09:10  LPKC not sent yet
//   2026-10-06T20:12   session not booked yet           2026-10-07T09:30  Hawary AI: 3 points to fix
//   default (7 Oct 11:55)  the state every list shows   2026-10-07T12:22  the balance is paid by FPX
//
// "-full" shots are the same page in a window as tall as its content, so the
// fixed sidebar runs the whole height (a fullPage capture cuts it at 900 px).
// The height is read from the JSON the plain shot wrote, so shoot `invoice`
// before `invoice-full` (running the whole file does that).

import path from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { ID, uid } from '../fake/ids.js'

const here = path.dirname(fileURLToPath(import.meta.url))

export const outDir = path.resolve(here, '../../../public/shots/web')
export const defaults = { as: 'director', lang: 'en', theme: 'light', db: 'money' }

const VP = { w: 1440, h: 900, dpr: 2 }
const MACRO = { w: 1440, h: 900, dpr: 4 }
const PHONE = { w: 430, h: 900, dpr: 3 }
const CARD = '[data-slot="card"]'

const siri3 = ID.course.siri3
const TOKEN = 'hawary-demo-pay-0412'
const SEPT = uid('incentive-batch', '2026-09')
const OCT = uid('incentive-batch', '2026-10')
const note1 = ID.content.siri3.week1.notes[0]
const kuiz1 = ID.content.siri3.week1.assessment
const heroInvoice = ID.hero.invoice
const heroReport = ID.hero.report

/** A window as tall as the page was the last time `id` was shot (see the header). */
function tall(id, fallback) {
  const file = path.join(outDir, `${id}.json`)
  let h = fallback
  if (existsSync(file)) {
    try {
      h = Math.max(900, Math.ceil(JSON.parse(readFileSync(file, 'utf8')).pageH ?? fallback))
    } catch {
      h = fallback
    }
  }
  return { w: 1440, h, dpr: 2 }
}

// --- things every frame of a shell has --------------------------------------
const shell = {
  sidebar: '[data-slot="sidebar-container"]',
  academy: '[data-slot="sidebar-header"]',
  user: '[data-slot="sidebar-footer"]',
  bell: 'header button[aria-label]:last-of-type',
}
const staff = {
  ...shell,
  search: 'header input',
  navPayments: { text: 'Payments', within: '[data-slot="sidebar-content"]', closest: 'a' },
  navPaymentLog: { text: 'Payment log', within: '[data-slot="sidebar-content"]', closest: 'a' },
  navPaymentReport: { text: 'Payment report', within: '[data-slot="sidebar-content"]', closest: 'a' },
  navIncentive: { text: 'Incentive', within: '[data-slot="sidebar-content"]', closest: 'a' },
}
const learner = {
  ...shell,
  navDashboard: { text: 'Dashboard', within: '[data-slot="sidebar-content"]', closest: 'a' },
  navCourses: { text: 'My courses', within: '[data-slot="sidebar-content"]', closest: 'a' },
  navWork: { text: 'My work', within: '[data-slot="sidebar-content"]', closest: 'a' },
  navAppointments: { text: 'Appointments', within: '[data-slot="sidebar-content"]', closest: 'a' },
  navLpkc: { text: 'LPKC', within: '[data-slot="sidebar-content"]', closest: 'a' },
  navBilling: { text: 'Billing', within: '[data-slot="sidebar-content"]', closest: 'a' },
}
/** The Summary card of an invoice page: Subtotal, Tax / SST, Total, (rule), Paid, Balance. */
const SUM = 'main .md\\:grid-cols-3 > :nth-child(2) [data-slot="card-content"]'
const summaryRows = {
  subtotal: `${SUM} > div:nth-child(1)`,
  tax: `${SUM} > div:nth-child(2)`,
  total: `${SUM} > div:nth-child(3)`,
  paid: `${SUM} > div:nth-child(5)`,
  balance: `${SUM} > div:nth-child(6)`,
  totalValue: `${SUM} > div:nth-child(3) > span:last-child`,
  paidValue: `${SUM} > div:nth-child(5) > span:last-child`,
  balanceValue: `${SUM} > div:nth-child(6) > span:last-child`,
}
const row = (n) => `main tbody tr:nth-child(${n})`
const rows = (count, prefix = 'row') => Object.fromEntries(Array.from({ length: count }, (_x, i) => [`${prefix}${i + 1}`, row(i + 1)]))

// --- /payments ---------------------------------------------------------------
const tilesGrid = 'main .grid.lg\\:grid-cols-4'
const paymentsTags = {
  ...staff,
  title: 'h1',
  subtitle: 'h1 + p',
  newInvoice: { text: 'New invoice', closest: 'button' },
  courseFilter: 'main [data-slot="select-trigger"]',
  tiles: tilesGrid,
  tileInvoiced: { text: 'Total invoiced', closest: 'button' },
  tileCollected: { text: 'Collected', within: 'main', closest: 'button' },
  tileOutstanding: { text: 'Outstanding', within: 'main', closest: 'button' },
  tileOverdue: { text: 'Overdue', within: 'main', closest: 'button' },
  invoiced: { text: 'RM 1,432,800.00', within: 'main' },
  collected: { text: 'RM 1,184,500.00', within: 'main' },
  outstanding: { text: 'RM 248,300.00', within: 'main' },
  overdue: { text: 'RM 19,600.00', within: 'main' },
  recordsHeading: { text: 'Payment records', within: 'main' },
  table: 'main table',
  tableHead: 'main thead tr',
  heroRow: { text: 'INV-2026-0412', closest: 'tr' },
  heroInvoiceNo: { text: 'INV-2026-0412', within: 'main' },
  heroStudent: { text: 'Nur Aisyah Razak', within: 'main' },
  heroPaid: { text: 'RM 900.00', within: 'main' },
  heroStatus: { text: 'Partially paid', within: 'main' },
  firstPaidStatus: `${row(3)} [data-slot="badge"]`,
  ...rows(8),
}

// --- /payments/:id -----------------------------------------------------------
const invoiceTags = {
  ...staff,
  back: { text: 'Payments', within: 'main', closest: 'a' },
  headerCard: { text: 'INV-2026-0412', within: 'main', closest: CARD },
  invoiceNo: 'main h1',
  status: { text: 'Partially paid', within: 'main' },
  student: { text: 'Nur Aisyah Razak · HA-2026-0318', within: 'main' },
  course: { text: 'Course · DKM Prasekolah Siri 3/2026', within: 'main' },
  dates: { text: 'Issued 17 Jul 2026', within: 'main' },
  recordPayment: { text: 'Record payment', closest: 'button' },
  void: { text: 'Void', within: 'main', closest: 'button' },
  more: 'main [data-slot="dropdown-menu-trigger"]',
  itemsCard: { text: 'Items', within: 'main', closest: CARD },
  itemRow: { text: 'Yuran DKM Prasekolah Siri 3/2026', closest: 'tr' },
  summaryCard: { text: 'Summary', within: 'main', closest: CARD },
  ...summaryRows,
  paymentsCard: { text: 'All payments', within: 'main', closest: CARD },
  paymentRow: { text: 'Maybank2u', closest: 'li' },
  paymentDate: { text: '18 Sept 2026', within: 'main' },
  allPayments: { text: 'All payments', within: 'main', closest: 'a' },
}
const payLinkTags = {
  payLinkCard: { text: 'Online payment', within: 'main', closest: CARD },
  partPayment: { text: 'Allow part payment', within: 'main', closest: '.rounded-lg' },
  partSwitch: '#allow-partial',
  minimum: '#min-partial',
  payLink: { text: '/pay/hawary-demo-pay-0412', within: 'main' },
  emailLink: { text: 'Email', within: 'main', closest: 'button' },
}

// --- the learner's invoice ---------------------------------------------------
const learnInvoiceTags = {
  ...learner,
  back: { text: 'Billing', within: 'main', closest: 'a' },
  headerCard: { text: 'INV-2026-0412', within: 'main', closest: CARD },
  invoiceNo: 'main h1',
  course: { text: 'Course · DKM Prasekolah Siri 3/2026', within: 'main' },
  payOnline: { text: 'Pay online', closest: 'a' },
  downloadInvoice: { text: 'Download invoice', closest: 'button' },
  itemsCard: { text: 'Items', within: 'main', closest: CARD },
  itemRow: { text: 'Yuran DKM Prasekolah Siri 3/2026', closest: 'tr' },
  summaryCard: { text: 'Summary', within: 'main', closest: CARD },
  ...summaryRows,
  paymentsCard: { text: 'Payments', within: 'main', closest: CARD },
  paymentRow: { text: '18 Sept 2026', closest: 'li' },
}

// --- the public pay page -----------------------------------------------------
const payTags = {
  academyName: { text: 'Hawary Academy' },
  card: CARD,
  invoiceNo: { text: 'Invoice INV-2026-0412' },
  amountBox: { text: 'Amount due', closest: '.rounded-lg' },
  amountLabel: { text: 'Amount due' },
  amount: '.text-3xl',
  paidSoFar: { text: 'RM 900.00 of RM 1,800.00 paid' },
  payInFull: { text: 'Pay in full', closest: 'button' },
  payPart: { text: 'Pay part of it', closest: 'button' },
  payButton: { text: 'with FPX', closest: 'button' },
  secured: { text: 'Secured by ToyyibPay', closest: 'p' },
}

// --- assessments -------------------------------------------------------------
const Q = (n) => `main .space-y-4 > ${CARD}:nth-child(${n})`
const attemptTags = {
  ...learner,
  back: { text: 'Course', within: 'main', closest: 'a' },
  title: 'main h1',
  meta: 'main h1 + p',
  instructions: { text: 'Instructions', within: 'main', closest: CARD },
  q1: Q(1),
  q2: Q(2),
  q1Prompt: { text: 'Pada usia berapakah kebanyakan bayi mula duduk tanpa sokongan?', within: 'main' },
  q1Answer: { text: '6–8 bulan', within: 'main', closest: 'div' },
  q2Prompt: { text: 'Kemahiran motor kasar merujuk kepada', within: 'main' },
  q2Answer: { text: 'pergerakan otot besar seperti berjalan dan melompat', within: 'main', closest: 'div' },
  q2Radio: `${Q(2)} [role="radio"][data-state="checked"]`,
}

// --- appointments ------------------------------------------------------------
const bookingTags = {
  ...learner,
  title: 'main h1',
  bookCard: { text: 'Book a session', within: 'main', closest: CARD },
  dayStrip: 'main .snap-x',
  dayTue13: { text: 'Tue, 13 Oct', within: 'main', closest: 'button' },
  dayMon12: { text: 'Mon, 12 Oct', within: 'main', closest: 'button' },
  dayWed14: { text: 'Wed, 14 Oct', within: 'main', closest: 'button' },
  timesAvailable: { text: 'times available', within: 'main' },
  timeGrid: 'main .grid.grid-cols-3',
  slot0900: { text: '09:00', within: 'main', closest: 'button' },
  slot1000: { text: '10:00', within: 'main', closest: 'button' },
  slot1100: { text: '11:00', within: 'main', closest: 'button' },
  slot1400: { text: '14:00', within: 'main', closest: 'button' },
  book: 'main [data-slot="card-content"] > div:last-child > button',
  sessionsCard: { text: 'My sessions', within: 'main', closest: CARD },
}

// --- LPKC, the learner's side ------------------------------------------------
const threadTags = {
  ...learner,
  back: { text: 'My reports', within: 'main', closest: 'a' },
  title: 'main h1',
  status: 'main h1 + [data-slot="badge"]',
  meta: { text: 'Checked by Siti Hajar Ismail', within: 'main' },
  resubmit: { text: 'Send a new version', within: 'main', closest: 'button' },
  thread: `main ${CARD}`,
  timeline: 'main ol',
  upload: 'main ol > li:nth-child(1)',
  uploadHeadline: { text: 'Nur Aisyah Razak sent this for checking', within: 'main' },
  filePdf: { text: 'LPKC_Nur_Aisyah_v1.pdf', within: 'main', closest: '.rounded-md' },
  filePptx: { text: 'Slide_Pembentangan.pptx', within: 'main', closest: '.rounded-md' },
  ai: 'main ol > li:nth-child(2)',
  aiIcon: 'main ol > li:nth-child(2) > span',
  aiHeadline: { text: 'Hawary AI updated the status', within: 'main' },
  aiBadge: 'main ol > li:nth-child(2) [data-slot="badge"]',
  aiBody: 'main ol > li:nth-child(2) p',
  aiTime: 'main ol > li:nth-child(2) .tabular-nums',
  reply: 'main textarea',
  attach: { text: 'Attach files', within: 'main', closest: 'button' },
  send: { text: 'Send', within: 'main', closest: 'button', nth: 1 },
}

const pickFiles = `(() => {
  const input = document.querySelector('[role="dialog"] input[type="file"]')
  const dt = new DataTransfer()
  dt.items.add(new File([new Uint8Array(2516582)], 'LPKC_Nur_Aisyah_v1.pdf', { type: 'application/pdf' }))
  dt.items.add(new File([new Uint8Array(5872025)], 'Slide_Pembentangan.pptx', { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }))
  input.files = dt.files
  input.dispatchEvent(new Event('change', { bubbles: true }))
})()`

const toTop = { eval: 'window.scrollTo(0, 0); document.querySelectorAll("*").forEach((e) => { if (e.scrollTop) e.scrollTop = 0 })' }
const blur = { eval: 'document.activeElement && document.activeElement.blur && document.activeElement.blur()' }

/**
 * Scroll the page WITHOUT moving the window. shoot.mjs records rects as
 * document coordinates (rect + window.scrollY), but a plain shot is a picture
 * of the viewport — on a scrolled window every tag would be off by scrollY.
 * Making <body> the scroller keeps window.scrollY at 0 and looks the same.
 */
const scrollPage = (to) => ({
  eval: `(() => { const h = document.documentElement, b = document.body; h.style.height = '100%'; h.style.overflow = 'hidden'; b.style.height = '100%'; b.style.overflowY = 'auto'; b.scrollTop = ${to === 'end' ? 'b.scrollHeight' : Number(to)} })()`,
})

/** Park the pointer where it lights nothing up (a row under the cursor would be drawn hovered). */
const mouseAway = { hover: { sel: 'main h1' } }
// The pay link is built from window.location.origin, which on the set is the
// harness (http://127.0.0.1:<port>). Print what production prints instead.
const productionOrigin = {
  eval: `document.querySelectorAll('main code').forEach((c) => { if (c.textContent.includes('/pay/')) { c.textContent = c.textContent.replace(/^https?:\\/\\/[^/]+/, 'https://app.hawary.my'); c.title = c.textContent } })`,
}

const pickQ2 = [{ click: { text: 'pergerakan otot besar seperti berjalan dan melompat', exact: true } }, { wait: 250 }, blur, toTop, mouseAway, { wait: 250 }]
const pickQ6 = [{ click: { text: 'Berlari dan memanjat di taman permainan', exact: true } }, { wait: 250 }, blur, toTop, mouseAway, { wait: 250 }]
const pickDay = [{ click: { text: 'Tue, 13 Oct' } }, { wait: 250 }, mouseAway, { wait: 150 }]
const pickSlot = [
  ...pickDay,
  { click: { text: '10:00' } },
  { wait: 250 },
  { click: { sel: '#learn-instructor' } },
  { wait: 350 },
  { click: { sel: '[role="option"]', nth: 3 } },
  { wait: 350 },
  { type: { sel: '#learn-note', text: 'Bincang pembentangan akhir' } },
  blur,
  toTop,
  mouseAway,
  { wait: 250 },
]

export default [
  // ===========================================================================
  // As the Director — money in
  // ===========================================================================
  { id: 'payments', url: '/payments', viewport: VP, waitFor: 'main table', tag: paymentsTags },
  // the whole first page of the invoice book (50 rows), for a scroll
  { id: 'payments-full', url: '/payments', viewport: tall('payments', 3700), waitFor: 'main table', tag: { ...paymentsTags, ...rows(50), pager: 'main .mt-4.flex.justify-end' } },
  {
    id: 'macro-payment-tiles',
    url: '/payments',
    viewport: MACRO,
    waitFor: 'main table',
    clip: { sel: tilesGrid, pad: 16 },
    tag: {
      tileInvoiced: { text: 'Total invoiced', closest: 'button' },
      tileCollected: { text: 'Collected', within: 'main', closest: 'button' },
      tileOutstanding: { text: 'Outstanding', within: 'main', closest: 'button' },
      tileOverdue: { text: 'Overdue', within: 'main', closest: 'button' },
      invoiced: { text: 'RM 1,432,800.00', within: 'main' },
      collected: { text: 'RM 1,184,500.00', within: 'main' },
      outstanding: { text: 'RM 248,300.00', within: 'main' },
      overdue: { text: 'RM 19,600.00', within: 'main' },
    },
  },
  {
    id: 'macro-payment-hero-row',
    url: '/payments',
    viewport: MACRO,
    waitFor: 'main table',
    clip: { sel: { text: 'INV-2026-0412', closest: 'tr' }, pad: 2 },
    tag: {
      invoiceNo: { text: 'INV-2026-0412', within: 'main' },
      student: { text: 'Nur Aisyah Razak', within: 'main' },
      paid: { text: 'RM 900.00', within: 'main' },
      status: { text: 'Partially paid', within: 'main' },
    },
  },

  { id: 'invoice', url: `/payments/${heroInvoice}`, viewport: VP, waitFor: CARD, tag: invoiceTags },
  { id: 'invoice-full', url: `/payments/${heroInvoice}`, viewport: tall('invoice', 1500), waitFor: CARD, steps: [productionOrigin, { wait: 100 }], tag: { ...invoiceTags, ...payLinkTags } },
  {
    id: 'macro-invoice-totals',
    url: `/payments/${heroInvoice}`,
    viewport: MACRO,
    waitFor: CARD,
    clip: { sel: { text: 'Summary', within: 'main', closest: CARD }, pad: 16 },
    tag: {
      heading: { text: 'Summary', within: 'main' },
      ...summaryRows,
    },
  },

  {
    id: 'payment-log',
    url: '/payments/log',
    viewport: VP,
    waitFor: 'main table',
    tag: {
      ...staff,
      back: { text: 'Payments', within: 'main', closest: 'a' },
      title: 'main h1',
      subtitle: 'main h1 + p',
      exportCsv: { text: 'Export CSV', closest: 'button' },
      searchBox: 'main input[placeholder*="reference"]',
      summary: { text: '883 payments', within: 'main' },
      table: 'main table',
      tableHead: 'main thead tr',
      firstMethod: `${row(1)} td:nth-child(4)`,
      firstGateway: { text: 'ToyyibPay · ', within: 'main' },
      firstAmount: `${row(1)} td:nth-child(6)`,
      ...rows(10),
    },
  },

  // --- the report, and its drill: month -> course -> student -> the payment ----
  {
    id: 'payment-report',
    url: '/payments/report',
    viewport: VP,
    waitFor: 'main table',
    tag: {
      ...staff,
      title: 'main h1',
      subtitle: 'main h1 + p',
      exportCsv: { text: 'Export CSV', closest: 'button' },
      view: 'main [data-slot="select-trigger"]',
      summary: { text: '883 payments', within: 'main' },
      trail: 'main nav',
      table: 'main table',
      october: { text: 'October 2026', closest: 'tr' },
      september: { text: 'September 2026', closest: 'tr' },
      august: { text: 'August 2026', closest: 'tr' },
      july: { text: 'July 2026', closest: 'tr' },
      june: { text: 'June 2026', closest: 'tr' },
      may: { text: 'May 2026', closest: 'tr' },
      septemberAmount: { text: 'RM 117,500.00', within: 'main table' },
    },
  },
  {
    id: 'payment-report-courses',
    url: '/payments/report?m=2026-09',
    viewport: VP,
    waitFor: 'main table',
    tag: {
      ...staff,
      title: 'main h1',
      summary: { text: '99 payments', within: 'main' },
      trail: 'main nav',
      crumbAll: { text: 'All payments', within: 'main nav' },
      crumbMonth: { text: 'September 2026', within: 'main nav' },
      table: 'main table',
      siri2: { text: 'DKM Prasekolah Siri 2/2026', closest: 'tr' },
      siri3: { text: 'DKM Prasekolah Siri 3/2026', closest: 'tr' },
      siri1: { text: 'DKM Prasekolah Siri 1/2026', closest: 'tr' },
      siri3Amount: { text: 'RM 56,900.00', within: 'main' },
    },
  },
  {
    id: 'payment-report-students',
    url: `/payments/report?m=2026-09&c=${siri3}`,
    viewport: VP,
    waitFor: 'main table',
    tag: {
      ...staff,
      title: 'main h1',
      summary: { text: '38 payments', within: 'main' },
      trail: 'main nav',
      crumbCourse: { text: 'DKM Prasekolah Siri 3/2026', within: 'main nav' },
      table: 'main table',
      ...rows(9),
    },
  },
  {
    id: 'payment-report-leaf',
    url: `/payments/report?m=2026-09&c=${siri3}&s=${ID.hero.student}`,
    viewport: VP,
    waitFor: 'main table',
    tag: {
      ...staff,
      title: 'main h1',
      summary: { text: '1 payment', within: 'main' },
      trail: 'main nav',
      crumbStudent: { text: 'Nur Aisyah Razak', within: 'main nav' },
      table: 'main table',
      payment: row(1),
      invoiceNo: { text: 'INV-2026-0412', within: 'main' },
      amount: { text: 'RM 900.00', within: 'main table' },
    },
  },
  {
    id: 'payment-report-outstanding',
    url: '/payments/report?view=outstanding',
    viewport: VP,
    waitFor: 'main table',
    tag: {
      ...staff,
      title: 'main h1',
      subtitle: 'main h1 + p',
      view: 'main [data-slot="select-trigger"]',
      summary: { text: 'RM 248,300.00', within: 'main' },
      trail: 'main nav',
      table: 'main table',
      firstOwing: `${row(1)} [data-slot="badge"]`,
      ...rows(6),
    },
  },
  {
    id: 'payment-report-outstanding-students',
    url: `/payments/report?view=outstanding&m=2026-07&c=${siri3}`,
    viewport: VP,
    waitFor: 'main table',
    tag: {
      ...staff,
      title: 'main h1',
      trail: 'main nav',
      table: 'main table',
      hero: { text: 'Nur Aisyah Razak', closest: 'tr' },
      heroOwing: { text: 'RM 900.00', within: 'main table' },
      ...rows(9),
    },
  },

  {
    id: 'course-billing',
    url: `/courses/${siri3}/billing`,
    viewport: VP,
    waitFor: 'main table',
    tag: {
      ...staff,
      back: { text: 'DKM Prasekolah Siri 3/2026', within: 'main', closest: 'a' },
      title: 'main h1',
      subtitle: 'main h1 + p',
      invoiceUnbilled: { text: 'Invoice 5 students', closest: 'button' },
      exportCsv: { text: 'Export CSV', closest: 'button' },
      tiles: tilesGrid,
      tileNever: { text: 'Never invoiced', within: 'main', closest: 'button' },
      tileNothing: { text: 'Nothing paid', within: 'main', closest: 'button' },
      tilePart: { text: 'Part paid', within: 'main', closest: 'button' },
      tilePaid: { text: 'Paid', within: tilesGrid, closest: 'button' },
      summary: { text: '178 enrolled', within: 'main' },
      searchBox: 'main input[placeholder*="number or email"]',
      table: 'main table',
      firstNever: `${row(1)} [data-slot="badge"]`,
      firstUnpaid: `${row(6)} [data-slot="badge"]`,
      ...rows(8),
    },
  },
  {
    id: 'macro-course-billing-tiles',
    url: `/courses/${siri3}/billing`,
    viewport: MACRO,
    waitFor: 'main table',
    clip: { sel: tilesGrid, pad: 16 },
    tag: {
      tileNever: { text: 'Never invoiced', within: 'main', closest: 'button' },
      tileNothing: { text: 'Nothing paid', within: 'main', closest: 'button' },
      tilePart: { text: 'Part paid', within: 'main', closest: 'button' },
    },
  },

  // ===========================================================================
  // As the Director — money out (Billplz)
  // ===========================================================================
  {
    id: 'incentives',
    url: '/incentives',
    viewport: VP,
    waitFor: 'main table',
    tag: {
      ...staff,
      title: 'main h1',
      subtitle: 'main h1 + p',
      newIncentive: { text: 'New incentive', closest: 'button' },
      table: 'main table',
      tableHead: 'main thead tr',
      october: { text: 'October 2026', closest: 'tr' },
      september: { text: 'September 2026', closest: 'tr' },
      septemberTitle: { text: 'September 2026', within: 'main' },
      septemberPerStudent: `${row(2)} td:nth-child(2)`,
      septemberRecipients: `${row(2)} td:nth-child(3)`,
      septemberTotal: { text: 'RM 8,000.00', within: 'main' },
      septemberStatus: `${row(2)} [data-slot="badge"]`,
      draftStatus: `${row(1)} [data-slot="badge"]`,
      ...rows(6),
    },
  },
  {
    id: 'macro-incentive-row',
    url: '/incentives',
    viewport: MACRO,
    waitFor: 'main table',
    clip: { sel: { text: 'September 2026', closest: 'tr' }, pad: 2 },
    tag: {
      title: { text: 'September 2026', within: 'main' },
      total: { text: 'RM 8,000.00', within: 'main' },
      status: `${row(2)} [data-slot="badge"]`,
    },
  },
  {
    id: 'incentive-batch',
    url: `/incentives/${SEPT}`,
    viewport: VP,
    waitFor: 'main table',
    tag: {
      ...staff,
      back: { text: 'Incentive', within: 'main', closest: 'a' },
      title: 'main h1',
      perStudent: { text: 'RM 500.00 per student', within: 'main' },
      refresh: { text: 'Refresh status', closest: 'button' },
      table: 'main table',
      tableHead: 'main thead tr',
      hero: { text: 'Nur Aisyah Razak', closest: 'tr' },
      heroAccount: `${row(1)} td:nth-child(2)`,
      heroAmount: `${row(1)} td:nth-child(3)`,
      heroStatus: `${row(1)} [data-slot="badge"]`,
      ...rows(9),
    },
  },
  {
    id: 'incentive-batch-full',
    url: `/incentives/${SEPT}`,
    viewport: tall('incentive-batch', 1750),
    waitFor: 'main table',
    tag: {
      ...staff,
      title: 'main h1',
      perStudent: { text: 'RM 500.00 per student', within: 'main' },
      refresh: { text: 'Refresh status', closest: 'button' },
      table: 'main table',
      hero: { text: 'Nur Aisyah Razak', closest: 'tr' },
      heroStatus: `${row(1)} [data-slot="badge"]`,
      inFlight: { text: 'Mohd Irfan Hakim Salleh', closest: 'tr' },
      inFlightStatus: `${row(16)} [data-slot="badge"]`,
      ...rows(16),
    },
  },
  {
    // A draft batch is a list being built: six students ticked, then Send.
    id: 'incentive-draft',
    url: `/incentives/${OCT}`,
    viewport: VP,
    waitFor: 'main table',
    steps: [0, 1, 2, 4, 5, 7].flatMap((n) => [{ click: { sel: 'main tbody tr td:nth-child(2)', nth: n } }, { wait: 80 }]).concat([toTop, mouseAway, { wait: 250 }]),
    tag: {
      ...staff,
      title: 'main h1',
      perStudent: { text: 'RM 500.00 per student', within: 'main' },
      searchBox: 'main input[placeholder*="student number"]',
      courseFilter: 'main [data-slot="select-trigger"]',
      table: 'main table',
      selectAll: 'main thead [role="checkbox"]',
      firstChecked: `${row(1)} [role="checkbox"]`,
      firstBank: `${row(1)} td:nth-child(3)`,
      footer: 'main .sticky.bottom-0',
      count: { text: '6 recipients', within: 'main' },
      send: { text: 'Send transfers', closest: 'button' },
      ...rows(8),
    },
  },
  {
    id: 'incentive-send-confirm',
    url: `/incentives/${OCT}`,
    viewport: VP,
    waitFor: 'main table',
    steps: [0, 1, 2, 4, 5, 7]
      .flatMap((n) => [{ click: { sel: 'main tbody tr td:nth-child(2)', nth: n } }, { wait: 80 }])
      .concat([toTop, { wait: 200 }, { eval: `[...document.querySelectorAll('main button')].find((b) => b.textContent.trim() === 'Send transfers').click()` }, { wait: 500 }]),
    tag: {
      dialog: '[role="alertdialog"]',
      dialogTitle: '[role="alertdialog"] h2',
      dialogBody: '[role="alertdialog"] p',
      confirm: { text: 'Send transfers', within: '[role="alertdialog"]', closest: 'button' },
      cancel: { text: 'Cancel', within: '[role="alertdialog"]', closest: 'button' },
    },
  },

  // --- /settings: the Director's gateways ---------------------------------------
  {
    id: 'settings',
    url: '/settings',
    viewport: VP,
    waitFor: 'main img',
    tag: {
      ...staff,
      title: 'main h1',
      academyCard: { text: 'Academy details', within: 'main', closest: CARD },
      logo: 'main img',
      name: `main ${CARD} input`,
      toyyibpayCard: { text: 'Online payments · ToyyibPay', within: 'main', closest: CARD },
    },
  },
  {
    // the foot of the page: both gateways whole — ToyyibPay (money in) over Billplz (money out)
    id: 'settings-gateways',
    url: '/settings',
    viewport: VP,
    waitFor: 'main img',
    steps: [scrollPage('end'), { wait: 300 }],
    tag: {
      ...staff,
      toyyibpayCard: { text: 'Online payments · ToyyibPay', within: 'main', closest: CARD },
      toyyibpayTitle: { text: 'Online payments · ToyyibPay', within: 'main' },
      toyyibpayConnected: { text: 'Key connected', within: 'main', closest: '.rounded-lg' },
      toyyibpayLive: { text: 'Live', within: 'main' },
      toyyibpayKey: { text: 'Secret ••••demo', within: 'main', nth: 0 },
      acceptOnline: { text: 'Accept online payments', within: 'main', closest: '.rounded-lg' },
      acceptSwitch: 'main [role="switch"]',
      chargeToPayor: { text: 'Payor pays the ToyyibPay charge', within: 'main', closest: '.rounded-lg' },
      partPayment: { text: 'Allow part payment by default', within: 'main', closest: '.rounded-lg' },
      billplzCard: { text: 'Student transfers · Billplz', within: 'main', closest: CARD },
      billplzTitle: { text: 'Student transfers · Billplz', within: 'main' },
      billplzConnected: { text: 'Keys connected', within: 'main', closest: '.rounded-lg' },
      billplzKey: { text: 'Secret ••••demo', within: 'main', nth: 1 },
    },
  },
  {
    id: 'macro-toyyibpay',
    url: '/settings',
    viewport: MACRO,
    waitFor: 'main img',
    clip: { sel: { text: 'Online payments · ToyyibPay', within: 'main', closest: CARD }, pad: 16 },
    tag: {
      title: { text: 'Online payments · ToyyibPay', within: 'main' },
      connected: { text: 'Key connected', within: 'main', closest: '.rounded-lg' },
      key: { text: 'Secret ••••demo', within: 'main', nth: 0 },
      acceptOnline: { text: 'Accept online payments', within: 'main', closest: '.rounded-lg' },
      partPayment: { text: 'Allow part payment by default', within: 'main', closest: '.rounded-lg' },
    },
  },
  {
    id: 'macro-billplz',
    url: '/settings',
    viewport: MACRO,
    waitFor: 'main img',
    clip: { sel: { text: 'Student transfers · Billplz', within: 'main', closest: CARD }, pad: 16 },
    tag: {
      title: { text: 'Student transfers · Billplz', within: 'main' },
      connected: { text: 'Keys connected', within: 'main', closest: '.rounded-lg' },
      key: { text: 'Secret ••••demo', within: 'main', nth: 1 },
    },
  },
  {
    id: 'settings-full',
    url: '/settings',
    viewport: tall('settings', 2300),
    waitFor: 'main img',
    tag: {
      ...staff,
      title: 'main h1',
      academyCard: { text: 'Academy details', within: 'main', closest: CARD },
      logo: 'main img',
      toyyibpayCard: { text: 'Online payments · ToyyibPay', within: 'main', closest: CARD },
      toyyibpayConnected: { text: 'Key connected', within: 'main', closest: '.rounded-lg' },
      toyyibpayKey: { text: 'Secret ••••demo', within: 'main', nth: 0 },
      acceptOnline: { text: 'Accept online payments', within: 'main', closest: '.rounded-lg' },
      billplzCard: { text: 'Student transfers · Billplz', within: 'main', closest: CARD },
      billplzConnected: { text: 'Keys connected', within: 'main', closest: '.rounded-lg' },
      billplzKey: { text: 'Secret ••••demo', within: 'main', nth: 1 },
    },
  },

  // ===========================================================================
  // Signed out — the public pay page
  // ===========================================================================
  { id: 'pay-public', url: `/pay/${TOKEN}`, as: 'anon', viewport: VP, waitFor: CARD, tag: payTags },
  { id: 'pay-public-phone', url: `/pay/${TOKEN}`, as: 'anon', viewport: PHONE, waitFor: CARD, tag: payTags },
  {
    id: 'pay-public-part',
    url: `/pay/${TOKEN}`,
    as: 'anon',
    viewport: VP,
    waitFor: CARD,
    steps: [{ click: { text: 'Pay part of it' } }, { wait: 250 }, { eval: `(() => { const el = document.querySelector('#pay-amount'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, '450.00'); el.dispatchEvent(new Event('input', { bubbles: true })); el.blur() })()` }, { hover: { sel: '.text-lg' } }, { wait: 250 }],
    tag: { ...payTags, amountInput: '#pay-amount', remaining: '#pay-amount-hint' },
  },
  {
    id: 'macro-fpx',
    url: `/pay/${TOKEN}`,
    as: 'anon',
    viewport: MACRO,
    waitFor: CARD,
    clip: { sel: CARD, pad: 24 },
    tag: Object.fromEntries(Object.entries(payTags).filter(([k]) => k !== 'academyName')),
  },
  {
    id: 'pay-result',
    url: `/pay/${TOKEN}/result`,
    as: 'anon',
    now: '2026-10-07T12:22',
    viewport: VP,
    waitFor: 'svg.text-emerald-600',
    tag: {
      card: CARD,
      heading: { text: 'Payment', closest: '[data-slot="card-title"]' },
      check: 'svg.text-emerald-600',
      received: { text: 'Payment received' },
      body: { text: 'Thank you! Your payment has been confirmed.' },
    },
  },
  {
    id: 'pay-result-phone',
    url: `/pay/${TOKEN}/result`,
    as: 'anon',
    now: '2026-10-07T12:22',
    viewport: PHONE,
    waitFor: 'svg.text-emerald-600',
    tag: { card: CARD, check: 'svg.text-emerald-600', received: { text: 'Payment received' } },
  },

  // ===========================================================================
  // As the student — Nur Aisyah Razak
  // ===========================================================================
  {
    id: 'learn-dashboard',
    url: '/learn',
    as: 'student',
    viewport: VP,
    waitFor: 'main ul',
    tag: {
      ...learner,
      title: 'main h1',
      subtitle: 'main h1 + p',
      tiles: tilesGrid,
      tileOverdue: { text: 'Nothing late', within: 'main', closest: CARD },
      tileDue: { text: 'Due this week', within: 'main', closest: CARD },
      tileAwaiting: { text: 'Awaiting marks', within: 'main', closest: CARD },
      tileMarked: { text: '18 of 20 points', within: 'main', closest: CARD },
      marked: { text: '90%', within: 'main' },
      upNext: { text: 'Up next', within: 'main', closest: CARD },
      tugasan1: { text: 'Tugasan 1: Rancangan Aktiviti Harian', closest: 'li' },
      tugasan1State: { text: 'Started', within: 'main' },
      kuiz2: { text: 'Kuiz 2: Pemakanan & Kesihatan', closest: 'li' },
      sessions: { text: 'My sessions', within: 'main', closest: CARD },
      session: { text: 'Tue, 13 Oct, 10:00', closest: 'li' },
      sessionWith: { text: 'Siti Hajar Ismail', within: 'main' },
      reports: { text: 'Your reports', within: 'main', closest: CARD },
      report: { text: 'LPKC, slide dan portfolio', closest: 'li' },
      reportStatus: { text: 'Being checked', within: 'main' },
      marks: { text: 'Recent marks', within: 'main', closest: CARD },
      kuiz1: { text: 'Kuiz 1: Perkembangan Fizikal', closest: 'li' },
      courses: { text: 'All courses', within: 'main', closest: CARD },
      course: { text: 'DKM Prasekolah Siri 3/2026', closest: 'li' },
      progress: 'main [data-slot="progress"]',
    },
  },
  {
    // The next morning: the trainer approved the report yesterday at 12:05, and
    // Tugasan 1 is now inside its last week.
    id: 'learn-dashboard-approved',
    url: '/learn',
    as: 'student',
    now: '2026-10-08T09:00',
    viewport: VP,
    waitFor: 'main ul',
    tag: {
      ...learner,
      title: 'main h1',
      tiles: tilesGrid,
      tileDue: { text: 'Due this week', within: 'main', closest: CARD },
      tileMarked: { text: '18 of 20 points', within: 'main', closest: CARD },
      upNext: { text: 'Up next', within: 'main', closest: CARD },
      tugasan1: { text: 'Tugasan 1: Rancangan Aktiviti Harian', closest: 'li' },
      reports: { text: 'Your reports', within: 'main', closest: CARD },
      report: { text: 'LPKC, slide dan portfolio', closest: 'li' },
      reportStatus: { text: 'Approved', within: 'main' },
      sessions: { text: 'My sessions', within: 'main', closest: CARD },
      session: { text: 'Tue, 13 Oct, 10:00', closest: 'li' },
    },
  },
  {
    id: 'learn-courses',
    url: '/learn/courses',
    as: 'student',
    viewport: VP,
    waitFor: `main ${CARD}`,
    tag: {
      ...learner,
      title: 'main h1',
      subtitle: 'main h1 + p',
      course: `main ${CARD}`,
      courseTitle: 'main h2',
      code: { text: 'DKM-PRA-S3/26', within: 'main' },
      notes: { text: 'notes', within: 'main', closest: 'div' },
      tasks: { text: 'tasks done', within: 'main', closest: 'div' },
      progress: 'main [data-slot="progress"]',
      percent: { text: '33% complete', within: 'main' },
    },
  },
  {
    id: 'learn-course',
    url: `/learn/courses/${siri3}`,
    as: 'student',
    viewport: VP,
    waitFor: `main ${CARD}`,
    tag: {
      ...learner,
      back: { text: 'My courses', within: 'main', closest: 'a' },
      title: 'main h1',
      meta: 'main h1 + p',
      progress: 'main [data-slot="progress"]',
      percent: { text: '33%', within: 'main' },
      description: { text: 'Diploma Kemahiran Malaysia (DKM)', within: 'main' },
      week1: `main .space-y-4 > ${CARD}:nth-child(1)`,
      week2: `main .space-y-4 > ${CARD}:nth-child(2)`,
      week1Title: { text: 'Week 1', within: 'main' },
      week2Title: { text: 'Week 2', within: 'main' },
      note1: { text: 'Perkembangan Kanak-Kanak 0–4 Tahun', closest: 'li' },
      note2: { text: 'Keselamatan & Kesihatan di TASKA', closest: 'li' },
      material1: { text: 'Slaid Kuliah Week 1', closest: 'li' },
      quiz1: { text: 'Kuiz 1: Perkembangan Fizikal', closest: 'li' },
      tugasan1: { text: 'Tugasan 1: Rancangan Aktiviti Harian', closest: 'li' },
      note3: { text: 'Pemakanan Seimbang untuk Kanak-Kanak', closest: 'li' },
      note4: { text: 'Bermain Sambil Belajar', closest: 'li' },
      quiz2: { text: 'Kuiz 2: Pemakanan & Kesihatan', closest: 'li' },
    },
  },
  {
    id: 'learn-note',
    url: `/learn/notes/${note1}`,
    as: 'student',
    viewport: VP,
    waitFor: 'main h2',
    settle: 700,
    tag: {
      ...learner,
      back: { text: 'Course', within: 'main', closest: 'a' },
      title: 'main h1',
      updated: 'main h1 + p',
      heading1: { text: 'Empat domain perkembangan', within: 'main' },
      intro: { text: 'Perkembangan kanak-kanak berlaku serentak', within: 'main' },
      heading2: { text: 'Peringkat utama', within: 'main' },
      stages: 'main ul',
      heading3: { text: 'Peranan pengasuh', within: 'main' },
      steps: 'main ol',
      heading4: { text: 'Bila perlu merujuk', within: 'main' },
      quote: 'main blockquote',
    },
  },
  {
    id: 'learn-note-full',
    url: `/learn/notes/${note1}`,
    as: 'student',
    viewport: tall('learn-note', 960),
    waitFor: 'main h2',
    settle: 700,
    tag: { ...learner, title: 'main h1', stages: 'main ul', steps: 'main ol', quote: 'main blockquote' },
  },

  // --- Kuiz 1: in the middle of it, then the mark ------------------------------
  {
    id: 'learn-assessment',
    url: `/learn/assessments/${kuiz1}`,
    as: 'student',
    now: '2026-10-06T16:21',
    viewport: VP,
    waitFor: '[role="timer"]',
    steps: pickQ2,
    tag: { ...attemptTags, timer: '[role="timer"]' },
  },
  {
    // six minutes later, the whole paper: five answered, the sixth being picked
    id: 'learn-assessment-full',
    url: `/learn/assessments/${kuiz1}`,
    as: 'student',
    now: '2026-10-06T16:27',
    viewport: tall('learn-assessment', 2700),
    waitFor: '[role="timer"]',
    steps: pickQ6,
    tag: {
      ...learner,
      title: 'main h1',
      meta: 'main h1 + p',
      timer: '[role="timer"]',
      instructions: { text: 'Instructions', within: 'main', closest: CARD },
      ...Object.fromEntries(Array.from({ length: 10 }, (_x, i) => [`q${i + 1}`, Q(i + 1)])),
      q6Answer: { text: 'Berlari dan memanjat di taman permainan', within: 'main', closest: 'div' },
      answered: { text: 'answered', within: 'main' },
      save: { text: 'Save answers', closest: 'button' },
      submit: { text: 'Submit assessment', within: 'main', closest: 'button' },
    },
  },
  {
    id: 'learn-assessment-attempts',
    url: `/learn/assessments/${kuiz1}`,
    as: 'student',
    viewport: VP,
    waitFor: 'main ul',
    tag: {
      ...learner,
      title: 'main h1',
      meta: 'main h1 + p',
      attempts: { text: 'Your attempts', within: 'main', closest: CARD },
      attempt: 'main ul > li',
      marked: { text: 'Marked', within: 'main' },
      score: { text: '18 / 20', within: 'main' },
      view: { text: 'View', within: 'main', closest: 'button' },
      start: { text: 'Start assessment', closest: 'button' },
    },
  },
  {
    id: 'learn-assessment-result',
    url: `/learn/assessments/${kuiz1}`,
    as: 'student',
    viewport: VP,
    waitFor: 'main ul',
    steps: [{ click: { text: 'View', exact: true } }, { wait: 500 }, toTop, { wait: 200 }],
    tag: {
      ...learner,
      back: { text: 'Course', within: 'main', closest: 'a' },
      title: 'main h1',
      meta: 'main h1 + p',
      result: { text: 'Submitted', within: 'main', closest: '.rounded-xl' },
      score: { text: '18 / 20', within: 'main' },
      instructions: { text: 'Instructions', within: 'main', closest: CARD },
      q1: Q(1),
      q1Answer: { text: '6–8 bulan', within: 'main', closest: 'div' },
    },
  },
  {
    id: 'learn-assessment-result-full',
    url: `/learn/assessments/${kuiz1}`,
    as: 'student',
    viewport: tall('learn-assessment-result', 2700),
    waitFor: 'main ul',
    steps: [{ click: { text: 'View', exact: true } }, { wait: 500 }, toTop, { wait: 200 }],
    tag: {
      ...learner,
      title: 'main h1',
      result: { text: 'Submitted', within: 'main', closest: '.rounded-xl' },
      score: { text: '18 / 20', within: 'main' },
      q1: Q(1),
      q7: Q(7),
      q10: Q(10),
    },
  },

  {
    id: 'learn-work',
    url: '/learn/work',
    as: 'student',
    viewport: VP,
    waitFor: 'main ul',
    tag: {
      ...learner,
      title: 'main h1',
      subtitle: 'main h1 + p',
      tiles: 'main .grid.xl\\:grid-cols-5',
      tileAll: { text: 'All', within: 'main', closest: 'button' },
      tileOverdue: { text: 'Overdue', within: 'main', closest: 'button' },
      tileTodo: { text: 'To do', within: 'main', closest: 'button' },
      tileAwaiting: { text: 'Awaiting marks', within: 'main', closest: 'button' },
      tileMarked: { text: 'Marked', within: 'main', closest: 'button' },
      list: `main ${CARD}`,
      tugasan1: { text: 'Tugasan 1: Rancangan Aktiviti Harian', closest: 'li' },
      tugasan1State: { text: 'Started', within: 'main' },
      kuiz2: { text: 'Kuiz 2: Pemakanan & Kesihatan', closest: 'li' },
    },
  },
  {
    id: 'learn-work-all',
    url: '/learn/work?state=all',
    as: 'student',
    viewport: VP,
    waitFor: 'main ul',
    tag: {
      ...learner,
      title: 'main h1',
      tiles: 'main .grid.xl\\:grid-cols-5',
      tileAll: { text: 'All', within: 'main', closest: 'button' },
      tileMarked: { text: 'Marked', within: 'main', closest: 'button' },
      list: `main ${CARD}`,
      tugasan1: { text: 'Tugasan 1: Rancangan Aktiviti Harian', closest: 'li' },
      kuiz1: { text: 'Kuiz 1: Perkembangan Fizikal', closest: 'li' },
      kuiz1Score: { text: '18', within: 'main ul' },
      kuiz2: { text: 'Kuiz 2: Pemakanan & Kesihatan', closest: 'li' },
    },
  },

  // --- her money ----------------------------------------------------------------
  {
    id: 'learn-billing',
    url: '/learn/billing',
    as: 'student',
    viewport: VP,
    waitFor: 'main table',
    tag: {
      ...learner,
      title: 'main h1',
      subtitle: 'main h1 + p',
      tiles: 'main .grid.lg\\:grid-cols-3',
      tileBilled: { text: 'Billed', within: 'main', closest: CARD },
      tilePaid: { text: 'RM 900.00', within: 'main', closest: CARD, nth: 0 },
      tileOutstanding: { text: 'Outstanding', within: 'main', closest: CARD },
      invoices: 'main table',
      invoice: { text: 'INV-2026-0412', closest: 'tr' },
      invoiceStatus: { text: 'Partially Paid', within: 'main' },
      download: 'main table button',
      payoutsHeading: { text: 'Payouts', within: 'main' },
      payout: { text: 'September 2026', closest: 'tr' },
      payoutStatus: 'main div.mt-8 ~ div.mt-8 [data-slot="badge"]',
      payoutAmount: { text: 'RM 500.00', within: 'main' },
    },
  },
  { id: 'learn-invoice', url: `/learn/billing/${heroInvoice}`, as: 'student', viewport: VP, waitFor: CARD, tag: { ...learnInvoiceTags, status: { text: 'Partially Paid', within: 'main' }, downloadReceipt: { text: 'Download receipt', closest: 'button' } } },
  {
    // 12:25 — the FPX payment has landed: Paid, nothing left to pay.
    id: 'learn-invoice-paid',
    url: `/learn/billing/${heroInvoice}`,
    as: 'student',
    now: '2026-10-07T12:25',
    viewport: VP,
    waitFor: CARD,
    tag: {
      ...learner,
      headerCard: { text: 'INV-2026-0412', within: 'main', closest: CARD },
      invoiceNo: 'main h1',
      status: 'main h1 + [data-slot="badge"]',
      downloadReceipt: { text: 'Download receipt', closest: 'button' },
      summaryCard: { text: 'Summary', within: 'main', closest: CARD },
      ...summaryRows,
      paymentsCard: { text: 'Payments', within: 'main', closest: CARD },
      firstPayment: 'main ul > li:nth-child(1)',
      secondPayment: 'main ul > li:nth-child(2)',
    },
  },

  // --- booking a session --------------------------------------------------------
  { id: 'learn-appointments', url: '/learn/appointments', as: 'student', now: '2026-10-06T20:12', viewport: VP, waitFor: 'main .snap-x', steps: pickDay, tag: bookingTags },
  {
    id: 'learn-appointments-picked',
    url: '/learn/appointments',
    as: 'student',
    now: '2026-10-06T20:12',
    viewport: VP,
    waitFor: 'main .snap-x',
    steps: pickSlot,
    tag: {
      ...bookingTags,
      picked: { text: '10:00', within: 'main', closest: 'button' },
      instructor: '#learn-instructor',
      note: '#learn-note',
    },
  },
  {
    id: 'learn-appointments-booked',
    url: '/learn/appointments',
    as: 'student',
    viewport: VP,
    waitFor: 'main .snap-x',
    tag: {
      ...learner,
      title: 'main h1',
      bookCard: { text: 'Book a session', within: 'main', closest: CARD },
      dayStrip: 'main .snap-x',
      sessionsCard: { text: 'My sessions', within: 'main', closest: CARD },
      booked: { text: 'Tue, 13 Oct, 10:00', closest: 'li' },
      bookedWith: { text: 'Siti Hajar Ismail', within: 'main' },
      bookedStatus: { text: 'Booked', within: 'main' },
      cancel: { text: 'Cancel session', closest: 'button' },
      past: { text: 'Tue, 29 Sept, 10:00', closest: 'li' },
    },
  },

  // --- LPKC: she uploads, Hawary AI answers --------------------------------------
  {
    id: 'learn-reports-empty',
    url: '/learn/reports',
    as: 'student',
    now: '2026-10-07T09:10',
    viewport: VP,
    waitFor: 'main ul',
    tag: {
      ...learner,
      title: 'main h1',
      subtitle: 'main h1 + p',
      row: 'main ul > li',
      nothing: { text: 'Nothing sent yet', within: 'main' },
      send: { text: 'Send for checking', closest: 'button' },
    },
  },
  {
    id: 'learn-report-submit',
    url: '/learn/reports',
    as: 'student',
    now: '2026-10-07T09:10',
    viewport: VP,
    waitFor: 'main ul',
    steps: [{ click: { text: 'Send for checking' } }, { wait: 500 }, { type: { sel: '#report-title', text: 'LPKC, slide dan portfolio' } }, { eval: pickFiles }, { wait: 700 }, blur, { wait: 200 }],
    tag: {
      dialog: '[role="dialog"]',
      dialogTitle: '[role="dialog"] h2',
      dialogDesc: '[role="dialog"] h2 + p',
      what: '#report-title',
      files: '[role="dialog"] ul',
      filePdf: { text: 'LPKC_Nur_Aisyah_v1.pdf', within: '[role="dialog"]', closest: 'li' },
      filePptx: { text: 'Slide_Pembentangan.pptx', within: '[role="dialog"]', closest: 'li' },
      attach: { text: 'Attach files', within: '[role="dialog"]', closest: 'button' },
      send: { text: 'Send for checking', within: '[role="dialog"]', closest: 'button' },
      cancel: { text: 'Cancel', within: '[role="dialog"]', closest: 'button' },
    },
  },
  {
    id: 'learn-reports',
    url: '/learn/reports',
    as: 'student',
    now: '2026-10-07T09:30',
    viewport: VP,
    waitFor: 'main ul',
    tag: {
      ...learner,
      title: 'main h1',
      subtitle: 'main h1 + p',
      row: 'main ul > li',
      report: { text: 'LPKC, slide dan portfolio', within: 'main' },
      meta: { text: 'Checked by Siti Hajar Ismail', within: 'main' },
      status: { text: 'Changes needed', within: 'main' },
      resubmit: { text: 'Send a new version', closest: 'button' },
    },
  },
  {
    // 09:12:20 — uploaded, and the AI has not answered yet.
    id: 'learn-report-sent',
    url: `/learn/reports/${heroReport}`,
    as: 'student',
    now: '2026-10-07T09:12:20',
    viewport: VP,
    waitFor: 'main ol',
    tag: {
      ...learner,
      title: 'main h1',
      status: 'main h1 + [data-slot="badge"]',
      thread: `main ${CARD}`,
      upload: 'main ol > li:nth-child(1)',
      filePdf: { text: 'LPKC_Nur_Aisyah_v1.pdf', within: 'main', closest: '.rounded-md' },
      filePptx: { text: 'Slide_Pembentangan.pptx', within: 'main', closest: '.rounded-md' },
    },
  },
  { id: 'learn-report', url: `/learn/reports/${heroReport}`, as: 'student', now: '2026-10-07T09:30', viewport: VP, waitFor: 'main ol', tag: threadTags },
  {
    id: 'macro-learn-ai-feedback',
    url: `/learn/reports/${heroReport}`,
    as: 'student',
    now: '2026-10-07T09:30',
    viewport: MACRO,
    waitFor: 'main ol',
    clip: { sel: 'main ol > li:nth-child(2)', pad: 4 },
    tag: {
      aiIcon: 'main ol > li:nth-child(2) > span',
      aiHeadline: { text: 'Hawary AI updated the status', within: 'main' },
      aiBadge: 'main ol > li:nth-child(2) [data-slot="badge"]',
      aiBody: 'main ol > li:nth-child(2) p',
    },
  },
  {
    // default clock: v2 is in, Hawary AI has passed it, the trainer has not looked yet.
    id: 'learn-report-passed',
    url: `/learn/reports/${heroReport}`,
    as: 'student',
    viewport: VP,
    waitFor: 'main ol',
    tag: {
      ...learner,
      title: 'main h1',
      status: 'main h1 + [data-slot="badge"]',
      version: { text: 'Version 2', within: 'main' },
      thread: `main ${CARD}`,
      v1: 'main ol > li:nth-child(1)',
      aiFix: 'main ol > li:nth-child(2)',
      v2: 'main ol > li:nth-child(3)',
      aiPass: 'main ol > li:nth-child(4)',
      aiPassBadge: 'main ol > li:nth-child(4) [data-slot="badge"]',
    },
  },
  {
    id: 'learn-report-approved',
    url: `/learn/reports/${heroReport}`,
    as: 'student',
    now: '2026-10-07T12:06',
    viewport: { w: 1440, h: 940, dpr: 2 },
    waitFor: 'main ol',
    tag: {
      ...learner,
      title: 'main h1',
      status: 'main h1 + [data-slot="badge"]',
      thread: `main ${CARD}`,
      aiPass: 'main ol > li:nth-child(4)',
      approval: 'main ol > li:nth-child(5)',
      approvalBadge: 'main ol > li:nth-child(5) [data-slot="badge"]',
      approvalBody: 'main ol > li:nth-child(5) p',
    },
  },
]
