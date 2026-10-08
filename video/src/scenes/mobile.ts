import './mobile.css'
import type { SceneCtx } from '../engine'
import type { Device, Layer, Shot, Split } from '../kit'
import { add, chip, click, gsap, h, hidePointer, leave, lift, liftDown, liftUp, moveTo, phone, popIn, popOut, put, rise, shot, stageBox, text, touch } from '../kit'
import { APP_ICON, APP_NAME, buzz, deliver, lockScreen, note, statusLight, statusParts } from '../os'

// Bars 37-42 (72.07-84.07s), 24 beats: the big section, brightest in beats 12-20.
// VO: beat 0.7 "It all lives in two mobile apps" | 5.2 "one for students," | 7.4 "one for the academy" |
//     10.3 "with instant notifications." (to 13.4) — then music only.
//
// A  beats 0-5     two phones, each under its own app icon; "Two apps."
// B  beats 5-10    one each: the named app steps to the front and shows its screens on the half-beats
// C  beats 10-24   the notification demo. The student phone takes the centre and sleeps; four pushes wake
//                  it (12, 14, 16, 18); a tap on the last opens the app at the screen that push is about
//                  (20-20.5); the Academy phone comes back and takes a push over its open app (22).
//
// The banners carry the sentences the product really pushes (supabase/functions/send-push `compose`),
// filled with the film's story: Aisyah's report, her session with Siti Hajar, her FPX payment.

const CLOCK = '12:05' // Siti Hajar approves the report at 12:05 pm on Wednesday 7 October (the thread says so)
const COURSE = 'DKM Prasekolah Siri 3/2026'
const REPORT = `LPKC, slide dan portfolio · ${COURSE}`

const PUSHES = [
  { at: 12, title: 'Hawary AI commented on your report', body: REPORT, kind: 'Feedback', icon: 'message-square-text' },
  { at: 14, title: 'Session booked', body: 'Tue, 13 Oct, 10:00 am · with Siti Hajar Ismail', kind: 'Bookings', icon: 'calendar-check' },
  { at: 16, title: 'Payment received', body: 'RM 900.00 · INV-2026-0412', kind: 'Payments', icon: 'banknote' },
  { at: 18, title: 'Your report: Approved', body: REPORT, kind: 'Approvals', icon: 'badge-check' },
] as const
const STAFF_PUSH = { title: 'A report to check', body: `Nur Aisyah Razak · ${REPORT}` }

interface Pose {
  cx: number
  cy: number
  scale: number
  rotationY: number
}
/** Where the two phones can stand. */
const P = {
  sA: { cx: 1050, cy: 654, scale: 0.84, rotationY: -12 },
  aA: { cx: 1510, cy: 654, scale: 0.84, rotationY: -12 },
  front: { cx: 960, cy: 540, scale: 1.1, rotationY: 0 },
  back: { cx: 1506, cy: 588, scale: 0.68, rotationY: -20 },
  hero: { cx: 1010, cy: 612, scale: 1.52, rotationY: 0 },
  pair: { cx: 960, cy: 540, scale: 1.13, rotationY: 0 },
  aEnd: { cx: 1550, cy: 540, scale: 1.13, rotationY: 0 },
} satisfies Record<string, Pose>

const pose = (d: Device, p: Pose) => ({ x: p.cx - d.w / 2, y: p.cy - d.h / 2, scale: p.scale, rotationY: p.rotationY })

/** The app's real icon as a home-screen tile (centre-anchored). */
function tile(app: 'student' | 'academy'): HTMLElement {
  const img = new Image()
  img.decoding = 'sync'
  img.src = APP_ICON[app]
  return h('div.mobile-tile', null, img)
}

/**
 * A banner must never truncate or spill. The kit's banner lets a title that is a few pixels too long push the
 * "now" into the right padding; a phone tightens such a title's tracking by a hair before it would truncate,
 * so do the same (the OS chrome's own CSS is left alone). Anything that still does not fit is said loudly.
 */
function settle(n: HTMLElement, what: string) {
  const [badge, col] = [...n.children] as HTMLElement[]
  const title = n.querySelector('.os-note-title') as HTMLElement
  const body = n.querySelector('.os-note-body') as HTMLElement | null
  const cs = getComputedStyle(n)
  const room = Math.ceil(n.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - parseFloat(cs.columnGap) - badge.offsetWidth)
  for (let k = 1; col.offsetWidth > room && k <= 7; k++) title.style.letterSpacing = `${(-0.012 - 0.006 * k).toFixed(3)}em`
  if (col.offsetWidth > room || title.scrollWidth > title.clientWidth + 1 || (body && body.scrollHeight > body.clientHeight + 1)) console.error(`[mobile] banner copy does not fit: ${what}`)
}

export default async function mobile({ root, tl, B, sfx, onFrame }: SceneCtx) {
  const [sHome, sCourse, sQuiz, sInvoice, sReport, aHome, aMarking, aLpkc, aStudents] = await Promise.all(
    ['student/home', 'student/course', 'student/assessment', 'student/invoice', 'student/report-3-end', 'academy/home', 'academy/marking', 'academy/lpkc', 'academy/students'].map(shot),
  )

  /** Headline type, shrunk if needed so it never crosses into the phone beside it. */
  const fit = (cls: string, str: string, size: number, maxW: number): Split => {
    const t = text(cls, str, { style: { fontSize: `${size}px`, whiteSpace: 'nowrap' } })
    add(root, t.el)
    const w = stageBox(t.el).w
    if (w > maxW) t.el.style.fontSize = `${Math.floor((size * maxW) / w)}px`
    return t
  }

  // ---------------------------------------------------------------- the two phones
  const pulse = h('div.mobile-pulse')
  add(root, pulse)
  const S = phone(sHome, { time: CLOCK })
  const A = phone(aHome, { time: CLOCK })
  add(root, A.el, S.el)
  const screenOf = (d: Device) => d.el.querySelector('.phone-screen') as HTMLElement
  const veilS = h('div.mobile-veil')
  const veilA = h('div.mobile-veil')
  screenOf(S).append(veilS)
  screenOf(A).append(veilA)

  // they are still rising as the whip lands
  gsap.set(S.el, { ...pose(S, P.sA), y: pose(S, P.sA).y + 330, rotationY: -28, transformOrigin: '50% 50%', zIndex: 2 })
  gsap.set(A.el, { ...pose(A, P.aA), y: pose(A, P.aA).y + 330, rotationY: -28, transformOrigin: '50% 50%', zIndex: 1 })
  tl.to(S.el, { ...pose(S, P.sA), duration: 1.0, ease: 'swift' }, B(-0.7))
  tl.to(A.el, { ...pose(A, P.aA), duration: 1.0, ease: 'swift' }, B(-0.4))

  /** A hard change of screen on the beat, with a small pop. */
  const swapTo = (d: Device, img: HTMLImageElement, s: Shot, at: number) => {
    const bar = statusParts(d)
    tl.set(img, { opacity: 1 }, at)
    tl.set(bar.status, { backgroundColor: s.topColor }, at)
    tl.set(bar.home, { backgroundColor: s.bottomColor }, at)
    tl.fromTo(d.scroll, { scale: 1.05 }, { scale: 1, duration: 0.24, ease: 'swift', immediateRender: false }, at)
    sfx('tick', at, 0.4)
  }
  /** Back to the home screen, while nobody is looking. */
  const goHome = (d: Device, imgs: HTMLImageElement[], at: number) => {
    const bar = statusParts(d)
    tl.set(imgs, { opacity: 0 }, at)
    tl.set(bar.status, { backgroundColor: d.shot.topColor }, at)
    tl.set(bar.home, { backgroundColor: d.shot.bottomColor }, at)
  }
  const sScreens = [sCourse, sQuiz, sInvoice]
  const aScreens = [aMarking, aLpkc, aStudents]
  const sImgs = sScreens.map((s) => S.layer(s))
  const aImgs = aScreens.map((s) => A.layer(s))

  // ---------------------------------------------------------------- A: two apps
  const COL = 116
  const kicker = text('t-kicker', 'Mobile')
  const head = fit('t-h1', '*Two* apps.', 128, 600)
  add(root, put(kicker.el, COL + 6, 426), put(head.el, COL, 474))
  rise(tl, kicker.words, B(0.4), { dur: 0.5 })
  rise(tl, head.words, B(1.6), { stagger: 0.09 })

  // each app's own icon over its phone, on "two" … "mobile"
  const tileS = tile('student')
  const tileA = tile('academy')
  const nameS = text('mobile-name', APP_NAME.student)
  const nameA = text('mobile-name', APP_NAME.academy)
  add(root, tileS, tileA, nameS.el, nameA.el)
  const OVER = { y: 148, scale: 0.75 }
  put(nameS.el, P.sA.cx - stageBox(nameS.el).w / 2, 210)
  put(nameA.el, P.aA.cx - stageBox(nameA.el).w / 2, 210)
  gsap.set(tileS, { x: P.sA.cx, ...OVER, scale: 0.3, opacity: 0 })
  gsap.set(tileA, { x: P.aA.cx, ...OVER, scale: 0.3, opacity: 0 })
  ;[
    { el: tileS, name: nameS, at: 2.5, pan: 0.1 },
    { el: tileA, name: nameA, at: 3, pan: 0.5 },
  ].forEach((t) => {
    tl.to(t.el, { opacity: 1, duration: 0.12, ease: 'none' }, B(t.at) - 0.12)
    tl.to(t.el, { scale: OVER.scale, duration: 0.45, ease: 'pop' }, B(t.at) - 0.12)
    rise(tl, t.name.words, B(t.at), { dur: 0.45, stagger: 0.04 })
    sfx('pop', B(t.at), 0.45, t.pan)
  })

  // ---------------------------------------------------------------- B: one each
  // The named app steps to the front; the other waits in the wings, washed out.
  const IN_COL = { x: COL + 64, y: 398, scale: 1 }
  const IN_WINGS = { x: P.back.cx, y: 226, scale: 0.5 }
  const ident = (kick: string, name: string) => {
    const [a, b, c] = name.split(' ')
    const id = { kick: text('t-kicker', kick), name: fit('t-h2', `${a}\n*${b}* ${c}`, 76, 540) }
    add(root, put(id.kick.el, COL + 6, 500), put(id.name.el, COL, 540))
    return id
  }
  const idS = ident('For students', APP_NAME.student)
  const idA = ident('For the academy', APP_NAME.academy)

  // "one for students" (5.2)
  const t5 = B(5) - 0.14
  leave(tl, [...kicker.words, ...head.words], B(4), { stagger: 0.02, dur: 0.36 })
  leave(tl, [...nameS.words, ...nameA.words], B(4.05), { stagger: 0.01, dur: 0.28 })
  tl.set(S.el, { zIndex: 3 }, t5)
  tl.to(S.el, { ...pose(S, P.front), duration: 0.6, ease: 'swift' }, t5)
  tl.to(A.el, { ...pose(A, P.back), duration: 0.6, ease: 'swift' }, t5)
  tl.to(veilA, { opacity: 0.52, duration: 0.4, ease: 'none' }, t5)
  tl.to(tileS, { ...IN_COL, duration: 0.6, ease: 'swift' }, t5)
  tl.to(tileA, { ...IN_WINGS, duration: 0.6, ease: 'swift' }, t5)
  rise(tl, idS.kick.words, B(5), { dur: 0.5 })
  rise(tl, idS.name.words, B(5) + 0.06, { stagger: 0.06, dur: 0.6 })
  sfx('whoosh', t5, 0.35, -0.2)
  sScreens.forEach((s, i) => swapTo(S, sImgs[i], s, B(5.5 + i * 0.5)))

  // "one for the academy" (7.4)
  const t7 = B(7.5) - 0.14
  leave(tl, [...idS.kick.words, ...idS.name.words], B(6.7), { stagger: 0.015, dur: 0.3 })
  tl.set(A.el, { zIndex: 4 }, t7)
  tl.to(A.el, { ...pose(A, P.front), duration: 0.6, ease: 'swift' }, t7)
  tl.to(S.el, { ...pose(S, P.back), duration: 0.6, ease: 'swift' }, t7)
  tl.to(veilA, { opacity: 0, duration: 0.25, ease: 'none' }, t7)
  tl.to(veilS, { opacity: 0.52, duration: 0.4, ease: 'none' }, t7)
  tl.to(tileA, { ...IN_COL, duration: 0.6, ease: 'swift' }, t7)
  tl.to(tileS, { ...IN_WINGS, duration: 0.6, ease: 'swift' }, t7)
  rise(tl, idA.kick.words, B(7.5), { dur: 0.5 })
  rise(tl, idA.name.words, B(7.5) + 0.06, { stagger: 0.06, dur: 0.6 })
  sfx('whoosh', t7, 0.35, 0.2)
  aScreens.forEach((s, i) => swapTo(A, aImgs[i], s, B(8 + i * 0.5)))
  goHome(S, sImgs, B(8.6))

  // ---------------------------------------------------------------- C: native notifications
  // "with instant notifications" (10.3): the student's phone takes the centre, upright and large.
  const tC = B(9.6)
  leave(tl, [...idA.kick.words, ...idA.name.words], B(9.45), { stagger: 0.02 })
  tl.set(S.el, { zIndex: 5 }, tC)
  tl.to(S.el, { ...pose(S, P.hero), duration: 0.8, ease: 'glide' }, tC)
  tl.to(veilS, { opacity: 0, duration: 0.3, ease: 'none' }, tC)
  tl.to(A.el, { x: 2240, rotationY: -34, scale: 0.9, duration: 0.55, ease: 'swiftIn' }, tC)
  tl.to(tileA, { x: -150, opacity: 0, duration: 0.4, ease: 'swiftIn' }, tC)
  tl.to(tileS, { scale: 0.2, opacity: 0, duration: 0.22, ease: 'power2.in' }, tC)
  sfx('whoosh', tC + 0.1, 0.5)
  goHome(A, aImgs, B(12))

  const headC = fit('t-h1', '*Instant*\nnotifications.', 100, 524)
  const hb = stageBox(headC.el)
  const yC = Math.round(540 - (hb.h + 34 + 58) / 2)
  put(headC.el, COL, yC)
  rise(tl, [headC.words[0]], B(10.7), { dur: 0.6 })
  rise(tl, [headC.words[1]], B(11.5), { dur: 0.6 })

  // the display switches off, idles dim on the lock screen, and the first push wakes it
  const lock = lockScreen(S, { time: CLOCK })
  const sleep = h('div.mobile-sleep')
  screenOf(S).append(sleep)
  tl.to(sleep, { opacity: 1, duration: 0.14, ease: 'power1.in' }, B(11) - 0.36)
  tl.set(lock.el, { opacity: 1 }, B(11) - 0.21)
  statusLight(tl, S, true, B(11) - 0.21)
  tl.to(sleep, { opacity: 0.62, duration: 0.2, ease: 'none' }, B(11) - 0.2)
  tl.to(sleep, { opacity: 0, duration: 0.18, ease: 'power1.out' }, B(12) - 0.2)

  const cards = deliver(
    tl,
    lock.list,
    PUSHES.map((p) => ({ app: 'student' as const, title: p.title, body: p.body, at: B(p.at) })),
  )
  cards.forEach((c, i) => settle(c, PUSHES[i].title))

  // each landing: the ding, the jolt, a ring off the phone, and what kind of news it was
  gsap.set(pulse, { x: P.hero.cx - S.w / 2, y: P.hero.cy - S.h / 2, scale: P.hero.scale })
  const kinds = PUSHES.map((p, i) => {
    const at = B(p.at)
    sfx('ding', at, i === 3 ? 1 : 0.8)
    buzz(tl, S, at)
    tl.fromTo(pulse, { scaleX: 1.56, scaleY: 1.56, opacity: 0.55 }, { scaleX: 1.9, scaleY: 1.72, opacity: 0, duration: 0.8, ease: 'power2.out', immediateRender: false }, at)
    const c = chip(p.kind, { icon: p.icon, tone: i === 3 ? 'teal' : undefined })
    add(root, put(c, 1392, 397 + i * 76))
    popIn(tl, c, at + 0.04)
    return c
  })
  // a slow push in while the pushes land
  tl.to(S.el, { scale: 1.6, duration: B(20.4) - B(11.3), ease: 'none' }, B(11.3))

  // beat 20: tap the one that matters; beat 20.5: the app opens at the very screen it is about
  const report = S.layer(sReport)
  const finger = touch({ ov: lock.el, shot: sHome } as Layer, { x: 322, y: 612 })
  moveTo(tl, finger, { x: 270, y: 304 }, B(19) - 0.05, 0.5)
  click(tl, finger, B(20))
  sfx('tap', B(20))
  tl.to(cards[3], { scale: 0.965, duration: 0.08, ease: 'power2.in' }, B(20) - 0.04)
  tl.to(cards[3], { scale: 1, duration: 0.22, ease: 'pop' }, B(20) + 0.08)
  hidePointer(tl, finger, B(20) + 0.14)

  const tO = B(20.5)
  const barS = statusParts(S)
  tl.set(report, { opacity: 1 }, B(19))
  tl.to(lock.el, { opacity: 0, scale: 1.1, duration: 0.22, ease: 'power2.in' }, tO - 0.24)
  statusLight(tl, S, false, tO - 0.1)
  tl.set(barS.status, { backgroundColor: sReport.topColor }, tO - 0.1 + 0.001)
  tl.set(barS.home, { backgroundColor: sReport.bottomColor }, tO - 0.1 + 0.001)
  tl.fromTo(S.scroll, { scale: 0.9 }, { scale: 1, duration: 0.46, ease: 'swift', immediateRender: false }, tO - 0.24)
  // the thread's own last entry steps forward: Siti Hajar's approval, stamped 12:05 pm
  const ev = sReport.tag('event-approved')
  const verdict = lift(S, { x: ev.x - 12, y: ev.y - 5, w: ev.w + 24, h: ev.h + 11 }, { from: sReport, radius: 12 })
  gsap.set(verdict, { opacity: 0 })
  tl.set(verdict, { opacity: 1 }, tO - 0.2)
  liftUp(tl, verdict, tO + 0.1, { scale: 1.06, y: -3, dur: 0.45 })
  liftDown(tl, verdict, B(22.5), 0.35)
  sfx('success', tO, 0.8)

  const opens = chip('Opens the right screen', { icon: 'arrow-up-right', tone: 'teal' })
  add(root, put(opens, COL, yC + hb.h + 34))
  popIn(tl, opens, tO + 0.04)

  // beat 21: the Academy phone is back beside it, app open; beat 22: a push drops over the app
  popOut(tl, kinds, tO - 0.22, { stagger: 0.015 })
  const tR = B(21) - 0.2
  tl.to(A.el, { ...pose(A, P.aEnd), duration: 0.7, ease: 'swift' }, tR)
  // the student's phone steps back to make room beside it
  tl.to(S.el, { ...pose(S, P.pair), duration: 0.7, ease: 'glide' }, tR)
  sfx('whoosh', tR, 0.4, 0.4)

  const over = note({ app: 'academy', title: STAFF_PUSH.title, body: STAFF_PUSH.body, overApp: true })
  screenOf(A).append(over)
  settle(over, STAFF_PUSH.title)
  gsap.set(over, { x: 12, y: -100, scale: 0.92, opacity: 0, zIndex: 5 })
  tl.to(over, { opacity: 1, duration: 0.14, ease: 'none' }, B(22) - 0.2)
  tl.to(over, { y: 60, scale: 1, duration: 0.5, ease: 'pop' }, B(22) - 0.2)
  sfx('ding', B(22), 0.9, 0.4)
  buzz(tl, A, B(22))
  // … and there it is on her Today screen: the row the push is about
  const row = lift(A, aHome.tag('row-aisyah'), { radius: 16 })
  gsap.set(row, { opacity: 0 })
  tl.set(row, { opacity: 1 }, B(21))
  liftUp(tl, row, B(23), { scale: 1.05, y: -3, dur: 0.4 })

  // ---------------------------------------------------------------- life
  // The phones are never dead still: they breathe a few pixels and tip a degree.
  onFrame((_t, beat) => {
    const k = 0.8 + 0.5 * Math.min(1, Math.max(0, 5.5 - beat))
    gsap.set(S.el, { yPercent: Math.sin(beat * 0.7) * 0.5, rotationX: Math.sin(beat * 0.5 + 0.6) * k })
    gsap.set(A.el, { yPercent: Math.sin(beat * 0.7 + 1.4) * 0.5, rotationX: Math.sin(beat * 0.5 + 2.1) * k })
  })
}
