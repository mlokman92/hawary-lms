import type { SceneCtx } from '../engine'
import { add, browser, chip, click, counter, countTo, cursor, focus, gsap, h, hidePointer, icon, int, lift, liftDown, liftUp, moveTo, phone, place, popIn, pt, put, rise, shot, text, touch } from '../kit'
import './students.css'

// Bars 13-16 (24-32s): the groove. Kick on every beat, clap on 1, 3, 5...
// VO (starts beat 0.8): "Students join through a single link." (to 4.1) |
//                       beat 4.7 "Approve the request, and they're enrolled." (to 8.5)
//
// One pan, left to right, along the way a student travels:
// A  beats 0-4     the join page on a phone; the one link types itself; a tap
// B  beats 5-8     the staff's requests: approve, approve, approve
// C  beats 10-16   the roster those people are now on, and how big it is
export default async function students({ root, tl, B, sfx, onFrame, music }: SceneCtx) {
  const join = await shot('web/enroll-public-phone')
  const reqs = await shot('web/enrollments')
  const roster = await shot('web/students-all')

  const PAN1 = 2500 // how far the world slides between A and B
  const PAN2 = 2100 // and between B and C
  const T1 = B(3.75) // the first pan: 0.75s, through the bar line, settled by "Approve"
  const T2 = B(8.25) // the second: lands on beat 10

  // devices first (back to front), type on top
  const devC = browser(roster, { url: 'app.hawary.my/students' })
  const devB = browser(reqs, { url: 'app.hawary.my/enrollments' })
  const ph = phone(join)
  add(root, devC.el, devB.el, ph.el)

  // A piece that steps forward and back. It exists only while it is up: at rest it is the page
  // itself, and an idle copy would cover the shadow of the neighbour that is up.
  const step = (el: HTMLElement, at: number, hold: number, v: { scale?: number; y?: number; dur?: number } = {}) => {
    gsap.set(el, { opacity: 0 })
    tl.set(el, { opacity: 1 }, at)
    liftUp(tl, el, at, v)
    liftDown(tl, el, at + hold, 0.3)
    tl.set(el, { opacity: 0 }, at + hold + 0.32)
  }

  // ---------------------------------------------------------------- A: one link
  // The public join page, large enough to read, running off the bottom of the frame.
  gsap.set(ph.scroll, { scale: 390 / 430, transformOrigin: '0 0' })
  const PH = { cx: 1380, cy: 750 }
  place(ph.el, ph, PH.cx, PH.cy, { scale: 1.56, rotationY: -13, rotationZ: 0.4 })
  tl.to(ph.el, { scale: 1.6, rotationY: -6, rotationZ: 0, duration: T1, ease: 'power2.out' }, 0)

  const kicker = text('t-kicker', 'Students')
  const head = text('t-h1', 'One link\nto *join*.')
  add(root, put(kicker.el, 122, 372), put(head.el, 116, 420))
  rise(tl, kicker.words, B(0.3), { dur: 0.5 })
  rise(tl, head.words, B(0.5), { stagger: 0.07 })

  // the link writes itself, a syllable on every sixteenth; the amber dot leads it
  const host = h('b')
  const path = h('span')
  const caret = h('i.students-caret')
  const pill = h('div.students-link', null, h('span.students-link-ico', { html: icon('link', 2.4) }), h('span.students-link-txt', null, host, path), caret)
  add(root, put(pill, 116, 672))
  popIn(tl, pill, B(0.75))
  sfx('pop', B(0.75), 0.4)
  const HOST = 'app.hawary.my'
  const LINK = HOST + '/enroll/hawary-academy'
  const CHUNKS = ['app.', 'hawary', '.my', '/enroll', '/hawary', '-academy']
  const typed = (beat: number) => {
    let n = 0
    CHUNKS.forEach((c, k) => {
      const u = (beat - (1 + k * 0.25)) / 0.2
      if (u >= 0) n += Math.min(c.length, Math.floor(u * c.length) + 1)
    })
    return n
  }
  for (const b of [1.25, 1.75, 2.25]) sfx('tick', B(b), 0.5)

  // the real course steps forward, then a fingertip makes the account
  step(lift(ph, join.tag('courseOption')), B(2.5), 0.5, { scale: 1.035, y: -3, dur: 0.4 })
  const cta = join.tag('createAccount')
  const finger = touch(ph, { x: 330, y: 650 })
  moveTo(tl, finger, pt(cta, 0.5, 0.5), B(2.4), 0.26)
  click(tl, finger, B(3))
  sfx('tap', B(3))
  step(lift(ph, cta), B(3), 0.3, { scale: 1.05, y: -2, dur: 0.3 })
  hidePointer(tl, finger, B(3.55))

  // pan right: everything in A slides out together
  const typeA = [kicker.el, head.el, pill]
  tl.to(typeA, { x: -PAN1, duration: 0.75, ease: 'glide' }, T1)
  tl.to(ph.el, { x: PH.cx - ph.w / 2 - PAN1, rotationY: 14, duration: 0.75, ease: 'glide' }, T1)
  tl.set([...typeA, ph.el], { opacity: 0 }, T1 + 0.8)
  sfx('whoosh', B(4.25), 0.6)

  // ---------------------------------------------------------------- B: approve
  // The staff window, pushed in on the pending requests; the headline takes the band below it.
  const card = reqs.tag('requests')
  const camB = focus(devB, card, { cx: 882, cy: 444, scale: 1.5 })
  const camB2 = focus(devB, card, { cx: 882, cy: 444, scale: 1.53 })
  gsap.set(devB.el, { ...camB, x: camB.x + PAN1, rotationY: -14, opacity: 0 })
  tl.set(devB.el, { opacity: 1 }, T1)
  tl.to(devB.el, { ...camB, duration: 0.75, ease: 'glide' }, T1)
  tl.to(devB.el, { ...camB2, duration: T2 - B(5.25), ease: 'none' }, B(5.25)) // never still: a slow push

  const headB = text('t-h1', 'Approve. *Enrolled.*', { style: { whiteSpace: 'nowrap' } })
  add(root, put(headB.el, 116, 843))
  rise(tl, [headB.words[0]], B(4.75), { dur: 0.6 }) // up by the clap on 5, as she says it
  rise(tl, [headB.words[1]], B(7), { dur: 0.6 })

  // three requests, three clicks on consecutive beats; each row answers with its label
  const mouse = cursor(devB, { x: 1010, y: 790 })
  ;['firstRow', 'row2', 'row3'].forEach((name, i) => {
    const r = reqs.tag(name)
    const row = lift(devB, { x: r.x + 1, y: r.y + (i ? 0 : 1), w: r.w - 2, h: r.h - (i ? 0 : 1) }, { radius: 6 })
    if (!i) row.style.borderRadius = '25px 25px 6px 6px' // the first row carries the card's own corners
    // the row's Reject / Approve buttons give way to the label
    const blank = h('div.abs', { style: { left: `${1116 - r.x}px`, top: '1px', width: '172px', height: `${r.h - 3}px`, background: '#fff', opacity: '0' } })
    const holder = h('div.students-enrolled')
    const label = chip('Enrolled', { icon: 'check', tone: 'teal', sm: true })
    holder.append(label)
    row.append(blank, holder)
    holder.style.width = `${label.offsetWidth}px`

    const at = B(6 + i)
    const approve = pt({ x: 1200, y: r.y + 14, w: 80, h: 32 }, 0.5, 0.6)
    if (i === 0) moveTo(tl, mouse, approve, B(5.15), 0.38)
    else moveTo(tl, mouse, approve, at - 0.36, 0.26)
    // a ripple of its own per click: the clicks are a beat apart, and the kit's single ripple
    // would jump to the next button while the last one is still fading
    const ripple = h('div.ripple')
    devB.ov.append(ripple)
    gsap.set(ripple, { x: approve.x, y: approve.y })
    click(tl, { el: mouse.el, ripple }, at)
    sfx('click', at)
    gsap.set(row, { opacity: 0 }) // the copy takes over from the page at the click, and keeps its label
    tl.set(row, { opacity: 1 }, at)
    liftUp(tl, row, at, { scale: 1.02, y: -2, dur: 0.35 })
    liftDown(tl, row, at + 0.45, 0.3)
    tl.set(blank, { opacity: 1 }, at + 0.03)
    popIn(tl, label, at + 0.03)
    sfx(i === 0 ? 'success' : 'pop', at + 0.05, i === 0 ? 0.8 : 0.5)
  })
  hidePointer(tl, mouse, B(8.3))

  // pan right again
  tl.to(devB.el, { x: camB2.x - PAN2, rotationY: 12, duration: 0.875, ease: 'glide' }, T2)
  tl.to(headB.el, { x: -PAN2, duration: 0.875, ease: 'glide' }, T2)
  tl.set([devB.el, headB.el], { opacity: 0 }, T2 + 0.9)
  sfx('whoosh', B(8.85), 0.55)

  // ---------------------------------------------------------------- C: the roster
  // The same people, newest first, on the list of everyone. The window runs off the right and the bottom.
  const SC = 1.2665 // the frame's bottom edge falls between two rows
  const C = { cx: 690 + (devC.w * SC) / 2, cy: 44 + (devC.h * SC) / 2 }
  place(devC.el, devC, C.cx + PAN2, C.cy, { scale: SC, rotationY: -12, opacity: 0 })
  tl.set(devC.el, { opacity: 1 }, T2)
  tl.to(devC.el, { x: C.cx - devC.w / 2, rotationY: 0, duration: 0.875, ease: 'glide' }, T2)
  tl.to(devC.el, { x: C.cx - devC.w / 2 - 24, duration: B(17) - B(10), ease: 'none' }, B(10)) // the pan never quite stops

  // rows step forward on the half-beats
  const rows = [0, 1, 2, 3, 4].map((i) => ({ x: 281, y: 461 + i * 61, w: 1134, h: 61 }))
  rows.slice(0, 4).forEach((r, i) => {
    step(lift(devC, r, { radius: 6 }), B(10 + i * 0.5), 0.4, { scale: 1.02, y: -2, dur: 0.3 })
    sfx('tick', B(10 + i * 0.5), 0.5)
  })

  // the count, landing on the bar line at the roster's own total
  const num = text('t-display', '0', { style: { fontSize: '200px', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } })
  const line = text('t-h2', 'students,\n*one roster.*')
  add(root, put(num.el, 108, 246), put(line.el, 116, 452))
  gsap.set(num.el, { transformOrigin: '0% 70%' })
  const tally = counter(num.words[0], 0, int)
  rise(tl, num.words, B(9.6), { dur: 0.6 })
  countTo(tl, tally, 805, B(9.75), B(12) - B(9.75), 'power2.out')
  rise(tl, [line.words[0]], B(10.5), { dur: 0.6 })
  rise(tl, line.words.slice(1), B(12), { dur: 0.6, stagger: 0.06 })
  tl.to(num.el, { scale: 1.06, duration: 0.09, ease: 'power2.out' }, B(12) - 0.04)
  tl.to(num.el, { scale: 1, duration: 0.45, ease: 'pop' }, B(12) + 0.05)
  sfx('pop', B(12), 0.8)
  // ...which is the page's own Total tile
  step(lift(devC, roster.tag('tileTotal')), B(12), 0.75, { scale: 1.06, y: -4, dur: 0.4 })

  // two true facts
  const facts = [
    { c: chip('Import a whole intake from CSV', { icon: 'file-spreadsheet' }), at: 13 },
    { c: chip('One student, one course', { icon: 'graduation-cap' }), at: 14 },
  ]
  facts.forEach((f, i) => {
    add(root, put(f.c, 116, 648 + i * 74))
    popIn(tl, f.c, B(f.at))
    sfx('pop', B(f.at), 0.5)
  })
  // one course each: the Course column answers, a row every quarter-beat
  rows.forEach((r, i) => {
    step(lift(devC, { x: 741, y: r.y + 1, w: 297, h: r.h - 2 }, { radius: 8 }), B(14 + i * 0.25), 0.32, { scale: 1.05, y: -1, dur: 0.25 })
  })

  // ---------------------------------------------------------------- life
  let shown = -1
  onFrame((t, beat) => {
    if (beat < 5.5) {
      // the phone floats (properties no tween touches)
      gsap.set(ph.el, { y: PH.cy - ph.h / 2 + Math.sin(beat * 0.8) * 4, rotationX: 1.5 + Math.sin(beat * 0.55) * 0.7 })
      const n = typed(beat)
      if (n !== shown) {
        shown = n
        host.textContent = LINK.slice(0, Math.min(n, HOST.length))
        path.textContent = LINK.slice(HOST.length, Math.max(n, HOST.length))
      }
      gsap.set(caret, { scale: 1 + 0.4 * music.pulse(t, 2.5) })
    }
  })
}
