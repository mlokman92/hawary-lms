// The teaching side of the web back office — students, enrolment, authoring, marking,
// appointments, analytics, members, the trainer's dashboard, and the LPKC AI check.
//
//   node tools/capture/web/run.mjs tools/capture/web/shots.teaching.mjs --port 5321 --serve          (from video/)
//   node tools/capture/web/run.mjs tools/capture/web/shots.teaching.mjs lpkc-thread-2 --port 5321 --serve
//
// The LPKC shots need the harness-only component variants (web/variants/). This file turns
// them on for any server the runner starts for it (`--serve`); a server you start yourself
// needs the same variable:
//   CAPTURE_PLUGINS=tools/capture/web/variants/plugin.mjs node tools/capture/web/serve.mjs --port 5321
//
// Naming: `<id>` is the frame the brief asked for. `<id>-top` is the same page in the
// standard 1440x900 window when the brief's content needed a taller one; `<id>-tall` is the
// whole page when the standard window was enough for the brief. A tall frame is shot in a
// window as tall as the page (not fullPage), so the fixed sidebar runs its whole height.

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ID, uid } from '../fake/ids.js'

process.env.CAPTURE_PLUGINS ??= 'tools/capture/web/variants/plugin.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))

export const outDir = path.resolve(here, '../../../public/shots/web')
export const defaults = { as: 'director', lang: 'en', theme: 'light', db: 'teaching' }

const VP = { w: 1440, h: 900, dpr: 2 }
const tall = (h) => ({ w: 1440, h, dpr: 2 })
const MACRO = { w: 1440, h: 900, dpr: 4 }
const CARD = '[data-slot="card"]'
const BADGE = '[data-slot="badge"]'
/** The page's own first text box. `main` also holds the top bar, whose search box is not it. */
const PAGE_INPUT = 'main input:not(header input)'
const siri3 = ID.course.siri3
const kuiz1 = ID.content.siri3.week1.assessment
/** Damia Qistina Roslan's Tugasan 1 (fake/db/teaching.ts HERO_SUBMISSION). */
const heroSubmission = uid('submission', 'siri3/week1/331')
const heroReport = ID.hero.report

// The film's clock for the four beats of Nur Aisyah's thread (fake/db/base.reports.ts).
const BEAT = {
  1: '2026-10-07T09:12:20', // v1 uploaded, the AI is still reading it          -> Waiting
  2: '2026-10-07T09:13:00', // the AI has answered: 3 points to fix             -> Changes needed
  3: '2026-10-07T11:55:00', // v2 uploaded, the AI says all 12 are met          -> Being checked (the default clock)
  4: '2026-10-07T12:06:00', // Siti Hajar approved                              -> Approved
}

// --- small step helpers -------------------------------------------------------
/** Park the pointer on the page title so no row keeps a hover highlight. */
const park = { hover: { sel: 'main h1' } }
/** Drop the focus ring a click or a keystroke leaves behind. */
const blur = { eval: 'document.activeElement && document.activeElement.blur()' }
const toBottom = { eval: 'window.scrollTo(0, document.documentElement.scrollHeight)' }
/**
 * shoot.mjs reports rects in document coordinates, which only match the image while the
 * window is not scrolled. A frame scrolled to the bottom of a page `pageH` tall is therefore
 * clipped to exactly the window it is showing: the same pixels, and rects relative to the image.
 */
const scrolled = (pageH) => ({ x: 0, y: pageH - 900, w: 1440, h: 900 })
/** The join link is built from window.location.origin; in production that is app.hawary.my, not this harness. */
const productionOrigin = {
  eval: `document.querySelectorAll('main code').forEach((c) => { c.textContent = c.textContent.replace(location.origin, 'https://app.hawary.my'); c.title = c.textContent })`,
}

// --- tags every back-office frame has ------------------------------------------
const shell = {
  sidebar: '[data-slot="sidebar-container"]',
  academy: '[data-slot="sidebar-header"]',
  user: '[data-slot="sidebar-footer"]',
  search: 'header input',
  bell: 'header button[aria-label]:last-of-type',
  title: 'main h1',
}
/** For frames with no h1 in view (the quiz editor's title is a text box; a scrolled frame has left it behind). */
const { title: _noTitle, ...chrome } = shell
const nav = (label) => ({ text: label, within: '[data-slot="sidebar-content"]', closest: 'li' })
const adminNav = { navEnrollments: nav('Enrollments'), navLpkc: nav('LPKC'), navAppointments: nav('Appointments'), navStudents: nav('Students') }
const pageHeader = { ...shell, subtitle: 'main h1 + p' }
const tile = (label) => ({ text: label, within: 'main', closest: 'button' })
const card = (label) => ({ text: label, within: 'main', closest: CARD })
const button = (label, within = 'main') => ({ text: label, within, closest: 'button' })
const row = (name, el = 'li') => ({ text: name, within: 'main', closest: el })

// ---------------------------------------------------------------------------
// 1-2. Students
// ---------------------------------------------------------------------------
const studentTiles = {
  tileTotal: tile('Total'),
  tileActive: tile('Active'),
  tileTrial: tile('Trial'),
  tileInactive: tile('Inactive'),
  tileWithdrawn: tile('Withdrawn'),
  tileUnenrolled: tile('Unenrolled'),
}
const studentsChrome = {
  ...pageHeader,
  ...adminNav,
  ...studentTiles,
  importCsv: button('Import CSV'),
  addStudent: button('Add Student'),
  searchBox: PAGE_INPUT,
  courseFilter: 'main [data-slot="select-trigger"]',
  table: 'main table',
  headerRow: 'main thead tr',
  firstRow: 'main tbody tr:nth-child(1)',
  firstStatus: `main tbody tr:nth-child(1) ${BADGE}`,
}
const castRows = Object.fromEntries(
  [
    ['heroRow', 'Nur Aisyah Razak'],
    ['rowAina', 'Aina Sofea Rosli'],
    ['rowNurulHuda', 'Nurul Huda Mansor'],
    ['rowFarhana', 'Farhana Yusof'],
    ['rowIntan', 'Intan Syazwani Halim'],
    ['rowPuteri', 'Puteri Balqis Azman'],
    ['rowZulaikha', 'Zulaikha Hamdan'],
  ].map(([k, name]) => [k, row(name, 'tr')]),
)

const students = [
  // The cast's sixteen first: the hero intake, oldest joiners on top.
  {
    id: 'students',
    url: `/students?course=${siri3}`,
    viewport: VP,
    waitFor: 'main table tbody tr',
    steps: [
      { click: { sel: 'main [data-slot="select-trigger"]', nth: 1 } },
      { wait: 250 },
      { click: { sel: '[role="option"]', nth: 3 } }, // Join date: oldest
      { wait: 250 },
      blur,
      park,
    ],
    tag: {
      ...studentsChrome,
      ...castRows,
      sort: button('Join date: oldest'),
      heroName: { text: 'Nur Aisyah Razak', within: 'main table' },
      heroNo: { text: 'HA-2026-0318', within: 'main table' },
      heroCourse: { text: 'DKM Prasekolah Siri 3/2026', within: 'main table' },
    },
  },
  // The page as it opens: every course, newest joiners first — Active and Trial, with and without a course.
  {
    id: 'students-all',
    url: '/students',
    viewport: VP,
    waitFor: 'main table tbody tr',
    tag: {
      ...studentsChrome,
      sort: button('Join date: newest'),
      newestRow: row('Khadijah Sofea Latif', 'tr'),
      trialRow: row('Alya Shahira Yahya', 'tr'),
      trialBadge: { text: 'Trial', within: 'main table', closest: BADGE },
      noCourseRow: row('Hani Wahida Hussin', 'tr'),
    },
  },
]

const studentTags = {
  ...shell,
  ...adminNav,
  back: { text: 'Students', within: 'main', closest: 'a' },
  headerCard: card('Member since'),
  avatar: 'main [data-slot="avatar"]',
  name: 'main h1',
  memberSince: { text: 'Member since June 2026', within: 'main' },
  accountLinked: { text: 'App account linked', within: 'main', closest: BADGE },
  suspendAccess: button('Suspend access'),
  statusSelect: 'main [data-slot="select-trigger"]',
  editProfile: button('Edit profile'),
  personalCard: card('Personal details'),
  fieldStudentNo: { text: 'Student ID', within: 'main', closest: 'div' },
  fieldIc: { text: 'IC Number', within: 'main', closest: 'div' },
  fieldPhone: { text: 'Phone', within: 'main', closest: 'div' },
  fieldEmail: { text: 'Email', within: 'main', closest: 'div' },
  fieldOrganization: { text: 'Organization', within: 'main', closest: 'div' },
  fieldAddress: { text: 'Address', within: 'main', closest: 'div' },
  enrolledCard: card('Enrolled courses'),
  enrolledCourse: row('DKM Prasekolah Siri 3/2026'),
  addCourse: button('Add course'),
}

const student = [
  { id: 'student', url: `/students/${ID.hero.student}`, viewport: VP, waitFor: CARD, tag: studentTags },
  // Down to the end of her billing card (the page goes on: bank account, archive).
  {
    id: 'student-tall',
    url: `/students/${ID.hero.student}`,
    viewport: tall(1140),
    waitFor: 'main ul li a',
    tag: {
      ...studentTags,
      billingCard: card('Billing'),
      billed: { text: 'Billed', within: 'main', closest: 'div' },
      paid: { text: 'Paid', within: 'main', closest: 'div' },
      outstanding: { text: 'Outstanding', within: 'main', closest: 'div' },
      invoiceRow: row('INV-2026-0412'),
      invoiceNo: { text: 'INV-2026-0412', within: 'main', closest: 'div' },
      invoiceStatus: { text: 'Partially Paid', within: 'main', closest: BADGE },
      newInvoice: button('New invoice'),
    },
  },
]

// ---------------------------------------------------------------------------
// 3-4. Enrolment
// ---------------------------------------------------------------------------
const requestRows = {
  firstRow: row('Khadijah Sofea Latif'),
  firstApprove: button('Approve'),
  firstReject: button('Reject'),
  row2: row('Syaza Sulaiman'),
  row3: row('Zahra Amalina Ghazali'),
  row4: row('Syifa Hidayah Abdullah'),
  row5: row('Nisa Hazwani Daud'),
}
const enrollmentTags = {
  ...pageHeader,
  ...adminNav,
  enrollStudents: button('Enroll students'),
  linkCard: card('Public join link'),
  linkSwitch: 'main [data-slot="card"] [data-slot="switch"]',
  linkUrl: 'main code',
  copyLink: button('Copy'),
  intro: '#enroll-intro',
  preview: { text: 'Preview', within: 'main', closest: 'a' },
  coursesCard: card('Courses accepting requests'),
  courseSiri1: row('DKM Prasekolah Siri 1/2026'),
  courseSiri2: row('DKM Prasekolah Siri 2/2026'),
  courseSiri3: row('DKM Prasekolah Siri 3/2026'),
  siri3Seats: { text: '178 of 200 seats', within: 'main' },
  siri3Switch: 'main ul li:nth-child(3) [data-slot="switch"]',
  requestSearch: 'input[placeholder^="Search name, email, phone or course"]',
  requestFilter: button('Awaiting approval'),
  ...requestRows,
}

const enrolment = [
  // The standard window, scrolled down to the queue: five requests, each with Reject / Approve.
  { id: 'enrollments', url: '/enrollments', viewport: VP, waitFor: 'main ul li button', steps: [productionOrigin, toBottom, { wait: 200 }], clip: scrolled(1179), tag: { ...chrome, ...adminNav, linkCard: card('Message on the page'), preview: { text: 'Preview', within: 'main', closest: 'a' }, siri3Seats: { text: '178 of 200 seats', within: 'main' }, siri3Switch: 'main ul li:nth-child(3) [data-slot="switch"]', requestSearch: 'input[placeholder^="Search name, email, phone or course"]', requests: `main ${CARD}:last-of-type`, coursesCard: card('Courses accepting requests'), courseSiri3: row('DKM Prasekolah Siri 3/2026'), requestFilter: button('Awaiting approval'), ...requestRows } },
  { id: 'enrollments-top', url: '/enrollments', viewport: VP, waitFor: 'main ul li button', steps: [productionOrigin], tag: { ...pageHeader, ...adminNav, enrollStudents: enrollmentTags.enrollStudents, linkCard: enrollmentTags.linkCard, linkSwitch: enrollmentTags.linkSwitch, linkUrl: enrollmentTags.linkUrl, copyLink: enrollmentTags.copyLink, intro: enrollmentTags.intro, preview: enrollmentTags.preview, coursesCard: enrollmentTags.coursesCard, courseSiri1: enrollmentTags.courseSiri1, courseSiri2: enrollmentTags.courseSiri2, courseSiri3: enrollmentTags.courseSiri3, siri3Seats: enrollmentTags.siri3Seats, siri3Switch: enrollmentTags.siri3Switch } },
  // The whole page in one frame: the door, the courses behind it, and the five requests waiting.
  { id: 'enrollments-tall', url: '/enrollments', viewport: tall(1179), waitFor: 'main ul li button', steps: [productionOrigin], tag: enrollmentTags },
  // One click later (pixel-aligned with enrollments-tall): Khadijah is in. Four waiting, the
  // sidebar badge has dropped to 4, and the intake has 179 of 200 seats.
  {
    id: 'enrollments-approved',
    url: '/enrollments',
    writes: 'apply',
    viewport: tall(1179),
    waitFor: 'main ul li button',
    steps: [productionOrigin, { click: { text: 'Approve', exact: true } }, { wait: 900 }, blur, park],
    tag: { ...pageHeader, ...adminNav, coursesCard: card('Courses accepting requests'), courseSiri3: row('DKM Prasekolah Siri 3/2026'), siri3Seats: { text: '179 of 200 seats', within: 'main' }, requestFilter: button('Awaiting approval'), firstRow: row('Syaza Sulaiman'), firstApprove: button('Approve') },
  },
  ...['enroll-public', 'enroll-public-phone'].map((id) => ({
    id,
    url: '/enroll/hawary-academy',
    as: 'anon',
    viewport: id.endsWith('phone') ? { w: 430, h: 900, dpr: 3 } : VP,
    waitFor: '[role="radio"]',
    tag: {
      academyLogo: '[data-slot="avatar"]',
      academyName: { text: 'Hawary Academy' },
      language: { text: 'EN', closest: 'button' },
      card: CARD,
      cardTitle: { text: 'Join this academy' },
      cardSubtitle: { text: 'Pick the course you want' },
      intro: { text: 'Selamat datang ke Hawary Academy' },
      choose: { text: 'Choose a course' },
      courseOption: { text: 'DKM Prasekolah Siri 3/2026', closest: 'label' },
      courseTitle: { text: 'DKM Prasekolah Siri 3/2026' },
      courseMeta: { text: 'DKM-PRA-S3/26' },
      courseRadio: '[role="radio"]',
      createAccount: { text: 'Create an account', closest: 'a' },
      signIn: { text: 'Sign in', closest: 'a' },
    },
  })),
]

// ---------------------------------------------------------------------------
// 5. Authoring: Kuiz 1 with every question type
// ---------------------------------------------------------------------------
const question = (n) => ({ text: `Question ${n}`, within: 'main', closest: '.rounded-lg' })
const editorTags = {
  ...chrome,
  ...adminNav,
  back: { text: 'Course', within: 'main', closest: 'a' },
  published: button('Published'),
  saved: button('Saved'),
  quizTitle: 'main input.font-semibold',
  instructionsCard: card('Instructions'),
  questionsCard: card('Questions'),
  questionsMeta: { text: '10 questions · 20 points', within: 'main' },
  q1: question(1),
  qSingleChoice: question(1),
  q1Type: button('Multiple choice (one answer)'),
  q1Prompt: 'main .rounded-lg.border.p-3 textarea',
  autoMarked: { text: 'Marked automatically', within: 'main', closest: BADGE },
}
const authoring = [
  // A window that ends just under question 6: the first six questions are one of each type.
  {
    id: 'assessment-editor',
    url: `/assessments/${kuiz1}`,
    viewport: tall(2482),
    waitFor: 'main textarea',
    tag: {
      ...editorTags,
      q2: question(2),
      q3: question(3),
      q4: question(4),
      q5: question(5),
      q6: question(6),
      qTrueFalse: question(2),
      qMultipleChoice: question(3),
      qMatching: question(4),
      qShortAnswer: question(5),
      qLongAnswer: question(6),
      q2Type: button('True or false'),
      q3Type: button('Multiple choice (several answers)'),
      q4Type: button('Matching'),
      q5Type: button('Short answer'),
      q6Type: button('Long answer'),
      trueFalseKey: { text: 'CORRECT ANSWER', within: 'main', closest: 'div' },
      matchingPairs: { text: 'PAIRS', within: 'main', closest: 'div' },
    },
  },
  { id: 'assessment-editor-top', url: `/assessments/${kuiz1}`, viewport: VP, waitFor: 'main textarea', tag: editorTags },
]

// ---------------------------------------------------------------------------
// 6-7. Marking (as the trainer, Siti Hajar Ismail)
// ---------------------------------------------------------------------------
const queueTags = {
  ...pageHeader,
  navAssessments: nav('Assessments'),
  navAssignments: nav('Assignments'),
  navLpkc: nav('LPKC'),
  tileAwaiting: tile('Awaiting marks'),
  tileMarked: tile('Marked'),
  tileAll: tile('All'),
  searchBox: PAGE_INPUT,
  courseFilter: 'main [data-slot="select-trigger"]',
  queue: `main ${CARD}`,
  firstRow: 'main ul li:nth-child(1)',
  firstBadge: `main ul li:nth-child(1) ${BADGE}`,
  firstWhen: 'main ul li:nth-child(1) > span:last-child',
  row2: 'main ul li:nth-child(2)',
  row3: 'main ul li:nth-child(3)',
  row4: 'main ul li:nth-child(4)',
  row5: 'main ul li:nth-child(5)',
  row6: 'main ul li:nth-child(6)',
  row7: 'main ul li:nth-child(7)',
  row8: 'main ul li:nth-child(8)',
}
const submissionTags = {
  ...shell,
  back: { text: 'Grading', within: 'main', closest: 'a' },
  name: 'main h1',
  status: `main h1 + ${BADGE}`,
  meta: { text: 'Tugasan 1: Rancangan Aktiviti Harian · submitted', within: 'main' },
  briefCard: card('Brief'),
  workCard: card('Submitted work'),
  // The page is: back link, heading, then three cards (brief, work, mark) as sibling divs.
  answer: `main ${CARD}:nth-of-type(3) p.whitespace-pre-line`,
  file1: row('Rancangan_Aktiviti_Harian_Damia.pdf'),
  file2: row('Susun_atur_kelas.jpg'),
  markCard: card('Mark (out of 100)'),
  scoreLabel: { text: 'Mark (out of 100)', within: 'main' },
  score: '#grade',
  feedback: '#feedback',
  saveMark: button('Save mark'),
  saveReturn: button('Save & return to student'),
}
const typeMark = [
  { type: { sel: '#grade', text: '88' } },
  { type: { sel: '#feedback', text: 'Clear, measurable objectives in every slot, and a good balance of active and quiet time. Add one safety step for the bead activity.' } },
  blur,
]
const marking = [
  {
    id: 'grading-queue',
    url: '/assignments',
    as: 'trainer',
    viewport: VP,
    waitFor: 'main ul li',
    tag: { ...queueTags, heroRow: row('Damia Qistina Roslan'), heroLink: { text: 'Damia Qistina Roslan', within: 'main', closest: 'a' } },
  },
  {
    id: 'grading-queue-assessments',
    url: '/assessments',
    as: 'trainer',
    viewport: VP,
    waitFor: 'main ul li',
    tag: { ...queueTags, heroRow: row('Puteri Balqis Azman') },
  },
  // The whole hand-in, with the trainer's mark and feedback typed in and not yet saved.
  { id: 'grade-submission', url: `/grading/submissions/${heroSubmission}`, as: 'trainer', viewport: tall(1729), waitFor: '#grade', steps: [...typeMark, { eval: 'window.scrollTo(0, 0)' }, park], tag: submissionTags },
  // The same frame before she types: pixel-aligned with the one above.
  { id: 'grade-submission-blank', url: `/grading/submissions/${heroSubmission}`, as: 'trainer', viewport: tall(1729), waitFor: '#grade', tag: submissionTags },
  { id: 'grade-submission-top', url: `/grading/submissions/${heroSubmission}`, as: 'trainer', viewport: VP, waitFor: '#grade', tag: { ...shell, back: submissionTags.back, name: submissionTags.name, status: submissionTags.status, meta: submissionTags.meta, briefCard: submissionTags.briefCard, workCard: submissionTags.workCard } },
  // The standard window scrolled to the end: the last of the answer, its files, and the mark.
  { id: 'grade-submission-mark', url: `/grading/submissions/${heroSubmission}`, as: 'trainer', viewport: VP, waitFor: '#grade', steps: [...typeMark, toBottom, { wait: 200 }], clip: scrolled(1729), tag: { ...chrome, file1: submissionTags.file1, file2: submissionTags.file2, markCard: submissionTags.markCard, score: submissionTags.score, feedback: submissionTags.feedback, saveMark: submissionTags.saveMark, saveReturn: submissionTags.saveReturn } },
]

// ---------------------------------------------------------------------------
// 8. Appointments
// ---------------------------------------------------------------------------
const session = (student) => ({ text: student, within: 'main', closest: 'button' })
const diaryTags = {
  ...pageHeader,
  ...adminNav,
  bookSession: button('Book a session'),
  bookingSettings: { text: 'Booking settings', within: 'main', closest: 'a' },
  diary: card('Diary'),
  prevWeek: 'button[aria-label="Previous week"]',
  thisWeek: button('This week'),
  nextWeek: 'button[aria-label="Next week"]',
  instructorFilter: 'main [data-slot="select-trigger"]',
  grid: 'main .overflow-x-auto',
}
const appointments = [
  {
    id: 'appointments',
    url: '/appointments',
    viewport: VP,
    waitFor: 'main .overflow-x-auto button',
    steps: [{ click: { sel: 'button[aria-label="Next week"]' } }, { wait: 500 }, blur, park],
    tag: {
      ...diaryTags,
      weekRange: { text: '12 – 18 Oct 2026', within: 'main' },
      dayMon: { text: 'Mon 12', within: 'main' },
      dayTue: { text: 'Tue 13', within: 'main' },
      dayWed: { text: 'Wed 14', within: 'main' },
      dayThu: { text: 'Thu 15', within: 'main' },
      dayFri: { text: 'Fri 16', within: 'main' },
      heroSession: session('Nur Aisyah Razak'),
      sessionHannah: session('Hannah Maisarah'),
      sessionSyaza: session('Syaza Wahida Rosli'),
      sessionAlya: session('Alya Batrisya Fauzi'),
      sessionIntan: session('Intan Syazwani'),
      sessionLiyana: session('Liyana Amirah'),
      sessionSyafiqah: session('Syafiqah Ridzuan'),
      sessionDamia: session('Damia Qistina'),
      sessionKhairunnisa: session('Khairunnisa Abd'),
      sessionNabilah: session('Nabilah Huda'),
      sessionIrfan: session('Mohd Irfan Hakim'),
    },
  },
  // The week the page opens on: done (grey), still to come (teal), today's column named in teal.
  {
    id: 'appointments-this-week',
    url: '/appointments',
    viewport: VP,
    waitFor: 'main .overflow-x-auto button',
    tag: { ...diaryTags, weekRange: { text: '5 – 11 Oct 2026', within: 'main' }, today: { text: 'Wed 7', within: 'main' }, completedSession: session('Khairunnisa Abd'), nextSession: session('Farhana Yusof') },
  },
  {
    id: 'appointments-list',
    url: '/appointments/list',
    viewport: VP,
    waitFor: 'main ul li',
    tag: {
      ...pageHeader,
      ...adminNav,
      navAllSessions: nav('All sessions'),
      bookSession: button('Book a session'),
      searchBox: PAGE_INPUT,
      whenFilter: button('Upcoming'),
      statusFilter: button('Any status'),
      instructorFilter: button('All instructors'),
      register: `main ${CARD}`,
      firstRow: 'main ul li:nth-child(1)',
      firstStatus: `main ul li:nth-child(1) ${BADGE}`,
      row2: 'main ul li:nth-child(2)',
      row3: 'main ul li:nth-child(3)',
      row4: 'main ul li:nth-child(4)',
      row5: 'main ul li:nth-child(5)',
      row6: 'main ul li:nth-child(6)',
    },
  },
]

// ---------------------------------------------------------------------------
// 9-10. Analytics, Members
// ---------------------------------------------------------------------------
const analyticsTags = (month, logins) => ({
  ...pageHeader,
  navAnalytics: nav('Analytics'),
  courseFilter: button('All courses'),
  monthFilter: button(month),
  tileActive: card('Active students'),
  chartCard: card('Logins per day'),
  loginsTotal: { text: logins, within: 'main' },
  chart: '.recharts-wrapper',
  bars: '.recharts-bar-rectangles',
  searchBox: PAGE_INPUT,
  table: 'main table',
  headerRow: 'main thead tr',
  firstRow: 'main tbody tr:nth-child(1)',
  heroRow: row('Nur Aisyah Razak', 'tr'),
})
const insight = [
  { id: 'analytics', url: '/analytics?m=2026-09', viewport: VP, waitFor: '.recharts-bar-rectangle', settle: 1800, tag: analyticsTags('September 2026', '3960 logins') },
  { id: 'analytics-current', url: '/analytics', viewport: VP, waitFor: '.recharts-bar-rectangle', settle: 1800, tag: analyticsTags('October 2026', '1597 logins') },
  {
    id: 'members',
    url: '/members',
    viewport: VP,
    waitFor: 'main table tbody tr',
    tag: {
      ...pageHeader,
      navMembers: nav('Members'),
      table: 'main table',
      headerRow: 'main thead tr',
      rowDirector: row('Hakim Zulkifli', 'tr'),
      directorBadge: { text: 'Director', within: 'main table', closest: BADGE },
      rowAdmin: row('Nadia Syazana Rahman', 'tr'),
      rowHajar: row('Siti Hajar Ismail', 'tr'),
      rowFarah: row('Farah Nadia Othman', 'tr'),
      rowAmirul: row('Amirul Hafiz Rahman', 'tr'),
      rowIzzah: row('Nurul Izzah Kamal', 'tr'),
      rowSuspended: row('Mohd Faris Kamaruddin', 'tr'),
      instructorBadge: { text: 'Instructor', within: 'main table', closest: BADGE },
      teaches: { text: 'Teaches 2 courses', within: 'main table' },
      suspendedBadge: { text: 'Suspended', within: 'main table', closest: BADGE },
      hajarMenu: 'main tbody tr:nth-child(3) td:last-child button',
      footnote: { text: 'Suspending a member revokes their access', within: 'main' },
    },
  },
  // The Director's menu on a trainer's row: role, instructor record, suspend.
  {
    id: 'members-menu',
    url: '/members',
    viewport: VP,
    waitFor: 'main table tbody tr',
    steps: [{ click: { sel: 'main tbody tr:nth-child(3) td:last-child button' } }, { wait: 450 }],
    tag: {
      ...shell,
      rowHajar: row('Siti Hajar Ismail', 'tr'),
      menu: '[role="menu"]',
      makeAdmin: { text: 'Make admin', within: '[role="menu"]', closest: '[role="menuitem"]' },
      suspend: { text: 'Suspend', within: '[role="menu"]', closest: '[role="menuitem"]' },
    },
  },
]

// ---------------------------------------------------------------------------
// 11. The admin dashboard, English and Malay, pixel-aligned (base data only)
// ---------------------------------------------------------------------------
const dash = (L) => ({
  sidebar: shell.sidebar,
  academy: shell.academy,
  user: shell.user,
  search: shell.search,
  bell: shell.bell,
  navEnrollments: nav(L.enrollments),
  navLpkc: nav('LPKC'),
  navAppointments: { text: L.appointments, within: '[data-slot="sidebar-content"]', closest: 'a' },
  title: 'h1',
  subtitle: 'h1 + p',
  addStudent: { text: L.addStudent, closest: 'button' },
  newInvoice: { text: L.newInvoice, closest: 'button' },
  tileOverdue: card(L.overdue),
  tileNoCourse: card(L.noCourse),
  tileInvites: card(L.invites),
  tileNotLive: card(L.notLive),
  statStudents: card(L.students),
  statEnrollments: card(L.activeEnrollments),
  statPublished: card(L.published),
  statCollected: card(L.collectedMonth),
  revenueHeading: { text: L.revenue, within: 'main' },
  revenueCard: card(L.collected6),
  revenueCollected: { text: 'RM 1,184,500.00', within: 'main' },
  revenueInvoiced: { text: 'RM 1,432,800.00', within: 'main' },
  chart: '.recharts-wrapper',
})
const EN = { enrollments: 'Enrollments', appointments: 'Appointments', addStudent: 'Add student', newInvoice: 'New invoice', overdue: 'Overdue', noCourse: 'No course yet', invites: 'Invites pending', notLive: 'Not live yet', students: '803 active', activeEnrollments: 'Active enrollments', published: 'Published courses', collectedMonth: 'Collected this month', revenue: 'Revenue overview', collected6: 'Collected · 6 months' }
const MS = { enrollments: 'Pendaftaran', appointments: 'Temu janji', addStudent: 'Tambah pelajar', newInvoice: 'Invois baharu', overdue: 'Lewat tempoh', noCourse: 'Belum ada kursus', invites: 'Jemputan menunggu', notLive: 'Belum diterbitkan', students: '803 aktif', activeEnrollments: 'Pendaftaran aktif', published: 'Kursus diterbitkan', collectedMonth: 'Kutipan bulan ini', revenue: 'Gambaran hasil', collected6: 'Dikutip · 6 bulan' }
const dashboards = [
  { id: 'dashboard-en2', url: '/', db: '', viewport: VP, waitFor: '.recharts-wrapper', settle: 2400, tag: dash(EN) },
  { id: 'dashboard-ms', url: '/', db: '', lang: 'ms', viewport: VP, waitFor: '.recharts-wrapper', settle: 2400, tag: dash(MS) },
]

// ---------------------------------------------------------------------------
// 12. The trainer's dashboard
// ---------------------------------------------------------------------------
const trainerTags = {
  ...pageHeader,
  navLpkc: nav('LPKC'),
  navAssessments: nav('Assessments'),
  navAssignments: nav('Assignments'),
  navAppointments: nav('Appointments'),
  weekCard: card('Your week'),
  today: { text: 'Today', within: 'main', nth: 1 }, // 0 is the page's subtitle, which also says "Today"
  todaySession: { text: 'Farhana Yusof', within: 'main', closest: 'button' },
  heroSession: { text: 'Bincang pembentangan akhir', within: 'main', closest: 'button' },
  reportsCard: card('Reports to check'),
  reportHannah: { text: 'Hannah Maisarah Jalil', within: 'main', nth: 1, closest: 'li' },
  reportHero: { text: 'Nur Aisyah Razak', within: 'main', nth: 1, closest: 'li' },
  reportHeroStatus: { text: 'Being checked', within: 'main', nth: 1, closest: BADGE },
}
const trainer = [
  // Tall enough for all four cards: Your week, Reports to check, and the two marking queues.
  {
    id: 'trainer-dashboard',
    url: '/',
    as: 'trainer',
    viewport: tall(1264),
    waitFor: 'main ul li a',
    tag: {
      ...trainerTags,
      assessmentsCard: card('Assessments to mark'),
      assignmentsCard: card('Assignments to mark'),
      firstAssessment: { text: 'Puteri Balqis Azman', within: 'main', closest: 'li' },
      firstAssignment: { text: 'Damia Qistina Roslan', within: 'main', closest: 'li' },
    },
  },
  { id: 'trainer-dashboard-top', url: '/', as: 'trainer', viewport: VP, waitFor: 'main ul li a', tag: trainerTags },
]

// ---------------------------------------------------------------------------
// 13-18. LPKC — the student uploads, the AI check answers, the trainer approves
// ---------------------------------------------------------------------------
const reportRow = (n) => `[data-report-row]:nth-child(${n})`
const queueRows = Object.fromEntries(
  Array.from({ length: 8 }, (_x, i) => i + 1).flatMap((n) => [
    [`row${n}`, reportRow(n)],
    [`ai${n}`, `${reportRow(n)} [data-ai-check]`],
    [`status${n}`, `${reportRow(n)} ${BADGE}:last-child`],
  ]),
)
const lpkcQueueTags = {
  ...pageHeader,
  ...adminNav,
  header: { text: 'Reports sent in for checking', within: 'main', closest: 'div' },
  menu: 'main h1 ~ * button, main button[aria-haspopup="menu"]',
  tiles: '[data-tiles]',
  tileWaiting: tile('Waiting'),
  tileBeingChecked: tile('Being checked'),
  tileChangesNeeded: tile('Changes needed'),
  tileApproved: tile('Approved'),
  searchBox: PAGE_INPUT,
  queue: `main ${CARD}`,
  ...queueRows,
  heroRow: row('Nur Aisyah Razak'),
  heroAi: `${reportRow(7)} [data-ai-check]`,
  aiPass: '[data-ai-check="pass"]',
  aiFix: '[data-ai-check="fix"]',
  aiChecking: '[data-ai-check="checking"]',
}

const event = (n) => `main ol > li:nth-child(${n})`
const reply = `main ${CARD} > div.border-t`
const threadTags = (events) => ({
  ...shell,
  navLpkc: nav('LPKC'),
  back: { text: 'LPKC checks', within: 'main', closest: 'a' },
  status: `main h1 + ${BADGE}`,
  meta: { text: 'DKM Prasekolah Siri 3/2026 · Nur Aisyah Razak', within: 'main' },
  menu: 'main button[aria-haspopup="menu"]',
  thread: `main ${CARD}`,
  timeline: 'main ol',
  ...Object.fromEntries(Array.from({ length: events }, (_x, i) => [`event${i + 1}`, event(i + 1)])),
  uploadV1: event(1),
  fileV1: `${event(1)} .rounded-md`,
  replyBox: reply,
  replyText: 'main textarea',
  attach: button('Attach files', reply),
  verdictBeingChecked: button('Being checked', reply),
  verdictChangesNeeded: button('Changes needed', reply),
  approveButton: button('Approved', reply),
  send: button('Send', reply),
})
const aiEventTags = (n, prefix) => ({
  [`${prefix}Event`]: event(n),
  [`${prefix}Icon`]: `${event(n)} > span`,
  [`${prefix}Headline`]: `${event(n)} .font-medium`,
  [`${prefix}Badge`]: `${event(n)} [data-ai-badge]`,
  [`${prefix}Status`]: `${event(n)} [data-ai-badge] + ${BADGE}`,
  [`${prefix}Body`]: `${event(n)} p`,
  [`${prefix}When`]: `${event(n)} .tabular-nums`,
})
const thread = (step, extra = {}) => ({ id: `lpkc-thread-${step}`, url: `/lpkc/${heroReport}`, as: 'trainer', now: BEAT[step], viewport: VP, waitFor: 'main ol li', ...extra })

const lpkc = [
  { id: 'lpkc-queue', url: '/lpkc', viewport: VP, waitFor: '[data-report-row]', tag: lpkcQueueTags },
  thread(1, { tag: threadTags(1) }),
  thread(2, { tag: { ...threadTags(2), ...aiEventTags(2, 'ai') } }),
  thread(3, {
    tag: {
      ...threadTags(4),
      version: { text: 'Version 2', within: 'main', closest: BADGE },
      ...aiEventTags(2, 'ai'),
      uploadV2: event(3),
      fileV2: `${event(3)} .rounded-md`,
      ...aiEventTags(4, 'lastAi'),
    },
  }),
  thread(4, {
    tag: {
      ...threadTags(5),
      version: { text: 'Version 2', within: 'main', closest: BADGE },
      ...aiEventTags(2, 'ai'),
      uploadV2: event(3),
      ...aiEventTags(4, 'lastAi'),
      approvalEvent: event(5),
      approvalIcon: `${event(5)} > span`,
      approvalBadge: `${event(5)} ${BADGE}`,
      approvalBody: `${event(5)} p`,
      you: { text: '(you)', within: 'main' },
    },
  }),
  // The whole page (it is 5px taller than the window), in a window that tall so the sidebar is unbroken.
  { ...thread(4), id: 'lpkc-thread-4-full', viewport: tall(905), tag: { ...threadTags(5), ...aiEventTags(2, 'ai'), ...aiEventTags(4, 'lastAi'), approvalEvent: event(5) } },

  // The same thread, the same four beats, from Nur Aisyah's side of the web app — with the same
  // AI marks as the staff frames above. Her one action is "Send a new version" (gone once approved).
  ...[1, 2, 3, 4].map((step) => ({
    id: `lpkc-learner-thread-${step}`,
    url: `/learn/reports/${heroReport}`,
    as: 'student',
    now: BEAT[step],
    viewport: VP,
    waitFor: 'ol li',
    tag: {
      sidebar: shell.sidebar,
      user: shell.user,
      bell: shell.bell,
      navLpkc: nav('LPKC'),
      back: { text: 'My reports', closest: 'a' },
      title: 'h1',
      status: `h1 + ${BADGE}`,
      meta: { text: 'Checked by Siti Hajar Ismail' },
      ...(step < 4 ? { resubmit: { text: 'Send a new version', closest: 'button' } } : {}),
      thread: 'ol',
      ...Object.fromEntries(Array.from({ length: [1, 2, 4, 5][step - 1] }, (_x, i) => [`event${i + 1}`, `ol > li:nth-child(${i + 1})`])),
      uploadV1: 'ol > li:nth-child(1)',
      ...(step >= 2 ? aiEventTags(2, 'ai') : {}),
      ...(step >= 3 ? { version: { text: 'Version 2', closest: BADGE }, uploadV2: event(3), ...aiEventTags(4, 'lastAi') } : {}),
      ...(step === 4 ? { approvalEvent: event(5), approvalBadge: `${event(5)} ${BADGE}`, approvalBody: `${event(5)} p` } : {}),
      replyText: 'textarea',
    },
  })),

  // Close-ups at 4x.
  { ...thread(2), id: 'macro-ai-event', viewport: MACRO, clip: { sel: `${event(2)}`, pad: 12 }, tag: aiEventTags(2, 'ai') },
  { ...thread(3), id: 'macro-ai-pass', viewport: MACRO, clip: { sel: `${event(4)}`, pad: 12 }, tag: aiEventTags(4, 'ai') },
  { id: 'macro-lpkc-tiles', url: '/lpkc', viewport: MACRO, waitFor: '[data-report-row]', clip: { sel: '[data-tiles]', pad: 12 }, tag: { tileWaiting: tile('Waiting'), tileBeingChecked: tile('Being checked'), tileChangesNeeded: tile('Changes needed'), tileApproved: tile('Approved') } },
  { id: 'macro-lpkc-queue', url: '/lpkc', viewport: MACRO, waitFor: '[data-report-row]', clip: { sel: `main ${CARD}`, pad: 12 }, tag: { ...queueRows, heroRow: row('Nur Aisyah Razak'), aiPass: '[data-ai-check="pass"]', aiFix: '[data-ai-check="fix"]', aiChecking: '[data-ai-check="checking"]' } },
  { ...thread(3), id: 'macro-lpkc-approve', viewport: MACRO, clip: { sel: reply, pad: 12 }, tag: { replyText: 'main textarea', verdictBeingChecked: button('Being checked', reply), verdictChangesNeeded: button('Changes needed', reply), approveButton: button('Approved', reply) } },
]

export default [...students, ...student, ...enrolment, ...authoring, ...marking, ...appointments, ...insight, ...dashboards, ...trainer, ...lpkc]
