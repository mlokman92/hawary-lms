import type { SceneCtx } from '../engine'
import { add, browser, chip, click, cursor, focus, gsap, hidePointer, leave, lift, liftDown, liftUp, moveTo, place, popIn, popOut, pt, put, ring, rise, scrollPane, shot, text } from '../kit'

// Bars 9-12 (16-24s): the groove arrives.
// VO (starts beat 0.8): "Every intake is a course." | beat 4.3 "Build it in modules" |
//                       beat 7 "notes, quizzes, assignments" | beat 11.3 "and publish with a switch."
//
// A  beats 0-5    the course list at an angle, with the headline
// B  beats 5-10.5 click the real course -> straight on, pushed in on Week 1; content steps forward on its words
// C  beats 10.5-16 scroll to the draft assignment and switch it live
export default async function courses({ root, tl, B, sfx, onFrame }: SceneCtx) {
  const list = await shot('web/courses')
  const page = await shot('web/course')
  const full = await shot('web/course-full')

  // ---------------------------------------------------------------- A
  const dev = browser(list, { url: 'app.hawary.my/courses' })
  add(root, dev.el)
  const A = { cx: 1500, cy: 700, scale: 1.0, rotationY: -13, rotationX: 4, rotationZ: 0.5 }
  place(dev.el, dev, A.cx, A.cy, { scale: A.scale, rotationY: A.rotationY, rotationX: A.rotationX, rotationZ: A.rotationZ })

  const kicker = text('t-kicker', 'Courses')
  const head = text('t-h1', 'Every intake\nis a *course*.')
  add(root, put(kicker.el, 122, 372), put(head.el, 116, 420))
  rise(tl, kicker.words, B(0.3), { dur: 0.5 })
  rise(tl, head.words, B(0.5), { stagger: 0.07 })

  // the three real intakes answer the groove, one per half-beat
  const cards = ['siri3', 'siri2', 'siri1'].map((k) => lift(dev, list.tag(k)))
  cards.forEach((c, i) => {
    liftUp(tl, c, B(2 + i * 0.5), { scale: 1.035, y: -4, dur: 0.35 })
    if (i > 0) liftDown(tl, c, B(3.5), 0.3)
    sfx('pop', B(2 + i * 0.5), 0.45 - i * 0.05)
  })
  liftUp(tl, cards[0], B(3.5), { scale: 1.07, y: -8, dur: 0.4 })

  const mouse = cursor(dev, { x: 700, y: 520 })
  moveTo(tl, mouse, pt(list.tag('siri3Title'), 0.6, 1.8), B(3.8), 0.5)
  click(tl, mouse, B(5))
  sfx('click', B(5))
  hidePointer(tl, mouse, B(5.15))

  // ---------------------------------------------------------------- B
  // The click opens the course: same window, new page, and the camera commits.
  const next = dev.layer(page)
  const pane = scrollPane(dev, full, { extra: 190 })
  gsap.set(pane.el, { opacity: 0 })
  tl.to([next, pane.el], { opacity: 1, duration: 0.07, ease: 'none' }, B(5) + 0.04)
  tl.to(cards, { opacity: 0, duration: 0.05, ease: 'none' }, B(5) + 0.04)
  tl.set(dev.el.querySelector('.browser-url span')!, { innerHTML: '<b>app.hawary.my</b>/courses/dkm-prasekolah-siri-3' }, B(5) + 0.04)

  leave(tl, [...kicker.words, ...head.words], B(4.55), { stagger: 0.02 })
  // push in on Week 1: the sidebar leaves the frame and the page becomes readable
  const week1 = { x: 401, y: 261, w: 894, h: 520 }
  const cam = { cx: 700, cy: 566, width: 1160 }
  tl.to(dev.el, { ...focus(dev, week1, cam), duration: 1.0, ease: 'glide' }, B(5) + 0.02)
  sfx('whoosh', B(5), 0.6)

  const col = 1508 // the right-hand column of the frame, beside the window
  const side = text('t-h3', 'Modules hold\nthe content.', { style: { fontSize: '54px', lineHeight: '1.06' } })
  add(root, put(side.el, col, 318))
  rise(tl, side.words, B(6), { stagger: 0.06, dur: 0.6 })

  // "notes, quizzes, assignments": each kind of content steps forward on its word
  const kinds = [
    { rect: { x: 418, y: 372, w: 860, h: 97, radius: 10 }, label: 'Notes', icon: 'file-text', at: 7 },
    { rect: full.tag('quiz1'), label: 'Quizzes', icon: 'clipboard-list', at: 8 },
    { rect: full.tag('tugasan1'), label: 'Assignments', icon: 'file-pen', at: 9.5 },
  ]
  kinds.forEach((k, i) => {
    const row = lift(pane, k.rect, { radius: 10 })
    liftUp(tl, row, B(k.at), { scale: 1.045, y: -3, dur: 0.4 })
    liftDown(tl, row, B(k.at + (i === 2 ? 1.2 : 1.0)), 0.3)
    const c = chip(k.label, { icon: k.icon })
    add(root, put(c, col, 478 + i * 74))
    popIn(tl, c, B(k.at) + 0.04)
    popOut(tl, c, B(10.9) + i * 0.04)
    sfx('pop', B(k.at), 0.6)
  })
  leave(tl, side.words, B(10.8), { stagger: 0.02 })

  // ---------------------------------------------------------------- C
  // Scroll the real page down to Week 2's draft assignment and publish it.
  const draftRow = full.tag('draftItem')
  const scrollTo = Math.min(pane.maxScroll, draftRow.y - 560)
  tl.to(pane.inner, { y: -scrollTo, duration: 0.9, ease: 'glide' }, B(10.5))
  sfx('whoosh', B(10.6), 0.35)

  // a Published label + switch, borrowed from the row above, laid over the draft's
  const on = lift(pane, { x: 1122, y: 1149, w: 108, h: 24 }, { radius: 0 })
  gsap.set(on, { y: draftRow.y - 1137, opacity: 0 })
  const sw = { x: 1198, y: draftRow.y + 16, w: 28, h: 16 }
  const mouse2 = cursor(pane, { x: 1030, y: draftRow.y - 150 })
  moveTo(tl, mouse2, pt(sw, 0.5, 0.6), B(11.5), 0.5)
  click(tl, mouse2, B(12.6))
  sfx('click', B(12.6))
  tl.set(on, { opacity: 1 }, B(12.6) + 0.03)

  const glow = ring(pane, draftRow, 4)
  tl.fromTo(glow, { opacity: 0 }, { opacity: 1, duration: 0.15, ease: 'none', immediateRender: false }, B(12.6) + 0.03)
  tl.to(glow, { opacity: 0, duration: 0.8, ease: 'power2.out' }, B(12.6) + 0.35)

  const live = chip('Published', { icon: 'check', tone: 'teal' })
  add(root, put(live, col, 478))
  popIn(tl, live, B(12.6) + 0.06)
  sfx('success', B(12.6) + 0.05, 0.8)
  const line = text('t-h3', 'Live for\n*178 students*.', { style: { fontSize: '54px', lineHeight: '1.06' } })
  add(root, put(line.el, col, 318))
  rise(tl, line.words, B(13), { stagger: 0.06, dur: 0.6 })
  hidePointer(tl, mouse2, B(13.3))

  // ---------------------------------------------------------------- life
  // The window is never dead still while it is angled: it sways with the bar.
  onFrame((_t, beat) => {
    if (beat < 5) gsap.set(dev.el, { rotationY: A.rotationY + Math.sin(beat * 0.55) * 0.8, y: A.cy - dev.h / 2 + Math.sin(beat * 0.8) * 5 })
  })
}
