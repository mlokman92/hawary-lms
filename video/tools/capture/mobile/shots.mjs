// The film's frames of the two phone apps.
//
//   node tools/capture/mobile/run.mjs student [ids…] --serve
//   node tools/capture/mobile/run.mjs academy [ids…] --serve
//
// -> video/public/shots/student/<id>.png + .json, video/public/shots/academy/<id>.png + .json
//
// Every frame is 390 x 763 CSS px at 3x (the film draws its own status bar and
// home indicator around it). `full: true` adds <id>-full: the same screen in a
// viewport tall enough for everything it scrolls.
//
// WHO AND WHAT
//   Student app   Nur Aisyah Razak, over `money` — the web learner's partition, so her quiz,
//                 her draft, her session and her invoice are the same rows the browser shows.
//   Academy app   Siti Hajar Ismail (trainer) over `teaching` — the web's marking queues;
//                 Hakim Zulkifli (director) over `money` for the money screens.
//   `mobile` is always on top (announcements, attachments, a fuller bell).
//
// THE CLOCK (`now`, Malaysian wall time; default 2026-10-07T11:55)
//   2026-10-06T16:21      in the middle of Kuiz 1
//   2026-10-07T09:10      LPKC not sent yet
//   2026-10-07T09:12:20   version 1 sent, the AI is reading it
//   2026-10-07T09:30      Hawary AI: 3 points to fix
//   2026-10-07T11:55      Hawary AI: all 12 met — waiting for the trainer   (default)
//   2026-10-07T12:06      Siti Hajar approved

import { ID, uid } from '../fake/ids.js'

const C = ID.content.siri3
const COURSE = 'DKM Prasekolah Siri 3/2026'

// ---------------------------------------------------------------------------
// Steps that only touch what is drawn. (The tab screens stay mounted, hidden,
// under a pushed screen; shoot.mjs's own click-by-text would find their text.)
// ---------------------------------------------------------------------------

const VISIBLE = `const drawn = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden' };`

/** Tap the element showing this text (its button, if it is inside one). */
const tap = (text, { exact = true, nth = 0, wait = 350 } = {}) => [
  {
    eval: `(() => { ${VISIBLE}
      const norm = (s) => (s || '').replace(/\\s+/g, ' ').trim()
      const all = [...document.querySelectorAll('body *')].filter((e) => drawn(e) && (${exact} ? norm(e.innerText) === ${JSON.stringify(text)} : norm(e.innerText).includes(${JSON.stringify(text)})))
      const hits = all.filter((e) => !all.some((o) => o !== e && e.contains(o)))
      const el = ${nth === 'last' ? 'hits[hits.length - 1]' : `hits[${nth}]`}
      if (!el) throw new Error('tap: nothing drawn says ' + ${JSON.stringify(text)})
      el.scrollIntoView({ block: 'center', inline: 'center' })
      el.click()
    })()`,
  },
  { wait },
]

/** Tap by selector (aria-label, mostly), among what is drawn. */
const tapSel = (sel, { nth = 0, wait = 350 } = {}) => [
  {
    eval: `(() => { ${VISIBLE}
      const el = [...document.querySelectorAll(${JSON.stringify(sel)})].filter(drawn)[${nth}]
      if (!el) throw new Error('tapSel: nothing drawn matches ' + ${JSON.stringify(sel)})
      el.click()
    })()`,
  },
  { wait },
]

/** Type into the nth drawn text field (inputs and textareas, in document order). */
const fill = (nth, text) => [
  {
    eval: `(() => { ${VISIBLE}
      const el = [...document.querySelectorAll('input:not([type="file"]):not([type="date"]), textarea')].filter(drawn)[${nth}]
      if (!el) throw new Error('fill: there is no drawn field #${nth}')
      document.querySelectorAll('[data-cap-field]').forEach((e) => e.removeAttribute('data-cap-field'))
      el.setAttribute('data-cap-field', '1')
      el.setAttribute('spellcheck', 'false')   // a desktop browser's red squiggles are not a phone's
    })()`,
  },
  { type: { sel: '[data-cap-field="1"]', text } },
  { eval: `document.activeElement && document.activeElement.blur()` },
  { wait: 150 },
]

/** Scroll the screen's own scroller (the tallest drawn one). `to`: px, or 'end'. */
const scroll = (to) => [
  {
    eval: `(() => { ${VISIBLE}
      let best = null
      for (const el of document.querySelectorAll('body *')) {
        if (!drawn(el)) continue
        const cs = getComputedStyle(el)
        if (!/(auto|scroll)/.test(cs.overflowY) || el.scrollHeight - el.clientHeight < 4 || el.getBoundingClientRect().width < 200) continue
        if (!best || el.scrollHeight > best.scrollHeight) best = el
      }
      if (best) best.scrollTop = ${to === 'end' ? 'best.scrollHeight' : Number(to)}
    })()`,
  },
  { wait: 200 },
]

/** Bring a line of text to a height on the screen (px from the top of the viewport). */
const scrollTo = (text, top = 140) => [
  {
    eval: `(() => { ${VISIBLE}
      const norm = (s) => (s || '').replace(/\\s+/g, ' ').trim()
      const all = [...document.querySelectorAll('body *')].filter((e) => drawn(e) && norm(e.innerText).includes(${JSON.stringify(text)}))
      const el = all.filter((e) => !all.some((o) => o !== e && e.contains(o)))[0]
      if (!el) throw new Error('scrollTo: nothing drawn says ' + ${JSON.stringify(text)})
      let p = el.parentElement
      while (p && !(/(auto|scroll)/.test(getComputedStyle(p).overflowY) && p.scrollHeight - p.clientHeight > 4)) p = p.parentElement
      if (p) p.scrollTop += el.getBoundingClientRect().top - ${top}
    })()`,
  },
  { wait: 200 },
]

/**
 * The phone's file picker, answered. The web target opens an <input type=file>;
 * this hands it files of the cast's names and sizes instead of opening a dialog.
 */
const pickFiles = (files) => [
  {
    eval: `(() => {
      const files = ${JSON.stringify(files)}
      const feed = (input) => {
        const dt = new DataTransfer()
        for (const f of files) dt.items.add(new File([new Uint8Array(f.size)], f.name, { type: f.type }))
        input.files = dt.files
        setTimeout(() => realDispatch.call(input, new Event('change', { bubbles: true })), 30)
      }
      // expo-document-picker opens its <input> with a synthetic click event;
      // expo-image-picker calls .click(). Both end here.
      const realClick = HTMLInputElement.prototype.click
      const realDispatch = EventTarget.prototype.dispatchEvent
      HTMLInputElement.prototype.click = function () {
        return this.type === 'file' ? feed(this) : realClick.call(this)
      }
      HTMLInputElement.prototype.dispatchEvent = function (event) {
        if (this.type === 'file' && event.type === 'click') {
          feed(this)
          return true
        }
        return realDispatch.call(this, event)
      }
    })()`,
  },
]

const flat = (...parts) => parts.flat()

// ---------------------------------------------------------------------------
// Marks every screen of a kind has
// ---------------------------------------------------------------------------

/** A tab: the big title, the bell, the bar. */
const tabChrome = (title) => ({
  header: { text: title, exact: true, nth: 0, wide: true },
  title: { text: title, exact: true, nth: 0 },
  bell: '[aria-label="Notifications"]',
  tabbar: '[role="tablist"]',
  'tab-active': '[role="tablist"] [aria-selected="true"]',
})

/** A pushed screen: the navigation bar with its back arrow and title. */
const pushedChrome = () => ({
  header: { sel: 'h1[role="heading"]', wide: true },
  back: 'a[aria-label$="back"]',
  'nav-title': 'h1[role="heading"]',
})

const PDF = 'application/pdf'
const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'

// ===========================================================================
// STUDENT — Nur Aisyah Razak
// ===========================================================================

const S = { db: 'money' }
const REPORT = `/reports/${ID.hero.report}`

const threadMarks = {
  ...pushedChrome(),
  title: { text: 'LPKC, slide dan portfolio', exact: true },
  thread: { text: 'sent this for checking', card: true },
  'event-v1': { text: 'Nur Aisyah Razak sent this for checking', up: 2 },
  'file-v1': { text: 'LPKC_Nur_Aisyah_v1.pdf', up: 2 },
}

export const student = [
  // 1 -------------------------------------------------------------------------
  {
    id: 'sign-in',
    url: '/',
    as: 'anon',
    mark: {
      logo: 'img',
      title: { text: 'Sign in', exact: true, nth: 0 },
      subtitle: { text: 'Welcome back', exact: false },
      card: { text: 'Email', exact: true, card: true },
      email: { sel: 'input', nth: 0 },
      password: { sel: 'input', nth: 1 },
      submit: { text: 'Sign in', exact: true, nth: 1, button: true },
      language: { text: 'Bahasa Melayu', exact: true, up: 2 },
    },
  },
  {
    id: 'sign-in-filled',
    url: '/',
    as: 'anon',
    steps: flat(fill(0, 'aisyah.razak@mail.example'), fill(1, 'kasihsayang2026')),
    mark: {
      logo: 'img',
      card: { text: 'Email', exact: true, card: true },
      email: { sel: 'input', nth: 0 },
      password: { sel: 'input', nth: 1 },
      submit: { text: 'Sign in', exact: true, nth: 1, button: true },
    },
  },

  // 2 -------------------------------------------------------------------------
  {
    id: 'home',
    url: '/',
    ...S,
    full: true,
    mark: {
      ...tabChrome('Dashboard'),
      'tile-overdue': { text: 'Overdue', exact: true, card: true },
      'tile-due': { text: 'Due this week', exact: true, card: true },
      'tile-awaiting': { text: 'Awaiting marks', exact: true, card: true },
      'tile-marked': { text: 'Marked', exact: true, card: true },
      'up-next': { text: 'Tugasan 1: Rancangan Aktiviti Harian', card: true },
      'row-tugasan': { text: 'Tugasan 1: Rancangan Aktiviti Harian', row: true },
    },
  },

  // 3 -------------------------------------------------------------------------
  {
    id: 'courses',
    url: '/courses',
    ...S,
    mark: {
      ...tabChrome('My courses'),
      course: { text: COURSE, card: true },
      'course-title': { text: COURSE, exact: true },
    },
  },
  {
    id: 'course',
    url: `/courses/${ID.course.siri3}`,
    ...S,
    full: true,
    mark: {
      ...pushedChrome(),
      title: { text: COURSE, exact: true, nth: 1 },
      'week-1': { text: 'Perkembangan Kanak-Kanak 0–4 Tahun', card: true },
      'week-1-title': { text: 'Week 1', exact: true },
      'row-note': { text: 'Perkembangan Kanak-Kanak 0–4 Tahun', row: true },
      'row-material': { text: 'Slaid Kuliah Week 1', row: true },
      'row-quiz': { text: 'Kuiz 1: Perkembangan Fizikal', row: true },
      'row-tugasan': { text: 'Tugasan 1: Rancangan Aktiviti Harian', row: true },
    },
  },

  // 4 -------------------------------------------------------------------------
  {
    id: 'note',
    url: `/notes/${C.week1.notes[0]}`,
    ...S,
    full: true,
    mark: { ...pushedChrome(), body: 'iframe' },
  },

  // 5 -------------------------------------------------------------------------
  {
    id: 'assessment',
    url: `/assessments/${C.week1.assessment}`,
    ...S,
    now: '2026-10-06T16:21',
    full: true,
    mark: {
      ...pushedChrome(),
      timer: 'div:has(> h1[role="heading"]) + div > div',
      title: { text: 'Kuiz 1: Perkembangan Fizikal', exact: true },
      instructions: { text: 'Instructions', exact: true, card: true },
      'question-1': { text: '1. ', exact: false, card: true },
      'option-picked': { text: '6–8 bulan', exact: true, button: true },
      footer: { text: 'Submit assessment', exact: true, wide: true },
      submit: { text: 'Submit assessment', exact: true, button: true },
    },
  },
  {
    id: 'assessment-landing',
    url: `/assessments/${C.week1.assessment}`,
    ...S,
    mark: {
      ...pushedChrome(),
      title: { text: 'Kuiz 1: Perkembangan Fizikal', exact: true },
      attempt: { text: 'Attempt 1', exact: true, row: true },
      score: { text: '18 / 20', exact: false },
      status: { text: 'Marked', exact: true, up: 1 },
      start: { text: 'Start assessment', exact: true, button: true },
    },
  },
  {
    id: 'assessment-result',
    url: `/assessments/${C.week1.assessment}`,
    ...S,
    steps: flat(tap('Attempt 1')),
    full: true,
    mark: {
      ...pushedChrome(),
      title: { text: 'Kuiz 1: Perkembangan Fizikal', exact: true },
      result: { text: 'Score: 18 / 20', exact: false, card: true },
      'question-1': { text: '1. ', exact: false, card: true },
    },
  },

  // 6 -------------------------------------------------------------------------
  {
    id: 'assignment',
    url: `/assignments/${C.week1.assignment}`,
    ...S,
    full: true,
    mark: {
      ...pushedChrome(),
      title: { text: 'Tugasan 1: Rancangan Aktiviti Harian', exact: true },
      brief: { text: 'Brief', exact: true, card: true },
      submission: { text: 'Rancangan_Aktiviti_Harian.pdf', card: true },
      'file-1': { text: 'Rancangan_Aktiviti_Harian.pdf', up: 2 },
      'file-2': { text: 'Jadual_kumpulan_3-4_tahun.jpg', up: 2 },
      attach: { text: 'Attach files', exact: true, button: true },
      submit: { text: 'Submit', exact: true, button: true },
    },
  },
  {
    id: 'assignment-attach',
    url: `/assignments/${C.week1.assignment}`,
    ...S,
    steps: flat(scrollTo('Rancangan_Aktiviti_Harian.pdf', 250), tap('Attach files'), [{ wait: 450 }]),
    mark: {
      sheet: { text: 'Take a photo', exact: true, up: 6 },
      camera: { text: 'Take a photo', exact: true, row: true },
      photos: { text: 'Choose photos', exact: true, row: true },
      files: { text: 'Choose a file', exact: true, row: true },
    },
  },

  // 7 -------------------------------------------------------------------------
  {
    id: 'work',
    url: '/work?state=all',
    ...S,
    mark: {
      ...pushedChrome(),
      filters: { text: 'To do', exact: true, button: true, up: 1 },
      list: { text: 'Kuiz 1: Perkembangan Fizikal', card: true },
      'row-marked': { text: 'Kuiz 1: Perkembangan Fizikal', row: true },
      'row-draft': { text: 'Tugasan 1: Rancangan Aktiviti Harian', row: true },
    },
  },

  // 8 -------------------------------------------------------------------------
  {
    id: 'reports',
    url: '/reports',
    ...S,
    mark: {
      ...tabChrome('LPKC'),
      row: { text: 'LPKC, slide dan portfolio', row: true },
      status: { text: 'Being checked', exact: true, up: 1 },
    },
  },
  {
    // The same tab once Hawary AI has answered version 1…
    id: 'reports-changes',
    url: '/reports',
    ...S,
    now: '2026-10-07T09:30',
    mark: {
      ...tabChrome('LPKC'),
      row: { text: 'LPKC, slide dan portfolio', row: true },
      status: { text: 'Changes needed', exact: true, up: 1 },
    },
  },
  {
    // …and once Siti Hajar has approved version 2.
    id: 'reports-approved',
    url: '/reports',
    ...S,
    now: '2026-10-07T12:06',
    mark: {
      ...tabChrome('LPKC'),
      row: { text: 'LPKC, slide dan portfolio', row: true },
      status: { text: 'Approved', exact: true, up: 1 },
    },
  },
  {
    // Before anything is sent: the course is a row with a Send button.
    id: 'reports-empty',
    url: '/reports',
    ...S,
    now: '2026-10-07T09:10',
    mark: {
      ...tabChrome('LPKC'),
      row: { text: COURSE, row: true },
      send: { text: 'Send', exact: true, button: true },
    },
  },
  {
    // The upload: the sheet with the title typed and the cast's two files picked.
    id: 'report-upload',
    url: '/reports',
    ...S,
    now: '2026-10-07T09:11',
    steps: flat(
      pickFiles([
        { name: 'LPKC_Nur_Aisyah_v1.pdf', size: 2516582, type: PDF },
        { name: 'Slide_Pembentangan.pptx', size: 5872025, type: PPTX },
      ]),
      tap('Send'),
      [{ wait: 450 }],
      fill(0, 'LPKC, slide dan portfolio'),
      tap('Attach files'),
      [{ wait: 450 }],
      tap('Choose a file'),
      [{ wait: 900 }],
    ),
    settle: 700,
    mark: {
      sheet: { text: 'What are you sending?', exact: false, up: 4 },
      'file-1': { text: 'LPKC_Nur_Aisyah_v1.pdf', up: 2 },
      'file-2': { text: 'Slide_Pembentangan.pptx', up: 2 },
      send: { text: 'Send for checking', exact: false, button: true },
    },
  },
  {
    id: 'report-1',
    url: REPORT,
    ...S,
    now: '2026-10-07T09:12:20',
    full: true,
    mark: { ...threadMarks, status: { text: 'Waiting', exact: true, up: 1 }, resubmit: { text: 'Send a new version', exact: true, button: true } },
  },
  {
    id: 'report-2',
    url: REPORT,
    ...S,
    now: '2026-10-07T09:30',
    full: true,
    mark: {
      ...threadMarks,
      status: { text: 'Changes needed', exact: true, nth: 0, up: 1 },
      resubmit: { text: 'Send a new version', exact: true, button: true },
      'event-ai': { text: 'Hawary AI updated the status', up: 2 },
      'ai-verdict': { text: 'Changes needed', exact: true, nth: 1, up: 1 },
      'ai-body': { text: 'AI check complete. 3 points to fix', exact: false },
    },
  },
  {
    id: 'report-3',
    url: REPORT,
    ...S,
    now: '2026-10-07T12:06',
    full: true,
    mark: {
      ...threadMarks,
      status: { text: 'Approved', exact: true, nth: 0, up: 1 },
      version: { text: 'Version 2', exact: true, up: 1 },
    },
  },
  {
    // The same approved thread, scrolled to how it ends: v2, "all 12 met", approved.
    id: 'report-3-end',
    url: REPORT,
    ...S,
    now: '2026-10-07T12:06',
    steps: flat(scrollTo('Nur Aisyah Razak sent version 2', 96)),
    mark: {
      ...pushedChrome(),
      'event-v2': { text: 'Nur Aisyah Razak sent version 2', up: 2 },
      'file-v2': { text: 'LPKC_Nur_Aisyah_v2.pdf', up: 2 },
      'event-ai-pass': { text: 'Hawary AI updated the status', nth: 1, up: 2 },
      'ai-pass-body': { text: 'All 12 checklist items are met', exact: false },
      'event-approved': { text: 'Siti Hajar Ismail updated the status', up: 2 },
      approved: { text: 'Approved', exact: true, nth: 0, up: 1 },
      'approved-body': { text: 'Approved. Well done, Aisyah.', exact: true },
    },
  },

  // 9 -------------------------------------------------------------------------
  {
    id: 'appointments',
    url: '/appointments',
    ...S,
    full: true,
    mark: {
      ...tabChrome('Appointments'),
      'book-title': { text: 'Book a session', exact: true },
      'day-open': { text: 'Thu, 8 Oct', exact: true, card: true },
      'slot-first': { sel: '[role="radio"]', nth: 0 },
    },
  },
  {
    id: 'appointments-picked',
    url: '/appointments',
    ...S,
    steps: flat(
      tap('11:00', { nth: 0 }),
      tap('Choose an instructor'),
      [{ wait: 450 }],
      tap('Siti Hajar Ismail', { nth: 'last' }),
      [{ wait: 450 }],
      fill(0, 'Semakan pembetulan LPKC'),
      scrollTo('Book a session', 96),
    ),
    full: true,
    mark: {
      ...tabChrome('Appointments'),
      'day-open': { text: 'Thu, 8 Oct', exact: true, card: true },
      'slot-picked': { text: '11:00', exact: true, nth: 0, button: true },
      instructor: { text: 'Siti Hajar Ismail', exact: true, nth: 0, up: 1 },
      book: { text: 'Book · 11:00', exact: false, button: true },
    },
  },
  {
    // What she already holds: the session of 13 October, and the one that is over.
    id: 'appointments-mine',
    url: '/appointments',
    ...S,
    steps: flat(scrollTo('My sessions', 96)),
    mark: {
      ...tabChrome('Appointments'),
      'mine-title': { text: 'My sessions', exact: true },
      session: { text: 'Bincang pembentangan akhir', exact: false, card: true },
      calendar: { text: 'Add to calendar', exact: true, button: true },
    },
  },

  // 10 ------------------------------------------------------------------------
  {
    id: 'billing',
    url: '/billing',
    ...S,
    mark: {
      ...pushedChrome(),
      'tile-paid': { text: 'Paid', exact: true, card: true },
      'tile-outstanding': { text: 'Outstanding', exact: true, card: true },
      invoice: { text: 'INV-2026-0412', row: true },
      status: { text: 'Partially paid', exact: true, up: 1 },
    },
  },
  {
    id: 'invoice',
    url: `/billing/${ID.hero.invoice}`,
    ...S,
    full: true,
    mark: {
      ...pushedChrome(),
      title: { text: 'INV-2026-0412', exact: true, nth: 1 },
      items: { text: 'Yuran DKM Prasekolah Siri 3/2026', card: true },
      totals: { text: 'Balance', exact: true, card: true },
      balance: { text: 'Balance', exact: true, up: 1 },
      payments: { text: 'Maybank2u', exact: false, card: true },
      pay: { text: 'Pay online', exact: true, button: true },
    },
  },

  // 11 ------------------------------------------------------------------------
  {
    id: 'announcements',
    url: '/announcements',
    ...S,
    full: true,
    mark: {
      ...pushedChrome(),
      'card-1': { text: 'Kelas ganti Sabtu ini', exact: true, card: true },
      'card-2': { text: 'Tarikh akhir LPKC', exact: true, card: true },
    },
  },
  {
    id: 'notifications',
    url: '/notifications',
    ...S,
    full: true,
    mark: {
      ...pushedChrome(),
      'mark-all': { text: 'Mark all read', exact: true },
      list: { text: 'Your report: Being checked', card: true },
      'row-report': { text: 'Your report: Being checked', row: true },
      'row-session': { text: 'Session booked with Siti Hajar Ismail', nth: 0, row: true },
      'row-payment': { text: 'Payment received for INV-2026-0412', row: true },
      'row-work': { text: 'Due soon: Tugasan 1: Rancangan Aktiviti Harian', row: true },
    },
  },
  {
    // The bell after the approval has landed.
    id: 'notifications-approved',
    url: '/notifications',
    ...S,
    now: '2026-10-07T12:06',
    mark: {
      ...pushedChrome(),
      list: { text: 'Your report: Approved', card: true },
      'row-approved': { text: 'Your report: Approved', row: true },
    },
  },

  // 12 ------------------------------------------------------------------------
  {
    id: 'more',
    url: '/more',
    ...S,
    mark: {
      ...tabChrome('More'),
      menu: { text: 'My work', exact: true, card: true },
      'row-billing': { text: 'Billing', exact: false, row: true },
      'row-announcements': { text: 'Announcements', exact: true, row: true },
    },
  },
  {
    id: 'profile',
    url: '/profile',
    ...S,
    full: true,
    mark: { ...pushedChrome(), record: { text: 'HA-2026-0318', card: true } },
  },
]

// ===========================================================================
// ACADEMY — Siti Hajar Ismail (trainer); Hakim Zulkifli (director) for money
// ===========================================================================

const T = { db: 'teaching' }
const D = { as: 'director', db: 'money' }
const THREAD = `/lpkc/${ID.hero.report}`
/** Damia Qistina Roslan's Tugasan 1 — the hand-in the web's grading shot opens too. */
const HERO_SUBMISSION = uid('submission', 'siri3/week1/331')
const BATCH_SEP = uid('incentive-batch', '2026-09')

export const academy = [
  // 13 ------------------------------------------------------------------------
  {
    id: 'home',
    url: '/',
    ...T,
    full: true,
    mark: {
      ...tabChrome('Today'),
      session: { text: 'Farhana Yusof', exact: true, card: true },
      'session-time': { text: '14:00', exact: true, up: 1 },
      marking: { text: 'Assessments', exact: true, card: true },
      'row-assessments': { text: 'Assessments', exact: true, row: true },
      'row-assignments': { text: 'Assignments', exact: true, row: true },
      reports: { text: 'Hannah Maisarah Jalil', card: true },
      'row-aisyah': { text: 'Nur Aisyah Razak', row: true },
    },
  },

  // 14 ------------------------------------------------------------------------
  {
    id: 'marking',
    url: '/marking',
    ...T,
    full: true,
    mark: {
      ...tabChrome('Marking'),
      kinds: { text: 'Assignments', exact: true, nth: 0, button: true, up: 1 },
      'chip-awaiting': { text: 'Awaiting marks', exact: false, button: true },
      list: { text: 'Damia Qistina Roslan', card: true },
      'row-first': { text: 'Damia Qistina Roslan', row: true },
    },
  },
  {
    id: 'marking-assessments',
    url: '/marking?kind=assessment',
    ...T,
    mark: {
      ...tabChrome('Marking'),
      'chip-awaiting': { text: 'Awaiting marks', exact: false, button: true },
      list: { text: 'Puteri Balqis Azman', card: true },
      'row-first': { text: 'Puteri Balqis Azman', row: true },
    },
  },
  {
    id: 'grade',
    url: `/grading/submissions/${HERO_SUBMISSION}`,
    ...T,
    steps: flat(
      fill(0, '88'),
      fill(1, 'Rancangan yang kemas, Damia. Objektif setiap slot jelas dan langkah keselamatan lengkap. Tambah satu aktiviti muzik pada sesi petang.'),
      scroll(0),
    ),
    full: true,
    mark: {
      ...pushedChrome(),
      student: { text: 'Damia Qistina Roslan', exact: true },
      brief: { text: 'Brief', exact: true, card: true },
      work: { text: 'RANCANGAN AKTIVITI HARIAN', exact: false, card: true },
      'file-1': { text: 'Rancangan_Aktiviti_Harian_Damia.pdf', up: 2 },
      marking: { text: 'Mark (out of 100)', exact: true, card: true },
      mark: { sel: 'input', nth: 0 },
      feedback: { sel: 'textarea', nth: 0 },
      save: { text: 'Save & return to student', exact: true, button: true },
    },
  },
  {
    // The same hand-in, scrolled to where the mark is given.
    id: 'grade-mark',
    url: `/grading/submissions/${HERO_SUBMISSION}`,
    ...T,
    steps: flat(
      fill(0, '88'),
      fill(1, 'Rancangan yang kemas, Damia. Objektif setiap slot jelas dan langkah keselamatan lengkap. Tambah satu aktiviti muzik pada sesi petang.'),
      scroll('end'),
    ),
    mark: {
      ...pushedChrome(),
      'file-1': { text: 'Rancangan_Aktiviti_Harian_Damia.pdf', up: 2 },
      marking: { text: 'Mark (out of 100)', exact: true, card: true },
      mark: { sel: 'input', nth: 0 },
      feedback: { sel: 'textarea', nth: 0 },
      save: { text: 'Save & return to student', exact: true, button: true },
    },
  },

  // 15 ------------------------------------------------------------------------
  {
    // Siti Hajar's own queue: RLS gives a trainer the reports assigned to her.
    id: 'lpkc',
    url: '/lpkc',
    ...T,
    steps: flat(tap('All'), scroll(0)),
    mark: {
      ...tabChrome('LPKC'),
      chips: { text: 'All', exact: true, button: true, up: 1 },
      search: { sel: 'input', nth: 0, up: 1 },
      list: { text: 'Nur Aisyah Razak', card: true },
      'row-aisyah': { text: 'Nur Aisyah Razak', row: true },
      'status-aisyah': { text: 'Being checked', exact: true, in: '[data-cap-row-aisyah="1"]', up: 1 },
      'row-aina': { text: 'Aina Sofea Rosli', row: true },
      'row-hannah': { text: 'Hannah Maisarah Jalil', row: true },
    },
  },
  {
    id: 'lpkc-checking',
    url: '/lpkc',
    ...T,
    steps: flat(tap('Being checked', { nth: 0 })),
    mark: {
      ...tabChrome('LPKC'),
      'chip-active': { text: 'Being checked', exact: true, nth: 0, button: true },
      list: { text: 'Nur Aisyah Razak', card: true },
      'row-aisyah': { text: 'Nur Aisyah Razak', row: true },
    },
  },
  {
    // The whole academy's queue — cast.lpkc.queue, all eight — as an admin sees it.
    id: 'lpkc-all',
    url: '/lpkc',
    as: 'director',
    ...T,
    steps: flat(tap('All'), scroll(0)),
    full: true,
    mark: {
      ...tabChrome('LPKC'),
      list: { text: 'Nur Aisyah Razak', card: true },
      'row-aisyah': { text: 'Nur Aisyah Razak', row: true },
      'row-puteri': { text: 'Puteri Balqis Azman', row: true },
    },
  },
  {
    id: 'lpkc-thread',
    url: THREAD,
    ...T,
    full: true,
    mark: {
      ...pushedChrome(),
      title: { text: 'LPKC, slide dan portfolio', exact: true },
      status: { text: 'Being checked', exact: true, nth: 0, up: 1 },
      version: { text: 'Version 2', exact: true, up: 1 },
      student: { text: 'Nur Aisyah Razak · HA-2026-0318', exact: false },
      thread: { text: 'sent this for checking', card: true },
      'event-ai': { text: 'Hawary AI updated the status', nth: 0, up: 2 },
    },
  },
  {
    // The moment the film is about: the AI has said "all 12 met" and Approve is on screen.
    id: 'lpkc-thread-approve',
    url: THREAD,
    ...T,
    steps: flat(scrollTo('Nur Aisyah Razak sent version 2', 78)),
    mark: {
      ...pushedChrome(),
      'event-v2': { text: 'Nur Aisyah Razak sent version 2', up: 2 },
      'file-v2': { text: 'LPKC_Nur_Aisyah_v2.pdf', up: 2 },
      'event-ai-pass': { text: 'Hawary AI updated the status', nth: 1, up: 2 },
      'ai-verdict': { text: 'Being checked', exact: true, nth: 0, up: 1 },
      'ai-pass-body': { text: 'All 12 checklist items are met', exact: false },
      reply: { sel: 'textarea', nth: 0 },
      verdicts: { text: 'Approved', exact: true, button: true, up: 1 },
      approve: { text: 'Approved', exact: true, button: true },
    },
  },
  {
    // …and after she has pressed it (the film's clock moves to 12:06).
    id: 'lpkc-thread-approved',
    url: THREAD,
    ...T,
    now: '2026-10-07T12:06',
    steps: flat(scrollTo('Nur Aisyah Razak sent version 2', 78)),
    mark: {
      ...pushedChrome(),
      'event-ai-pass': { text: 'Hawary AI updated the status', nth: 1, up: 2 },
      'event-approved': { text: 'Siti Hajar Ismail updated the status', up: 2 },
      'approved-badge': { text: 'Approved', exact: true, nth: 0, up: 1 },
      'approved-body': { text: 'Approved. Well done, Aisyah.', exact: true },
    },
  },

  // 16 ------------------------------------------------------------------------
  {
    // The roster, newest first: the five who asked to join this week lead it.
    id: 'students',
    url: '/students',
    ...T,
    full: true,
    mark: {
      ...tabChrome('Students'),
      search: { sel: 'input', nth: 0, up: 1 },
      add: { text: 'Add Student', exact: true, button: true },
      list: { text: 'HA-2026-0805', card: true },
      'row-first': { text: 'HA-2026-0805', row: true },
    },
  },
  {
    // Search is the way in: a few letters find the hero among her namesakes.
    id: 'students-search',
    url: '/students',
    ...T,
    steps: flat(fill(0, 'aisyah ra'), [{ wait: 300 }]),
    mark: {
      ...tabChrome('Students'),
      search: { sel: 'input', nth: 0, up: 1 },
      list: { text: 'Nur Aisyah Razak', card: true },
      'row-aisyah': { text: 'Nur Aisyah Razak', row: true },
    },
  },
  {
    id: 'student',
    url: `/students/${ID.hero.student}`,
    ...T,
    full: true,
    mark: {
      ...pushedChrome(),
      name: { text: 'Nur Aisyah Razak', exact: true },
      call: { text: 'Call', exact: true, button: true },
      whatsapp: { text: 'WhatsApp', exact: true, button: true },
      personal: { text: 'aisyah.razak@mail.example', card: true },
      enrolled: { text: COURSE, card: true },
    },
  },
  {
    // The same record for an admin: what she owes, and where an incentive is paid.
    id: 'student-admin',
    url: `/students/${ID.hero.student}`,
    ...D,
    full: true,
    mark: {
      ...pushedChrome(),
      name: { text: 'Nur Aisyah Razak', exact: true },
      billing: { text: 'INV-2026-0412', card: true },
    },
  },

  // 17 ------------------------------------------------------------------------
  {
    id: 'appointments',
    url: '/appointments',
    ...T,
    steps: flat(tapSel('[aria-label="Next week"]'), [{ wait: 400 }]),
    full: true,
    mark: {
      ...pushedChrome(),
      week: { text: '12 – 18 Oct 2026', exact: true },
      prev: '[aria-label="Previous week"]',
      next: '[aria-label="Next week"]',
      'day-tuesday': { text: 'Tue, 13 Oct', exact: true },
      'row-aisyah': { text: 'Nur Aisyah Razak', card: true },
    },
  },
  {
    // The whole academy's week, for an admin: four trainers.
    id: 'appointments-all',
    url: '/appointments',
    as: 'director',
    ...T,
    steps: flat(tapSel('[aria-label="Next week"]'), [{ wait: 400 }]),
    full: true,
    mark: { ...pushedChrome(), 'row-aisyah': { text: 'Nur Aisyah Razak', row: true } },
  },

  // 18 ------------------------------------------------------------------------
  {
    id: 'payments',
    url: '/payments',
    ...D,
    full: true,
    mark: {
      ...pushedChrome(),
      'tile-collected': { text: 'Collected', exact: true, nth: 0, card: true },
      'tile-outstanding': { text: 'Outstanding', exact: true, nth: 0, card: true },
      list: { text: 'INV-2026-0412', card: true },
      'row-aisyah': { text: 'INV-2026-0412', row: true },
    },
  },
  {
    id: 'payment',
    url: `/payments/${ID.hero.invoice}`,
    ...D,
    full: true,
    mark: {
      ...pushedChrome(),
      name: { text: 'Nur Aisyah Razak', exact: true },
      items: { text: 'Yuran DKM Prasekolah Siri 3/2026', card: true },
      totals: { text: 'Balance', exact: true, card: true },
      payments: { text: 'Maybank2u', exact: false, card: true },
      record: { text: 'Record payment', exact: true, button: true },
    },
  },
  // (No frame of the "Record payment" sheet: its date field is a browser date
  // input on the web target — a stand-in the phone never shows.)

  // 19 ------------------------------------------------------------------------
  {
    id: 'incentives',
    url: '/incentives',
    ...D,
    mark: {
      ...pushedChrome(),
      list: { text: 'September 2026', card: true },
      'row-september': { text: 'September 2026', row: true },
    },
  },
  {
    id: 'incentive',
    url: `/incentives/${BATCH_SEP}`,
    ...D,
    full: true,
    mark: {
      ...pushedChrome(),
      title: { text: 'September 2026', exact: true },
      status: { text: 'Sent', exact: true, up: 1 },
      list: { text: 'Nur Aisyah Razak', card: true },
      'row-aisyah': { text: 'Nur Aisyah Razak', row: true },
    },
  },

  // 20 ------------------------------------------------------------------------
  {
    id: 'announcements',
    url: '/announcements',
    ...T,
    full: true,
    mark: {
      ...pushedChrome(),
      new: '[aria-label="New announcement"]',
      'card-1': { text: 'Kelas ganti Sabtu ini', exact: true, card: true },
    },
  },
  {
    id: 'announcement-compose',
    url: '/announcements',
    ...T,
    steps: flat(
      tapSel('[aria-label="New announcement"]'),
      [{ wait: 500 }],
      tap('Select'),
      [{ wait: 450 }],
      tap(COURSE, { nth: 0 }),
      [{ wait: 450 }],
      fill(0, 'Pembentangan akhir minggu depan'),
      fill(1, 'Slot pembentangan akhir dibuka mulai Isnin, 12 Oktober. Tempah sesi anda dalam aplikasi dan bawa slaid serta portfolio yang telah diluluskan.'),
    ),
    settle: 600,
    mark: {
      sheet: { text: 'Send to', exact: true, up: 3 },
      to: { text: COURSE, exact: true, nth: 0, up: 1 },
      title: { sel: 'input', nth: 0 },
      message: { sel: 'textarea', nth: 0 },
      post: { text: 'Send to students', exact: true, button: true },
    },
  },

  // more ------------------------------------------------------------------------
  {
    id: 'more',
    url: '/more',
    ...T,
    mark: { ...tabChrome('More'), menu: { text: 'Appointments', exact: true, card: true } },
  },
  {
    id: 'more-admin',
    url: '/more',
    ...D,
    mark: {
      ...tabChrome('More'),
      menu: { text: 'Appointments', exact: true, card: true },
      money: { text: 'Payments', exact: true, card: true },
    },
  },
  {
    id: 'sign-in',
    url: '/',
    as: 'anon',
    mark: { logo: 'img', title: { text: 'Sign in', exact: true, nth: 0 }, card: { text: 'Email', exact: true, card: true } },
  },
]
