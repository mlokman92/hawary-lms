import type { SceneCtx } from '../engine'
import type { Device, Layer } from '../kit'
import { add, browser, chip, click, dot, gsap, h, hidePointer, leave, lift, liftDown, liftUp, moveTo, phone, popIn, pt, put, ring, rise, scrollPane, shot, stageBox, text, touch } from '../kit'

// Bars 25-26 (48-52s): the groove thins out. One idea, done cleanly.
// VO: beat 0.8 "Need time with a trainer?" | beat 3.7 "Book it in a few taps."
//
// A  beats 0-4   the Student app's booking tab, whole and upright; the staff diary out of focus behind it
// B  beats 4-8   tap 11:00 -> the form opens and the camera commits; tap Book -> booked, and the amber
//                dot carries the booking across into the diary's own Thu 8 / 11:00 slot. Hold to the cut.

/** Device vars that put its centre at (cx, cy) at a scale (transformOrigin is the centre). */
const at = (dev: Device, cx: number, cy: number, scale: number) => ({ x: cx - dev.w / 2, y: cy - dev.h / 2, scale })

/** Where a point of a screen (shot px) is on the stage right now, through the device's 3D transform. */
function stagePoint(layer: Layer, p: { x: number; y: number }) {
  const m = h('div.abs', { style: { left: `${p.x - 1}px`, top: `${p.y - 1}px`, width: '2px', height: '2px' } })
  layer.ov.append(m)
  const b = stageBox(m)
  m.remove()
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 }
}

export default async function appointments({ root, tl, B, sfx, onFrame }: SceneCtx) {
  const sBook = await shot('student/appointments')
  const sPicked = await shot('student/appointments-picked')
  const sDiary = await shot('web/appointments-this-week') // the week of 5-11 Oct: Thu 8 is in it

  // ---------------------------------------------------------------- the two devices
  // The diary is a shorter browser window, its page scrolled a little so the week sits right under
  // the app's own header: the frame's edge then crosses the grid, not a row of buttons.
  const VIEW = 700
  const diary = browser(sDiary, { url: 'app.hawary.my/appointments', viewH: VIEW })
  const page = scrollPane(diary, sDiary, { region: { x: 257, y: 57, w: 1183, h: VIEW - 57 } })
  gsap.set(page.inner, { y: -88 })
  const ph = phone(sBook)
  add(root, diary.el, ph.el)

  // the phone only ever sways a degree; the diary keeps its angle and floats
  const swayP = (beat: number) => ({ rotationY: Math.sin(beat * 0.5 + 0.4) * 1.1, rotationX: Math.sin(beat * 0.37 + 1.2) * 0.6 })
  const swayD = (beat: number) => ({ rotationY: -18 + Math.sin(beat * 0.45 + 0.6) * 0.9, rotationX: 3 + Math.sin(beat * 0.6) * 0.5, rotationZ: 0.4 })

  const P_A = at(ph, 970, 546, 1.04) //     whole phone
  const P_B = at(ph, 1000, 710, 1.34) //    pushed in: the frame cuts it between two day rows, above the tab bar
  const D_A = at(diary, 1490, 455, 0.675) // far behind: its sidebar is hidden by the phone, the week runs off to the right
  const D_B = at(diary, 1517, 440, 0.69)
  const D_C = { ...D_B, scale: 0.7 } //     the diary steps forward to answer

  const book = sPicked.tag('book')
  const slot = sPicked.tag('slot-picked')
  // Thu 8 / 11:00 in the diary: the place a session block would take (column + 4, row + 4, as its neighbours)
  const cell = { x: 819, y: 449, w: 121, h: 42, radius: 8 }

  // Measure, in the landed composition, where the Book button and the diary slot are on the stage.
  gsap.set(ph.el, { ...P_B, ...swayP(5.5) })
  gsap.set(diary.el, { ...D_C, ...swayD(6.5) })
  const launch = stagePoint(ph, pt(book))
  const land = stagePoint(page, pt(cell))
  gsap.set(ph.el, { ...P_A, ...swayP(-1) })
  gsap.set(diary.el, { ...D_A, ...swayD(-1), filter: 'blur(2px)' })

  // ---------------------------------------------------------------- A: "Need time with a trainer?"
  const head = text('t-h1', 'Time with\na *trainer*?')
  add(root, put(head.el, 116, 436))
  rise(tl, head.words, B(0.5), { stagger: 0.07 })

  // a slow push while she asks
  tl.to(ph.el, { scale: 1.07, duration: B(4), ease: 'none' }, 0)
  tl.to(diary.el, { scale: 0.68, duration: B(4), ease: 'none' }, 0)

  const finger = touch(ph, { x: 322, y: 388 })
  moveTo(tl, finger, pt(slot, 0.5, 0.56), B(2), 0.75)

  // ---------------------------------------------------------------- B: "Book it in a few taps."
  leave(tl, head.words, B(2.8), { stagger: 0.02 })
  const head2 = text('t-h1', 'Book it in\n*a few taps*.')
  add(root, put(head2.el, 116, 436))
  rise(tl, head2.words, B(3.5), { stagger: 0.06, dur: 0.6 })

  // tap 11:00 -> the picked state. The two shots are pixel-aligned, so the slot turns teal in place and
  // the rows below (a live copy of the first shot) slide down to uncover the form, as the app does.
  const picked = ph.layer(sPicked)
  const OPEN = sPicked.tag('day-open').h - sBook.tag('day-open').h
  const CUT = 286 // just under the slots: the card's bottom edge travels with the rows
  const FLOOR = sBook.tag('tabbar').y - 6 // the tab bar stays put
  const win = h('div.abs', { style: { left: '0px', top: `${CUT}px`, width: `${sBook.w}px`, height: `${FLOOR - CUT}px`, overflow: 'hidden', opacity: '0' } })
  const rows = h('div.abs', { style: { width: `${sBook.w}px`, height: `${FLOOR - CUT}px`, overflow: 'hidden' } })
  const rowsImg = sBook.img()
  Object.assign(rowsImg.style, { position: 'absolute', left: '0', top: `${-CUT}px`, maxWidth: 'none' })
  rows.append(rowsImg)
  win.append(rows)
  ph.ov.append(win)

  const TAP1 = B(4)
  click(tl, finger, TAP1)
  sfx('tap', TAP1)
  tl.set([picked, win], { opacity: 1 }, TAP1 + 0.03)
  tl.to(rows, { y: OPEN, duration: 0.36, ease: 'power3.out' }, TAP1 + 0.03)
  tl.set(win, { opacity: 0 }, TAP1 + 0.5)

  const slotLift = lift(ph, slot, { from: sPicked, radius: 14 })
  gsap.set(slotLift, { opacity: 0 })
  tl.set(slotLift, { opacity: 1 }, TAP1 + 0.03)
  liftUp(tl, slotLift, TAP1 + 0.03, { scale: 1.1, y: -2, dur: 0.32 })
  liftDown(tl, slotLift, B(4.75), 0.3)

  // the camera commits on the tap and lands with the next one
  tl.to(ph.el, { ...P_B, duration: 0.75, ease: 'glide' }, TAP1)
  tl.to(diary.el, { ...D_B, duration: 0.75, ease: 'glide' }, TAP1)

  // the trainer she asked for is already in the form
  const who = lift(ph, sPicked.tag('instructor'), { from: sPicked, radius: 14 })
  gsap.set(who, { opacity: 0 })
  tl.set(who, { opacity: 1 }, B(5) - 0.02)
  liftUp(tl, who, B(5), { scale: 1.035, y: -2, dur: 0.3 })
  liftDown(tl, who, B(5.6), 0.3)

  // tap Book
  const TAP2 = B(5.5)
  moveTo(tl, finger, pt(book, 0.5, 0.58), B(4.4), 0.45)
  click(tl, finger, TAP2)
  sfx('tap', TAP2)
  hidePointer(tl, finger, B(5.75))
  const bookLift = lift(ph, book, { from: sPicked, radius: 16 })
  gsap.set(bookLift, { opacity: 0 })
  tl.set(bookLift, { opacity: 1 }, TAP2)
  liftUp(tl, bookLift, TAP2, { scale: 1.045, y: -2, dur: 0.3 })
  liftDown(tl, bookLift, B(6.5), 0.35)

  // booked
  const done = chip('Booked · Thu 8 Oct, 11:00', { icon: 'calendar-check', tone: 'teal' })
  add(root, put(done, P_B.x + ph.w / 2 + (ph.w / 2) * P_B.scale - 26, launch.y - 29))
  popIn(tl, done, B(6))
  sfx('success', B(6), 0.8)

  // ...and the staff diary has it: the dot leaves the button and lands in Thu 8 / 11:00
  tl.to(diary.el, { scale: D_C.scale, filter: 'blur(0px)', duration: 0.5, ease: 'glide' }, B(5.5))
  const PIN = 28 // diary px: about 20 on the stage
  const FLY = 24
  const fly = dot(FLY)
  const flyEnd = (PIN * D_C.scale) / FLY
  gsap.set(fly, { x: launch.x, y: launch.y, scale: 0.3, opacity: 0 })
  add(root, fly)
  tl.set(fly, { opacity: 1 }, TAP2)
  tl.to(fly, { scale: 1.15, duration: 0.2, ease: 'power2.out' }, TAP2)
  tl.to(fly, { scale: flyEnd, duration: 0.3, ease: 'power2.in' }, TAP2 + 0.2)
  tl.to(fly, { x: land.x, duration: 0.5, ease: 'none' }, TAP2)
  tl.to(fly, { y: land.y - 56, duration: 0.34, ease: 'sine.out' }, TAP2)
  tl.to(fly, { y: land.y, duration: 0.16, ease: 'sine.in' }, TAP2 + 0.34)

  const LAND = B(6.5)
  const slotRing = ring(page, cell, 3)
  const pin = dot(PIN)
  gsap.set(pin, { x: pt(cell).x, y: pt(cell).y, opacity: 0 })
  page.ov.append(pin)
  tl.set(fly, { opacity: 0 }, LAND)
  tl.set(pin, { opacity: 1 }, LAND)
  tl.to(pin, { scaleY: 0.7, scaleX: 1.25, duration: 0.06, ease: 'power1.out' }, LAND)
  tl.to(pin, { scaleX: 1, scaleY: 1, duration: 0.4, ease: 'pop' }, LAND + 0.06)
  tl.fromTo(slotRing, { opacity: 0, scale: 1.25 }, { opacity: 1, scale: 1, duration: 0.4, ease: 'pop', immediateRender: false }, LAND)
  sfx('pop', LAND, 0.4, 0.4)

  // breathing to the cut
  tl.to(ph.el, { scale: P_B.scale + 0.012, duration: B(9) - B(5.5), ease: 'none' }, B(5.5))
  tl.to(diary.el, { scale: D_C.scale + 0.006, duration: B(9) - B(6.5), ease: 'none' }, B(6.5))

  // ---------------------------------------------------------------- life
  onFrame((_t, beat) => {
    gsap.set(ph.el, swayP(beat))
    gsap.set(diary.el, swayD(beat))
  })
}
