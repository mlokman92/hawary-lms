import './learn.css'
import type { SceneCtx } from '../engine'
import type { Rect, Shot } from '../kit'
import { add, browser, chip, click, counter, countTo, cursor, dot, focus, gsap, h, hidePointer, lift, liftDown, liftUp, moveTo, phone, place, popIn, pt, put, ring, rise, scrollPane, shot, stageBox, text, touch } from '../kit'

// Bars 17-20 (32-40s): the groove with hats.
// VO (beat 0.8): "Quizzes mark themselves." (to 3.6) | beat 4.3 "Assignments land in one grading queue." (to 8.7)
//
// A  beats 0-4    the Student app: pick an answer, submit, and the score is there
// B  beats 4-10   pan to the trainer: the Assignments queue, open the first one, mark it
// C  beats 10-16  the assessment editor's six question types, dealt as cards: cuts on 10 / 12 / 14, a second card on 11 / 13 / 15

/** One block of a screenshot as a free card on the paper (a `lift` without a page under it). Native size is the rect's. */
function card(s: Shot, r: Rect) {
  const el = h('div.lift.learn-card', { style: { width: `${r.w}px`, height: `${r.h}px`, borderRadius: `${r.radius ?? 10}px` } })
  const im = s.img()
  im.style.left = `${-r.x}px`
  im.style.top = `${-r.y}px`
  el.append(im)
  return { el, w: r.w, h: r.h }
}

export default async function learn({ root, tl, B, sfx, onFrame }: SceneCtx) {
  const [quiz, result, queue, gradeTop, gradeBlank, gradeFull, editor] = await Promise.all([
    shot('student/assessment'),
    shot('student/assessment-result'),
    shot('web/grading-queue'),
    shot('web/grade-submission-top'),
    shot('web/grade-submission-blank'),
    shot('web/grade-submission'),
    shot('web/assessment-editor'),
  ])

  // ---------------------------------------------------------------- A  quizzes mark themselves
  const PH = { cx: 640, cy: 545, s: 1.1 }
  const ph = phone(quiz, { time: '4:31' })
  add(root, ph.el)
  place(ph.el, ph, PH.cx, PH.cy, { scale: PH.s * 1.07, rotationY: 6, rotationX: 1.5 })
  tl.to(ph.el, { scale: PH.s, duration: 0.9, ease: 'swift' }, B(0) - 0.12) // settles as the iris opens
  /** a point of the phone's screen (shot px) on the stage */
  const onStage = (p: { x: number; y: number }) => ({ x: PH.cx + (12 + p.x - ph.w / 2) * PH.s, y: PH.cy + (59 + p.y - ph.h / 2) * PH.s })

  // The capture has the answer already chosen. Until the tap, the row wears its unchosen look, made from
  // the screen's own pixels: the frame and radio of the row below, and its own label on white.
  const picked = quiz.tag('option-picked')
  const pickLift = lift(ph, picked, { radius: 10 })
  const blankRow = lift(ph, { ...picked, y: picked.y + 54 }, { radius: 10 })
  gsap.set(blankRow, { y: -54 })
  const blankText = lift(ph, { x: 81, y: picked.y + 12, w: 258, h: 22 }, { radius: 0 })
  blankText.style.filter = 'brightness(1.07)'
  // "1 of 10 answered" would contradict the 18 / 20 that follows: a blank piece of the same footer sits over it
  const hush = lift(ph, { x: 262, y: 662, w: 104, h: 24 }, { radius: 0 })
  gsap.set(hush, { x: -118 })

  const tip = touch(ph, { x: 306, y: 606 })
  moveTo(tl, tip, pt(picked, 0.45, 0.5), B(0.25), 0.34)
  click(tl, tip, B(1))
  sfx('tap', B(1), 0.9)
  tl.set([blankRow, blankText], { opacity: 0 }, B(1) + 0.03)
  liftUp(tl, pickLift, B(1) + 0.03, { scale: 1.045, y: -2, dur: 0.32 })
  liftDown(tl, pickLift, B(1.7), 0.22)

  const submit = pt(quiz.tag('submit'))
  tl.to(tip.el, { x: submit.x, y: submit.y, duration: 0.3, ease: 'glide' }, B(1.3))
  tl.set(tip.ripple, { x: submit.x, y: submit.y }, B(2) - 0.02)
  click(tl, tip, B(2))
  sfx('tap', B(2))
  hidePointer(tl, tip, B(2.3))

  // submitted: the same screen, marked
  const marked = ph.layer(result)
  const banner = lift(ph, result.tag('result'), { from: result, radius: 20 })
  gsap.set(banner, { opacity: 0 })
  tl.set([marked, banner], { opacity: 1 }, B(2) + 0.04)
  tl.set([hush, pickLift], { opacity: 0 }, B(2) + 0.04)
  liftUp(tl, banner, B(2) + 0.06, { scale: 1.07, y: -3, dur: 0.4 })

  // the type column beside the phone
  const gA = h('div.abs', { style: { width: '1920px', height: '1080px' } })
  add(root, gA)
  const COL = 960
  const head = text('t-h1', 'Quizzes mark\n*themselves*.')
  add(gA, put(head.el, COL, 250))
  rise(tl, head.words, B(0.6), { stagger: 0.07 })

  const num = h('span.learn-score-n', { text: '18' })
  const score = h('div.learn-score', null, num, h('span.learn-score-of', { text: '/ 20' }))
  add(gA, put(score, COL - 10, 508))
  num.style.width = `${Math.ceil(stageBox(num).w)}px`
  const tally = counter(num, 0, (v) => String(Math.round(v)))
  gsap.set(score, { opacity: 0, y: 26 })
  tl.to(score, { opacity: 1, duration: 0.12, ease: 'none' }, B(2) + 0.05)
  tl.to(score, { y: 0, duration: 0.4, ease: 'swift' }, B(2) + 0.05)
  countTo(tl, tally, 18, B(2) + 0.08, 0.42, 'power1.out') // lands on beat 3
  tl.to(score, { scale: 1.05, duration: 0.08, ease: 'power2.out' }, B(3) - 0.05)
  tl.to(score, { scale: 1, duration: 0.35, ease: 'pop' }, B(3) + 0.03)

  // the amber dot leaves the Submit button and lands as the bullet of the label
  const label = h('div.chip.learn-dotchip', { html: '<i></i><span>Marked instantly</span>' })
  const LABEL = { x: COL, y: 744 }
  add(gA, put(label, LABEL.x, LABEL.y))
  gsap.set(label, { scale: 0.5, opacity: 0, transformOrigin: '31px 29px' })
  tl.to(label, { scale: 1, opacity: 1, duration: 0.45, ease: 'pop' }, B(3))
  sfx('success', B(3), 0.85)
  const guide = dot(22)
  add(gA, guide)
  const from = onStage(submit)
  const to = { x: LABEL.x + 31, y: LABEL.y + 29 }
  gsap.set(guide, { x: from.x, y: from.y, scale: 0.2, opacity: 0 })
  tl.set(guide, { opacity: 1 }, B(2) + 0.02)
  tl.to(guide, { x: to.x, duration: 0.47, ease: 'power1.inOut' }, B(2) + 0.03)
  tl.to(guide, { y: to.y - 120, scale: 1.3, duration: 0.25, ease: 'power2.out' }, B(2) + 0.03)
  tl.to(guide, { y: to.y, scale: 1, duration: 0.22, ease: 'power2.in' }, B(2) + 0.28)
  tl.to(guide, { scaleY: 0.7, scaleX: 1.25, duration: 0.05, ease: 'power1.out' }, B(3))
  tl.to(guide, { scaleY: 1, scaleX: 1, duration: 0.3, ease: 'pop' }, B(3) + 0.05)

  // ---------------------------------------------------------------- B  one grading queue
  // Beat 4: the camera pans from the student to the trainer.
  const PAN = 2320 // far enough that the window waits wholly outside the frame
  tl.to(ph.el, { x: PH.cx - ph.w / 2 - PAN, duration: 0.5, ease: 'glide' }, B(4))
  tl.to(gA, { x: -PAN, duration: 0.5, ease: 'glide' }, B(4))
  tl.set([ph.el, gA], { opacity: 0 }, B(5) + 0.02)

  const dev = browser(queue, { url: 'app.hawary.my/assignments' })
  add(root, dev.el)
  // straight on, the sidebar out of frame, the rows readable, the window's right edge beside the type
  const B1 = focus(dev, { x: 280, y: 80, w: 1136, h: 800 }, { cx: 736, cy: 593, scale: 1.24 })
  gsap.set(dev.el, { ...B1, x: B1.x + PAN, rotationY: -9, transformOrigin: '50% 50%', opacity: 0 })
  tl.set(dev.el, { opacity: 1 }, B(4) - 0.02)
  tl.to(dev.el, { x: B1.x, rotationY: 0, duration: 0.5, ease: 'glide' }, B(4))
  sfx('whoosh', B(4), 0.6)
  tl.to(dev.el, { scale: 1.252, duration: 1.0, ease: 'none' }, B(5))

  // 11 awaiting marks, and the submissions answer down the list
  const tile = lift(dev, queue.tag('tileAwaiting'))
  liftUp(tl, tile, B(5), { scale: 1.07, y: -4, dur: 0.4 })
  sfx('pop', B(5), 0.5)
  liftDown(tl, tile, B(6.85), 0.3)
  const rows = ['firstRow', 'row2', 'row3', 'row4'].map((n, i) => {
    const r = queue.tag(n)
    return i === 0 ? lift(dev, { x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 1 }, { radius: 25 }) : lift(dev, { x: r.x + 1, y: r.y, w: r.w - 2, h: r.h }, { radius: 8 })
  })
  rows.forEach((el, i) => {
    const at = 5.5 + i * 0.25
    liftUp(tl, el, B(at), { scale: 1.016, y: -2, dur: 0.24 })
    liftDown(tl, el, B(at + 0.5), 0.2)
    if (i % 2 === 0) sfx('tick', B(at), 0.5)
  })

  const SIDE = 1520
  const headB = text('t-h3', 'One grading\n*queue*.', { style: { fontSize: '52px', lineHeight: '1.06' } })
  add(root, put(headB.el, SIDE, 372))
  rise(tl, headB.words, B(6), { stagger: 0.06, dur: 0.6 })

  const mouse = cursor(dev, { x: 1010, y: 640 })
  moveTo(tl, mouse, pt(queue.tag('heroLink'), 0.2, 0.6), B(6.1), 0.38)
  liftUp(tl, rows[0], B(6.75), { scale: 1.02, y: -3, dur: 0.25 })
  click(tl, mouse, B(7))
  sfx('click', B(7))
  hidePointer(tl, mouse, B(7) + 0.06)

  // the click opens the submission; the page runs down to the mark
  const pageTop = dev.layer(gradeTop)
  const pane = scrollPane(dev, gradeBlank, { extra: 50 })
  gsap.set(pane.el, { opacity: 0 })
  tl.set([pageTop, pane.el], { opacity: 1 }, B(7) + 0.04)
  tl.set([tile, ...rows], { opacity: 0 }, B(7) + 0.04)
  const drop = pane.maxScroll
  const markCard = gradeFull.tag('markCard')
  const B2 = focus(dev, { x: markCard.x, y: markCard.y - drop, w: markCard.w, h: markCard.h }, { cx: 700, cy: 762, scale: 1.3 })
  tl.to(pane.inner, { y: -drop, duration: 0.64, ease: 'glide' }, B(7) + 0.05)
  tl.to(dev.el, { ...B2, duration: 0.64, ease: 'glide' }, B(7) + 0.05)
  sfx('whoosh', B(7) + 0.05, 0.4)

  // the trainer's mark and feedback (the filled state of the same page), then Save & return
  const mark = lift(pane, gradeFull.tag('score'), { from: gradeFull, radius: 22 })
  gsap.set(mark, { opacity: 0, transformOrigin: '0% 50%' })
  tl.set(mark, { opacity: 1 }, B(8.5))
  liftUp(tl, mark, B(8.5), { scale: 1.22, y: 0, dur: 0.35 })
  sfx('tick', B(8.5), 0.7)
  const feedback = lift(pane, { x: 456, y: 1500, w: 784, h: 229 }, { from: gradeFull, radius: 0 })
  gsap.set(feedback, { opacity: 0 })
  tl.set(feedback, { opacity: 1 }, B(8.75))

  const mouse2 = cursor(pane, { x: 1010, y: 1568 })
  moveTo(tl, mouse2, pt(gradeFull.tag('saveReturn'), 0.5, 0.62), B(8.15), 0.36)
  click(tl, mouse2, B(9))
  sfx('click', B(9))
  const glow = ring(pane, markCard, 3)
  tl.fromTo(glow, { opacity: 0 }, { opacity: 1, duration: 0.12, ease: 'none', immediateRender: false }, B(9) + 0.03)
  tl.to(glow, { opacity: 0, duration: 0.7, ease: 'power2.out' }, B(9) + 0.3)
  const done = chip('Marked', { icon: 'check', tone: 'teal' })
  add(root, put(done, SIDE, 514))
  popIn(tl, done, B(9) + 0.04)
  sfx('success', B(9) + 0.04, 0.7)

  // ---------------------------------------------------------------- C  six question types
  tl.set([dev.el, headB.el, done], { opacity: 0 }, B(10))

  const COLC = 1300
  const headC = text('t-h2', 'Six question\n*types*.', { style: { fontSize: '80px' } })
  add(root, put(headC.el, COLC, 216))
  rise(tl, headC.words, B(10), { stagger: 0.06, dur: 0.6 })

  // the editor's own names for them, in the editor's order
  const TYPES = [
    { tag: 'qSingleChoice', label: 'Multiple choice (one answer)', icon: 'circle-dot' },
    { tag: 'qTrueFalse', label: 'True or false', icon: 'toggle-left' },
    { tag: 'qMultipleChoice', label: 'Multiple choice (several answers)', icon: 'list-checks' },
    { tag: 'qMatching', label: 'Matching', icon: 'arrow-left-right' },
    { tag: 'qShortAnswer', label: 'Short answer', icon: 'text-cursor-input' },
    { tag: 'qLongAnswer', label: 'Long answer', icon: 'text' },
  ]
  TYPES.forEach((ty, i) => {
    const c = chip(ty.label, { icon: ty.icon })
    add(root, put(c, COLC, 426 + i * 70))
    popIn(tl, c, B(10 + i) + 0.03)
    sfx('pop', B(10 + i), i % 2 ? 0.4 : 0.55)
  })

  // Three hard cuts (10, 12, 14). In each, one real question block is on the paper and a second is dealt beside it a beat later.
  const S = 1.27
  const DEAL = [
    { ry: 8, a: { cx: 602, top: 126 }, b: { cx: 662, top: 652 } },
    { ry: -6, a: { cx: 662, top: 137 }, b: { cx: 602, top: 437 } },
    { ry: 7, a: { cx: 602, top: 277 }, b: { cx: 662, top: 549 } },
  ]
  DEAL.forEach((d, i) => {
    const at = 10 + i * 2
    const g = h('div.abs', { style: { width: '1300px', height: '1080px' } })
    add(root, g)
    gsap.set(g, { opacity: 0, transformOrigin: '650px 540px', rotationY: d.ry, rotationX: 2.5 })
    tl.set(g, { opacity: 1 }, B(at))
    if (i < 2) tl.set(g, { opacity: 0 }, B(at + 2))
    tl.to(g, { rotationY: d.ry * 0.4, scale: 1.035, duration: i < 2 ? 1.0 : 1.3, ease: 'none' }, B(at))

    const a = card(editor, editor.tag(TYPES[i * 2].tag))
    const b = card(editor, editor.tag(TYPES[i * 2 + 1].tag))
    add(g, a.el, b.el)
    // the first block holds the middle of the frame for its beat, settling out of the cut…
    place(a.el, a, d.a.cx, 540, { scale: S * 1.04 })
    tl.to(a.el, { scale: S, duration: 0.4, ease: 'swift' }, B(at))
    // …then steps up and back as the second is dealt under it
    const ay = d.a.top + (a.h * S) / 2
    const by = d.b.top + (b.h * S) / 2
    place(b.el, b, d.b.cx, by + 170, { scale: S * 0.94, rotationZ: 2.5, opacity: 0 })
    tl.to(a.el, { y: ay - a.h / 2, duration: 0.45, ease: 'swift' }, B(at + 1) - 0.1)
    tl.to(a.el, { opacity: 0.62, duration: 0.3, ease: 'power2.out' }, B(at + 1) - 0.06)
    tl.to(b.el, { opacity: 1, duration: 0.1, ease: 'none' }, B(at + 1) - 0.1)
    tl.to(b.el, { y: by - b.h / 2, scale: S, rotationZ: 0, duration: 0.45, ease: 'swift' }, B(at + 1) - 0.1)
  })

  // ---------------------------------------------------------------- life
  const y0 = PH.cy - ph.h / 2
  onFrame((_t, beat) => {
    gsap.set(ph.el, { y: y0 + Math.sin(beat * 0.9) * 4 })
  })
}
