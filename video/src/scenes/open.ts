import type { SceneCtx } from '../engine'
import { add, browser, chip, click, cursor, dot, focus, gsap, h, leave, lift, liftDown, liftUp, lockup, moveTo, phone, place, popIn, popOut, pt, put, rise, shot, stageBox, text } from '../kit'

// Bars 1-8 (0-16s): quiet pads, no drums; a fill in bar 8.
// VO (beat 9): "This is Hawary LMS." | beat 13.3 "One platform that runs the whole academy" |
//              beat 18.6 "on the web," | beat 20.6 "and in your pocket."
//
// The film opens ON the logo — frame 0 is the lockup at rest — then walks
// through its arch into the product, and the logo's dot lands as the full stop
// of the title. Then the product assembles: the web app, and the two apps.
export default async function open({ root, tl, B, sfx, onFrame }: SceneCtx) {
  const dash = await shot('web/dashboard')
  const sHome = await shot('student/home').catch(() => null)
  const aHome = await shot('academy/home').catch(() => null)

  // ---------------------------------------------------------------- the lockup, exactly as drawn
  const LW = 900
  const lk = lockup(LW)
  const s = LW / 1619.04 // svg units -> px
  const x0 = 960 - lk.w / 2
  const y0 = 540 - lk.hgt / 2
  // the middle of the arch's opening, in the lockup's own px: the point we walk through
  const gate = { x: 136 * s, y: 158 * s }
  gsap.set(lk.el, { x: x0, y: y0, transformOrigin: `${gate.x}px ${gate.y}px` })
  add(root, lk.el)

  // beat 2: the dot stirs
  const cy = 193.75
  tl.to(lk.dot, { attr: { cy: cy - 46 }, duration: 0.3, ease: 'power2.out' }, B(2))
  tl.to(lk.dot, { attr: { cy }, duration: 0.3, ease: 'power2.in' }, B(2) + 0.3)
  tl.to(lk.dot, { attr: { ry: 36, rx: 47 }, duration: 0.07, ease: 'power1.out' }, B(2) + 0.6)
  tl.to(lk.dot, { attr: { ry: 42, rx: 42 }, duration: 0.3, ease: 'pop' }, B(2) + 0.67)
  sfx('pop', B(2) + 0.6, 0.35)

  // bar 2: the name steps aside, the symbol takes the centre
  tl.to([lk.hawary, lk.academy], { x: 70, opacity: 0, duration: 0.5, ease: 'swiftIn', stagger: -0.06 }, B(4))
  const K = 1.7
  tl.to(lk.el, { x: x0 + (960 - (x0 + gate.x)), y: y0 + (540 - (y0 + gate.y)), scale: K, duration: 0.95, ease: 'glide' }, B(4.3))

  // The dot leaves the logo: swap the drawn dot for a free one at the same place.
  const dotC = { x: 960, y: 540 + (cy * s - gate.y) * K }
  const dotD = 84 * s * K
  const guide = dot(dotD)
  gsap.set(guide, { x: dotC.x, y: dotC.y, opacity: 0 })
  add(root, guide)
  tl.set(guide, { opacity: 1 }, B(6.4))
  tl.set(lk.dot, { opacity: 0 }, B(6.4))

  // ---------------------------------------------------------------- the title the dot will punctuate
  const SIZE = 196
  const title = text('t-display', 'Hawary LMS', { style: { fontSize: `${SIZE}px`, whiteSpace: 'nowrap' } })
  const group = h('div.abs')
  add(root, group)
  add(group, title.el)
  const tb = stageBox(title.el)
  const tx = 960 - tb.w / 2 - 24
  const ty = 506 - tb.h / 2
  put(group, tx, ty)
  group.style.width = `${tb.w + 60}px`
  group.style.height = `${tb.h}px`
  gsap.set(group, { transformOrigin: `${(tb.w + 48) / 2}px ${tb.h / 2}px` })
  const STOP = 38 // the full stop's diameter
  const stopIn = { x: tb.w + 10 + STOP / 2, y: tb.h * 0.5 + SIZE * 0.29 }
  const stopAt = { x: tx + stopIn.x, y: ty + stopIn.y }
  const stop = dot(STOP)
  gsap.set(stop, { x: stopIn.x, y: stopIn.y, opacity: 0 })
  add(group, stop)

  const kicker = text('t-kicker', 'Learning management system', { style: { whiteSpace: 'nowrap' } })
  add(root, kicker.el)
  const kb = stageBox(kicker.el)
  put(kicker.el, 960 - kb.w / 2, ty - 30)

  // beat 6.5 -> bar 3: a breath in, then through the arch
  tl.to(lk.arch, { scale: 0.93, svgOrigin: '136 158', duration: 0.42, ease: 'power2.out' }, B(6.5))
  tl.to(guide, { y: dotC.y - 26, scale: 1.08, duration: 0.42, ease: 'power2.out' }, B(6.5))
  tl.to(lk.arch, { scale: 34, svgOrigin: '136 158', duration: 0.62, ease: 'power4.in' }, B(7.35) - 0.25)
  sfx('whooshLong', B(7.35) - 0.3, 0.8)
  // the dot arcs across and lands as the full stop
  const k = STOP / dotD
  tl.to(guide, { x: stopAt.x, duration: 0.74, ease: 'power2.inOut' }, B(7.35) - 0.2)
  tl.to(guide, { y: stopAt.y - 150, scale: k * 1.5, duration: 0.36, ease: 'power2.out' }, B(7.35) - 0.2)
  tl.to(guide, { y: stopAt.y, scale: k, duration: 0.38, ease: 'power2.in' }, B(7.35) + 0.16)
  tl.to(guide, { scaleY: k * 0.72, scaleX: k * 1.2, y: stopAt.y + 5, duration: 0.06, ease: 'power1.out' }, B(7.35) + 0.54)
  tl.to(guide, { scaleY: k, scaleX: k, y: stopAt.y, duration: 0.4, ease: 'pop' }, B(7.35) + 0.6)
  sfx('pop', B(7.35) + 0.54, 0.6)
  tl.set(lk.el, { opacity: 0 }, B(8.3))
  // from here the full stop belongs to the title and moves with it
  tl.set(stop, { opacity: 1 }, B(10.6))
  tl.set(guide, { opacity: 0 }, B(10.6))

  // bar 3: the title rises as we come through
  rise(tl, title.words, B(8) - 0.12, { dur: 0.8, stagger: 0.09 })
  rise(tl, kicker.words, B(8) + 0.3, { dur: 0.6, stagger: 0.05 })

  // ---------------------------------------------------------------- the product assembles
  // "One platform that runs the whole academy": the title makes room
  leave(tl, kicker.words, B(12.6), { stagger: 0.02 })
  tl.to(group, { y: -362, scale: 0.5, duration: 1.0, ease: 'glide' }, B(13))
  const sub = text('t-body', 'One platform that runs the whole academy.', { style: { whiteSpace: 'nowrap', fontSize: '34px', fontWeight: '550' } })
  add(root, sub.el)
  const sb = stageBox(sub.el)
  put(sub.el, 960 - sb.w / 2, 214)
  rise(tl, sub.words, B(13.6), { stagger: 0.045, dur: 0.6 })

  // "on the web": the back-office rises
  const dev = browser(dash, { url: 'app.hawary.my' })
  add(root, dev.el)
  const WEB = { cx: 960, cy: 706, scale: 0.7 }
  place(dev.el, dev, WEB.cx, WEB.cy + 760, { scale: WEB.scale * 0.92, rotationX: 22 })
  tl.to(dev.el, { y: WEB.cy - dev.h / 2, scale: WEB.scale, rotationX: 5, duration: 1.0, ease: 'swift' }, B(18.4))
  sfx('whoosh', B(18.4), 0.5)

  // the dashboard's own tiles answer, one per half beat
  const tiles = ['statStudents', 'statEnrollments', 'statPublished', 'statCollected'].map((n) => lift(dev, dash.tag(n)))
  tiles.forEach((el, i) => {
    liftUp(tl, el, B(23 + i * 0.5), { scale: 1.07, y: -5, dur: 0.3 })
    liftDown(tl, el, B(23.9 + i * 0.5), 0.3)
    sfx('tick', B(23 + i * 0.5), 0.8)
  })

  // "and in your pocket": the two apps
  const phones: Array<{ el: HTMLElement; home: { x: number; y: number }; side: number }> = []
  const addPhone = (sh: NonNullable<typeof sHome>, cx: number, side: number, at: number) => {
    const p = phone(sh)
    add(root, p.el)
    place(p.el, p, cx, 790 + 760, { scale: 0.66, rotationY: side * 16, rotationZ: -side * 2.5 })
    tl.to(p.el, { y: 790 - p.h / 2, duration: 0.9, ease: 'swift' }, at)
    sfx('whoosh', at, 0.35, -side * 0.5)
    phones.push({ el: p.el, home: { x: cx - p.w / 2, y: 790 - p.h / 2 }, side })
  }
  if (sHome) addPhone(sHome, 392, 1, B(20.6))
  if (aHome) addPhone(aHome, 1528, -1, B(21.2))

  const labels = [
    { c: chip('Web', { icon: 'monitor', sm: true }), x: 906, y: 312, at: 19.6 },
    ...(sHome ? [{ c: chip('Student app', { icon: 'smartphone', sm: true }), x: 300, y: 440, at: 21.5 }] : []),
    ...(aHome ? [{ c: chip('Academy app', { icon: 'smartphone', sm: true }), x: 1434, y: 440, at: 22.1 }] : []),
  ]
  for (const l of labels) {
    add(root, put(l.c, l.x, l.y))
    popIn(tl, l.c, B(l.at))
    sfx('pop', B(l.at), 0.45)
  }

  // ---------------------------------------------------------------- bar 8 (the fill): into the app
  popOut(tl, labels.map((l) => l.c), B(27.6))
  leave(tl, sub.words, B(27.8), { stagger: 0.012 })
  tl.to(group, { y: -620, duration: 0.5, ease: 'swiftIn' }, B(28))
  for (const p of phones) tl.to(p.el, { x: p.home.x - p.side * 900, rotationY: p.side * 34, duration: 0.7, ease: 'swiftIn' }, B(28.2))
  // push in on the sidebar and open Courses: the next scene is that page
  const nav = dash.find({ text: 'Courses', tag: 'a' })
  tl.to(dev.el, { ...focus(dev, nav, { cx: 760, cy: 520, scale: 2.1 }), duration: 1.3, ease: 'glide' }, B(28.4))
  sfx('rise', B(32), 0.5)
  const mouse = cursor(dev, { x: 420, y: 330 })
  moveTo(tl, mouse, pt(nav, 0.62, 0.62), B(29.6), 0.7)
  click(tl, mouse, B(31.3))
  sfx('click', B(31.3))
  const navLift = lift(dev, nav, { radius: 10 })
  liftUp(tl, navLift, B(31.3), { scale: 1.06, y: -2, dur: 0.25 })

  // ---------------------------------------------------------------- life
  onFrame((_t, beat) => {
    // devices hover while they are on show
    if (beat > 20.4 && beat < 28.4) gsap.set(dev.el, { rotationY: Math.sin(beat * 0.4) * 1.2 })
    for (const p of phones) if (beat > 23 && beat < 28.2) gsap.set(p.el, { rotationX: Math.sin(beat * 0.5 + p.side) * 1.5 })
  })
}
