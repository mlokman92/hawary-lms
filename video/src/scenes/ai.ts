import './ai.css'
import { bg } from '../background'
import type { SceneCtx } from '../engine'
import type { Layer, Rect, Shot } from '../kit'
import { add, chip, click, counter, countTo, cursor, dot, gsap, h, hidePointer, leave, lift, liftDown, liftUp, moveTo, phone, place, popIn, popOut, put, rise, scrollPane, shot, stageBox, text } from '../kit'

// Bars 33-36 (64.07-72.07s): THE DROP. The film's biggest section starts on beat 0.
// VO (beat 0.9): "AI checks it at once," | beat 3.5 "and sends feedback in seconds." |
//                beat 7.7 "Trainers just monitor," | beat 10.3 "and approve."
//
// No browser window in this scene: every screen is a 4x close-up of the real
// product, cut to the card's own edge and floated on the paper as a panel.
//
// A  beats 0-5     lights up ON the AI's answer: the real timeline entry, its three points struck on 2, 3, 4
//    beats 5-8     the same feedback, already on her phone (the dot carries it across, ding on 5.5)
// B  beats 8-10.5  CUT to the trainer's queue: the AI check column runs down the list
// C  beats 10.5-13 her row opens -> the AI says all 12 are met (11.5) -> the trainer presses Approved (12)
// D  beats 13.5-16 the pay-off line; the dot is its full stop (14.5)
//
// Local helpers (the kit has no equivalent): panel() a floating crop of a shot
// that kit.lift / kit.cursor can work on, piece() one rect of a shot in a
// stack, hilite() a highlighter stroke over a line of real text.

const L = 116 // the left margin every composition hangs from
const WIDE = 1688 // a panel that spans the frame between the safe margins

interface Panel extends Layer {
  el: HTMLElement
  clip: HTMLElement
  w: number
  h: number
}

/** A floating crop of a captured screen: `r` of shot `s`, with an overlay in the shot's own pixels (so kit.lift / kit.cursor work on it). */
function panel(s: Shot, r: Rect, radius = 26): Panel {
  const el = h('div.ai-panel', { style: { width: `${r.w}px`, height: `${r.h}px` } })
  const clip = h('div.ai-panel-clip', { style: { borderRadius: `${radius}px` } })
  const im = s.img()
  im.style.left = `${-r.x}px`
  im.style.top = `${-r.y}px`
  clip.append(im)
  const ov = h('div.view-ov', { style: { left: `${-r.x}px`, top: `${-r.y}px`, width: `${s.w}px`, height: `${s.h}px` } })
  el.append(clip, ov)
  return { el, clip, ov, shot: s, w: r.w, h: r.h }
}

/** One rect of a shot as a block `top` px down a stack (the thread's own entries, re-stacked as they sit on the page). */
function piece(s: Shot, r: Rect, top: number, cls = 'ai-piece'): HTMLElement {
  const el = h('div.' + cls, { style: { left: '0px', top: `${top}px`, width: `${r.w}px`, height: `${r.h}px` } })
  const im = s.img()
  im.style.left = `${-r.x}px`
  im.style.top = `${-r.y}px`
  el.append(im)
  return el
}

/** A highlighter stroke over a line of text (x0..x1 and the line's top, in the parent's pixels). Hidden: tween its scaleX to 1 to draw it left to right. */
function hilite(parent: HTMLElement, x0: number, x1: number, y: number, amber = false): HTMLElement {
  const el = h('div.ai-hl' + (amber ? '.amber' : ''), { style: { left: `${x0 - 5}px`, top: `${y + 0.5}px`, width: `${x1 - x0 + 10}px`, height: '19px' } })
  gsap.set(el, { scaleX: 0 })
  parent.append(el)
  return el
}

export default async function ai({ root, tl, B, sfx, onFrame, music }: SceneCtx) {
  const [ev, rep, repFull, queue, pass, reply, done] = await Promise.all([
    shot('web/macro-ai-event'),
    shot('student/report-2'),
    shot('student/report-2-full'),
    shot('web/macro-lpkc-queue'),
    shot('web/macro-ai-pass'),
    shot('web/macro-lpkc-approve'),
    shot('web/lpkc-thread-4'),
  ])

  const gA = h('div.ai-group')
  const gB = h('div.ai-group')
  const gD = h('div.ai-group')
  add(root, gA, gB, gD)
  gsap.set(gB, { opacity: 0 })

  // ---------------------------------------------------------------- A: lights up on the answer
  tl.fromTo(bg, { ink: 1 }, { ink: 0, duration: 0.14, ease: 'none', immediateRender: false }, B(0))
  sfx('impact', B(0))

  const evR = ev.tag('aiEvent')
  const card = panel(ev, evR)
  const S1 = WIDE / evR.w
  const A1 = { cx: 960, cy: 657 }
  const A2 = { left: 700, top: 272, scale: 1.25 }
  const floatA = h('div.ai-wrap')

  // the hit throws an outline off the card
  const shock = h('div.ai-shock', { style: { left: `${L}px`, top: `${A1.cy - (evR.h * S1) / 2}px`, width: `${WIDE}px`, height: `${evR.h * S1}px`, borderRadius: `${26 * S1}px`, opacity: '0' } })
  add(gA, shock, add(floatA, card.el))
  tl.fromTo(shock, { scaleX: 1, scaleY: 1, opacity: 0.9 }, { scaleX: 1 + 110 / WIDE, scaleY: 1 + 110 / (evR.h * S1), opacity: 0, duration: 0.6, ease: 'power2.out', immediateRender: false }, B(0))

  // the real entry slams down, already there on the first frame
  place(card.el, card, A1.cx, A1.cy, { scale: S1 * 1.14 })
  tl.to(card.el, { scale: S1, duration: 0.45, ease: 'back.out(2)' }, B(0) - 0.03)

  const head = text('t-h1', 'Checked in\n*40 seconds*.')
  add(gA, put(head.el, L, 208))
  const num = head.words[2]
  num.style.fontVariantNumeric = 'tabular-nums'
  num.style.textAlign = 'left'
  num.style.minWidth = `${stageBox(num).w}px`
  const secs = counter(num, 0, (v) => String(Math.round(v)))
  rise(tl, head.words, B(0) - 0.1, { stagger: 0.05, dur: 0.6 })
  countTo(tl, secs, 40, B(0) + 0.04, 0.7)
  // for the two or three frames the room is still dark, the type is light
  tl.fromTo(head.el, { color: '#ffffff' }, { color: '#111113', duration: 0.14, ease: 'none', immediateRender: false }, B(0))
  tl.fromTo(head.words.slice(2), { color: '#2dd4bf' }, { color: '#0f766e', duration: 0.14, ease: 'none', immediateRender: false }, B(0))

  // beats 2, 3, 4: the three points, one stroke each (text extents measured from the close-up)
  const points = [
    { x0: 68.8, x1: 560, y: 88 },
    { x0: 68.5, x1: 437.3, y: 108 },
    { x0: 69, x1: 413, y: 128 },
  ]
  points.forEach((p, i) => {
    const bar = hilite(card.ov, p.x0, p.x1, p.y, i === 0)
    tl.to(bar, { scaleX: 1, duration: 0.3, ease: 'swift' }, B(2 + i) - 0.04)
    sfx('tick', B(2 + i), 0.8)
  })

  // beat 5: pull back and pan — her phone is already showing it
  leave(tl, head.words, B(4.1), { stagger: 0.015, dur: 0.26 })
  const A2x = A2.left + (evR.w * A2.scale) / 2 - card.w / 2
  tl.to(card.el, { x: A2x, y: A2.top + (evR.h * A2.scale) / 2 - card.h / 2, scale: A2.scale, duration: 0.42, ease: 'glide' }, B(5) - 0.4)
  sfx('whoosh', B(5) - 0.36, 0.5)

  const ph = phone(rep, { time: '9:13' })
  const pane = scrollPane(ph, repFull, { region: { x: 0, y: 64, w: 390, h: 699 }, bg: rep.bottomColor })
  gsap.set(pane.inner, { y: -190 })
  add(gA, ph.el)
  const PH = { cx: 372, scale: 1.3, top: 64 }
  place(ph.el, ph, PH.cx, PH.top + (ph.h * PH.scale) / 2, { scale: PH.scale, rotationY: 8, rotationZ: -1.5 })
  const phX = PH.cx - ph.w / 2
  gsap.set(ph.el, { x: phX - 900 })
  tl.to(ph.el, { x: phX, duration: 0.42, ease: 'glide' }, B(5) - 0.4)
  // she is reading it: the page keeps creeping up
  tl.to(pane.inner, { y: -272, duration: B(8.4) - B(4.4), ease: 'none' }, B(4.4))

  // the dot carries it across: from the AI's entry to her screen, landing on the ding
  const guide = dot(30)
  const from = { x: A2.left + 30 * A2.scale, y: A2.top + 28 * A2.scale }
  const to = { x: PH.cx, y: 530 }
  gsap.set(guide, { x: from.x, y: from.y, scale: 0, opacity: 0 })
  add(gA, guide)
  tl.set(guide, { opacity: 1 }, B(5) - 0.02)
  tl.to(guide, { scale: 1, duration: 0.12, ease: 'pop' }, B(5) - 0.02)
  tl.to(guide, { x: to.x, duration: 0.2, ease: 'power2.inOut' }, B(5.5) - 0.2)
  tl.to(guide, { y: from.y - 70, duration: 0.08, ease: 'power2.out' }, B(5.5) - 0.2)
  tl.to(guide, { y: to.y, duration: 0.12, ease: 'power2.in' }, B(5.5) - 0.12)
  tl.to(guide, { scale: 0, duration: 0.14, ease: 'power2.in' }, B(5.5))
  tl.set(guide, { opacity: 0 }, B(5.5) + 0.15)

  const onPhone = lift(pane, repFull.tag('event-ai'), { pad: 10, radius: 14 })
  liftUp(tl, onPhone, B(5.5), { scale: 1.05, y: -3, dur: 0.4 })
  sfx('ding', B(5.5), 0.9, -0.4)

  const headA2 = text('t-h1', 'Feedback,\n*instantly*.')
  add(gA, put(headA2.el, A2.left, A2.top + evR.h * A2.scale + 70))
  rise(tl, headA2.words, B(5.5) - 0.04, { stagger: 0.09, dur: 0.6 })

  // ---------------------------------------------------------------- B: CUT to the trainer
  tl.set(gA, { opacity: 0 }, B(8))
  tl.set(gB, { opacity: 1 }, B(8))

  const tabR = { x: 12, y: 12, w: 1136, h: 487 }
  const table = panel(queue, tabR)
  const S2 = WIDE / tabR.w
  const TOP2 = 244
  const row7 = queue.tag('row7') // Nur Aisyah Razak
  const rowY = TOP2 + (row7.y - tabR.y + row7.h / 2) * S2
  const wT = h('div.ai-wrap')
  const wC = h('div.ai-wrap')
  gsap.set([wT, wC], { transformOrigin: `960px ${rowY}px` })

  const headB = text('t-h1', 'Trainers *monitor*.')
  add(gB, put(headB.el, L, 96), add(wT, table.el), wC)
  place(table.el, table, 960, TOP2 + (tabR.h * S2) / 2, { scale: S2 })
  rise(tl, headB.words, B(8) - 0.12, { stagger: 0.07, dur: 0.6 }) // already half up on the first frame after the cut
  // the cut lands: the list settles back a touch
  gsap.set(wT, { scale: 1.04 })
  tl.to(wT, { scale: 1, duration: 0.7, ease: 'swift' }, B(8) - 0.02)

  // a label over the column the trainer reads
  const colChip = chip('AI check', { icon: 'sparkles', sm: true })
  add(gB, colChip)
  const colX = L + ((queue.tag('ai5').x + queue.tag('ai8').x + queue.tag('ai8').w) / 2 - tabR.x) * S2
  put(colChip, colX - stageBox(colChip).w / 2, TOP2 - 44 - 14)
  popIn(tl, colChip, B(8.5) - 0.06)

  // the AI check cells run down the list, one per quarter beat; hers stays up
  const rowLift = lift(table, row7, { radius: 6 })
  for (let n = 1; n <= 8; n++) {
    const at = 8.5 + (n - 1) * 0.25
    // (1.16 is as far as a cell can grow before it covers the end of the date beside it)
    const cell = lift(table, queue.tag(`ai${n}`), { pad: 2, radius: 12 })
    liftUp(tl, cell, B(at), { scale: 1.16, y: -2, dur: 0.28 })
    if (n !== 7) liftDown(tl, cell, B(at + 0.75), 0.25)
    if (n % 2 === 1) sfx('tick', B(at), 0.55)
  }

  const mouse = cursor(table, { x: 660, y: 262 })
  moveTo(tl, mouse, { x: row7.x + 300, y: row7.y + 36 }, B(9.5), 0.4)
  liftUp(tl, rowLift, B(10.25), { scale: 1.012, y: -2, dur: 0.22 })
  click(tl, mouse, B(10.5))
  sfx('click', B(10.5))

  // ---------------------------------------------------------------- C: her thread, and the approval
  // The click pushes through her row; the end of her thread comes forward: the
  // AI's second check and the reply box, stacked exactly as they sit on the page.
  const open = B(10.5) + 0.03
  tl.to(wT, { scale: 1.16, opacity: 0, duration: 0.24, ease: 'power2.in' }, open)
  popOut(tl, colChip, B(10.5))
  sfx('whoosh', B(10.5), 0.45)

  const S3 = WIDE / 896
  const passR = pass.tag('aiEvent') // 896 x 108
  const boxR = { x: 12, y: 12, w: 896, h: 141 } // the reply box, to the card's own bottom edge
  const okR = { x: 400, y: 671, w: 896, h: 69 } // the trainer's entry, as the page shows it after approval
  const boxR2 = { x: 400, y: 740, w: 896, h: 141 }
  const H0 = passR.h + boxR.h
  const tail = h('div.ai-panel', { style: { width: '896px', height: `${H0}px` } })
  const tclip = h('div.ai-panel-clip', { style: { borderRadius: '26px', height: `${H0}px` } })
  const pOk = piece(done, okR, passR.h)
  const pBox = piece(reply, boxR, passR.h)
  const pBox2 = piece(done, boxR2, passR.h)
  gsap.set([pOk, pBox2], { opacity: 0 })
  add(tclip, piece(pass, passR, 0), pOk, pBox, pBox2)
  const tov = h('div.abs') // overlay in the stack's own pixels
  add(wC, add(tail, tclip, tov))
  const TOP3 = 336
  gsap.set(tail, { transformOrigin: '0 0', x: L, y: TOP3, scale: S3 })
  gsap.set(wC, { opacity: 0, scale: 0.8 })
  tl.to(wC, { opacity: 1, duration: 0.1, ease: 'none' }, open + 0.08)
  tl.to(wC, { scale: 1, duration: 0.5, ease: 'swift' }, open + 0.06)

  // beat 11.5: "All 12 checklist items are met."
  const met = hilite(tov, 191.8 - passR.x, 374.5 - passR.x, 48 - passR.y)
  tl.to(met, { scaleX: 1, duration: 0.3, ease: 'swift' }, B(11.5) - 0.04)
  sfx('tick', B(11.5), 0.7)

  // beat 12: the trainer presses the real Approved button
  const btn = reply.tag('approveButton')
  const press = { x: btn.x - boxR.x + btn.w * 0.56, y: passR.h + btn.y - boxR.y + btn.h * 0.6 }
  const mouse2 = cursor({ ov: tov, shot: pass }, { x: press.x - 190, y: press.y - 96 })
  moveTo(tl, mouse2, press, B(11.25), 0.34)
  click(tl, mouse2, B(12))
  sfx('click', B(12))

  // the page answers: her entry appears and the reply box moves down to make room
  const ok = B(12) + 0.03
  tl.set(pBox, { opacity: 0 }, ok)
  tl.set([pOk, pBox2], { opacity: 1 }, ok)
  tl.to(pBox2, { y: okR.h, duration: 0.34, ease: 'swift' }, ok)
  tl.to(tclip, { height: H0 + okR.h, duration: 0.34, ease: 'swift' }, ok)
  tl.to(tail, { y: 250, duration: 0.45, ease: 'swift' }, ok)
  const okLift = piece(done, okR, passR.h, 'lift')
  gsap.set(okLift, { opacity: 0 })
  tov.append(okLift)
  tl.set(okLift, { opacity: 1 }, ok + 0.14)
  liftUp(tl, okLift, ok + 0.14, { scale: 1.016, y: -3, dur: 0.4 })
  hidePointer(tl, mouse2, B(12.4))

  const okChip = chip('Approved by the trainer', { icon: 'check', tone: 'teal' })
  add(gB, okChip)
  put(okChip, L + (btn.x - boxR.x + btn.w / 2) * S3 - stageBox(okChip).w / 2, 250 + (H0 + okR.h) * S3 + 24)
  popIn(tl, okChip, B(12) + 0.08)
  sfx('success', B(12) + 0.05, 0.9)

  // ---------------------------------------------------------------- D: the pay-off
  leave(tl, headB.words, B(13) - 0.1, { stagger: 0.02, dur: 0.28 })
  popOut(tl, okChip, B(13))
  tl.to(wC, { y: 46, scale: 0.95, opacity: 0, duration: 0.24, ease: 'power2.in' }, B(13) - 0.02)
  sfx('whoosh', B(13), 0.35)

  const SIZE = 164
  const pay = text('t-display', 'Less checking.\n*More teaching*', { style: { fontSize: `${SIZE}px`, whiteSpace: 'nowrap' } })
  const gP = h('div.abs')
  add(gD, add(gP, pay.el))
  const pb = stageBox(pay.el)
  const STOP = 34 // the full stop is the logo's dot
  const last = stageBox(pay.words[3])
  const stopIn = { x: last.x - pb.x + last.w + 9 + STOP / 2, y: last.y - pb.y + SIZE * 0.76 }
  gP.style.width = `${pb.w}px`
  gP.style.height = `${pb.h}px`
  put(gP, 960 - pb.w / 2, 532 - pb.h / 2)
  gsap.set(gP, { transformOrigin: '50% 50%' })
  const stop = dot(STOP)
  gsap.set(stop, { x: stopIn.x, y: stopIn.y - 74, opacity: 0 }) // a short drop: it must not pass the first line's own full stop
  add(gP, stop)

  rise(tl, pay.words.slice(0, 2), B(13.5) - 0.08, { stagger: 0.07, dur: 0.6 })
  rise(tl, pay.words.slice(2), B(14) - 0.08, { stagger: 0.07, dur: 0.6 })
  // beat 14.5: the dot drops in as the full stop
  tl.set(stop, { opacity: 1 }, B(14.5) - 0.16)
  tl.to(stop, { y: stopIn.y, duration: 0.16, ease: 'power2.in' }, B(14.5) - 0.16)
  tl.to(stop, { scaleY: 0.7, scaleX: 1.22, y: stopIn.y + 5, duration: 0.06, ease: 'power1.out' }, B(14.5))
  tl.to(stop, { scaleY: 1, scaleX: 1, y: stopIn.y, duration: 0.4, ease: 'pop' }, B(14.5) + 0.06)
  sfx('pop', B(14.5), 0.6)
  // held with a slow push until the whip
  tl.fromTo(gP, { scale: 1 }, { scale: 1.04, duration: B(17) - B(13.4), ease: 'none', immediateRender: false }, B(13.4))

  // ---------------------------------------------------------------- life
  onFrame((t, beat) => {
    // the answer floats, leans in a hair while it is being read, and takes the kick
    const bump = beat > 0.5 ? music.pulse(t, 3) * 0.005 : 0
    gsap.set(floatA, { y: Math.sin(beat * 0.75) * 5, scale: 1 + 0.0026 * Math.max(0, Math.min(beat, 4.3)) + bump })
    gsap.set(ph.el, { rotationY: 8 + Math.sin(beat * 0.8) * 1.3, rotationZ: -1.5 + Math.sin(beat * 0.6 + 1) * 0.35 })
  })
}
