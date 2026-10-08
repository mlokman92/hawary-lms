import { bg } from '../background'
import type { SceneCtx } from '../engine'
import { add, chip, click, dot, gsap, h, hidePointer, icon, leave, lift, liftDown, liftUp, moveTo, phone, place, popIn, popOut, pt, put, rise, shot, stageBox, text, touch } from '../kit'
import './lpkc.css'

// Bars 27-32 (52.07-64.07s): the breakdown, pads only, then a one-bar riser into THE DROP.
// VO (measured on the recording): beat 1.2 "And the" | L 2.3 · P 2.7 · K 3.2 · C 3.5 | 3.9 "report?"
//                                 beat 5.26 "No more waiting" | 6.6 "for a meeting."
//                                 beat 8.56 "Students" | 9.3 "simply" | 9.9 "upload" | 10.5 "it."
//
// The lights go down and the amber dot is the only thing left in the room. It is the point of the
// question mark, it strikes the old meeting out, it waits where the upload will land, and then it
// becomes the checker: the head of the scan line. On the last sixteenth everything falls into it.
//
// A  beats 0-8    the question (spelled as she spells it), and the old way crossed out
// B  beats 8-13.5 the Student app: send (tap on 10), the report leaves the phone, the thread opens (12)
// C  beats 13.5-20 the report takes the centre, phone | page | type; the dot starts reading it (16)
// D  beats 20-24  the riser: the checklist answers faster and faster, the camera pushes in, then nothing
//
// Local helpers (not in the kit): baselineOf() and questionMark() measure real type so the dot can be
// punctuation; the page, the meeting card, the scan line and the dot's halo are film graphics in lpkc.css.

const D0 = 40 // the dot's own size; every other size is a scale of this
const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
const smooth = (a: number, b: number, v: number) => {
  const u = clamp01((v - a) / (b - a))
  return u * u * (3 - 2 * u)
}

/** Where a line of split type keeps its baseline, in stage px. */
function baselineOf(line: HTMLElement): number {
  const probe = h('span', { style: { display: 'inline-block', width: '0px', height: '0px', verticalAlign: 'baseline' } })
  line.append(probe)
  const y = stageBox(probe).y
  probe.remove()
  return y
}

/**
 * The anatomy of the font's "?" as set in `el`: the point's diameter and centre, and the height at
 * which the hook can be cut from it — all relative to the glyph's origin on the baseline. Measured
 * from the glyph itself, so the amber dot can stand in for the point exactly.
 */
function questionMark(el: HTMLElement) {
  const cs = getComputedStyle(el)
  const size = parseFloat(cs.fontSize)
  const fallback = { d: size * 0.19, cx: size * 0.235, cy: -size * 0.09, cut: -size * 0.215 }
  const pad = Math.ceil(size * 0.25)
  const cw = Math.ceil(size * 1.3)
  const ch = Math.ceil(size * 1.6)
  const base = Math.ceil(size * 1.15)
  const cv = document.createElement('canvas')
  cv.width = cw
  cv.height = ch
  const g = cv.getContext('2d', { willReadFrequently: true })
  if (!g) return fallback
  g.font = `${cs.fontWeight} ${size}px ${cs.fontFamily}`
  g.textBaseline = 'alphabetic'
  g.fillText('?', pad, base)
  const px = g.getImageData(0, 0, cw, ch).data
  const ink = (x: number, y: number) => px[(y * cw + x) * 4 + 3] > 70
  const row = (y: number) => {
    for (let x = 0; x < cw; x++) if (ink(x, y)) return true
    return false
  }
  let y = ch - 1
  while (y > 0 && !row(y)) y--
  const bottom = y
  while (y > 0 && row(y)) y--
  const top = y + 1
  while (y > 0 && !row(y)) y--
  const hook = y
  let x0 = cw
  let x1 = 0
  for (let yy = top; yy <= bottom; yy++) for (let x = 0; x < cw; x++) if (ink(x, yy)) {
    if (x < x0) x0 = x
    if (x > x1) x1 = x
  }
  const d = bottom - top + 1
  if (d < size * 0.1 || d > size * 0.32 || hook <= 0) return fallback
  return { d, cx: (x0 + x1 + 1) / 2 - pad, cy: (top + bottom + 1) / 2 - base, cut: (hook + top + 1) / 2 - base }
}

export default async function lpkc({ root, tl, B, sfx, onFrame }: SceneCtx) {
  const sUp = await shot('student/report-upload')
  const sSent = await shot('student/report-1')

  // ---------------------------------------------------------------- lights down
  tl.fromTo(bg, { ink: 0 }, { ink: 1, duration: 0.9, ease: 'power2.out', immediateRender: false }, B(0))

  // ---------------------------------------------------------------- A: the question
  // "The LPKC report?" — set by hand so the letters can be spelled as she spells them, and so the
  // hook of the "?" is its own piece: its point is the amber dot.
  const q1 = h('div.abs.t-display.lpkc-type', { style: { whiteSpace: 'nowrap' } })
  const l1 = h('span.sp-line')
  const word = (t: string, cls = '') => {
    const el = h('span.sp-word' + cls, { text: t })
    l1.append(el)
    return el
  }
  const wThe = word('The')
  word(' ')
  const wLetters = 'LPKC'.split('').map((c) => word(c, '.t-teal'))
  word(' ')
  const wReport = word('report')
  const wHook = word('?')
  q1.append(l1)
  add(root, q1)
  put(q1, 960 - stageBox(q1).w / 2, 381)
  const qm = questionMark(wHook)
  const hookBox = stageBox(wHook)
  const base1 = baselineOf(l1)
  wHook.style.clipPath = `inset(-40% -40% ${(hookBox.y + hookBox.h - (base1 + qm.cut)).toFixed(2)}px -40%)`
  const Pq = { x: hookBox.x + qm.cx, y: base1 + qm.cy }
  const kq = qm.d / D0

  rise(tl, [wThe], B(1.2), { dur: 0.6 })
  ;[2.22, 2.62, 3.1, 3.44].forEach((b, i) => rise(tl, [wLetters[i]], B(b), { dur: 0.5 }))
  // (every rise is over before its word's leave begins: two tweens never hold one word at once)
  rise(tl, [wReport, wHook], B(3.78), { dur: 0.38, stagger: 0.03 })
  // the hook goes first and fast, so the "?" is never seen without its point
  tl.to(wHook, { yPercent: -118, duration: 0.12, ease: 'power2.in' }, B(4.8))
  leave(tl, [wReport, ...wLetters.slice().reverse(), wThe], B(4.8), { dur: 0.2, stagger: 0.004 })

  // the old way: one hour, face to face
  const cardWrap = h('div.abs')
  const card = h(
    'div.lpkc-card',
    null,
    h('div.lpkc-card-ico', { html: icon('calendar-clock', 2) }),
    h('div', null, h('b', { text: 'Semakan LPKC' }), h('span', { text: 'Face to face · 1 hour' })),
  )
  const strike = h('div.lpkc-strike')
  add(cardWrap, card, strike)
  add(root, cardWrap)
  const cb = stageBox(card)
  const CARD_Y = 628
  put(cardWrap, 960 - cb.w / 2, CARD_Y)
  cardWrap.style.width = `${cb.w}px`
  cardWrap.style.height = `${cb.h}px`
  gsap.set(cardWrap, { transformOrigin: '50% 50%' })
  strike.style.width = `${cb.w + 52}px`
  put(strike, -26, cb.h / 2)
  gsap.set(strike, { scaleX: 0 })
  const S0 = { x: 960 - cb.w / 2 - 26, y: CARD_Y + cb.h / 2 }
  const S1 = { x: 960 + cb.w / 2 + 26, y: S0.y }
  popIn(tl, card, B(4.25))
  sfx('pop', B(4.25), 0.3)

  // "No more waiting for a meeting" — the dot will be its full stop
  const q2 = text('t-h1 lpkc-type', 'No more waiting\nfor a *meeting*', { style: { whiteSpace: 'nowrap', textAlign: 'center' } })
  add(root, q2.el)
  put(q2.el, 960 - stageBox(q2.el).w / 2, 349)
  const lastWord = stageBox(q2.words[5])
  const d2 = 22
  const F2 = { x: lastWord.x + lastWord.w + 104 * 0.07 + d2 / 2, y: baselineOf(q2.lines[1]) - d2 / 2 }
  ;[5.25, 5.55, 5.9, 6.5, 6.62, 6.8].forEach((b, i) => rise(tl, [q2.words[i]], B(b), { dur: i < 3 ? 0.5 : 0.36 }))
  leave(tl, q2.words, B(7.55), { dur: 0.22, stagger: 0.008 })

  // ---------------------------------------------------------------- B: the Student app
  // Pushed in on the send sheet (the phone's foot in frame), then, as the app opens the thread on
  // beat 12, the camera tilts up to its head.
  const dev = phone(sUp)
  const shade = h('div.lpkc-shade')
  dev.el.append(shade)
  add(root, dev.el)
  const S = 1.45
  const PX = 940
  const PB = { cx: PX, cy: 1012 - (dev.h * S) / 2 }
  const PT = { cx: PX, cy: 53 + (dev.h * S) / 2 }
  const REC = { cx: 384, cy: 584, scale: 0.62 } // where it steps back to in C
  /** a point of the phone's screen (shot px) on the stage, for a given phone position */
  const onStage = (p: { cx: number; cy: number }, x: number, y: number) => ({ x: p.cx + (12 + x - dev.w / 2) * S, y: p.cy + (59 + y - dev.h / 2) * S })
  place(dev.el, dev, PB.cx, PB.cy + 1180, { scale: S, rotationX: 14, opacity: 0 })
  tl.set(dev.el, { opacity: 1 }, B(8))
  tl.to(dev.el, { y: PB.cy - dev.h / 2, rotationX: 0, duration: 0.95, ease: 'swift' }, B(8))
  sfx('whoosh', B(8), 0.4)

  const up = text('t-h3 lpkc-type', 'Students simply\n*upload it*.', { style: { fontSize: '60px', lineHeight: '1.08', whiteSpace: 'nowrap' } })
  add(root, put(up.el, 116, 446))
  ;[8.5, 9.2, 9.8, 10.4].forEach((b, i) => rise(tl, [up.words[i]], B(b), { dur: 0.55 }))
  leave(tl, up.words, B(13.3), { stagger: 0.02 })

  // the tap, on "upload"
  const send = sUp.tag('send')
  const btn = lift(dev, send, { radius: 16 })
  const finger = touch(dev, { x: 322, y: 628 })
  moveTo(tl, finger, pt(send, 0.52, 0.5), B(9.0), 0.5)
  click(tl, finger, B(10))
  sfx('tap', B(10))
  tl.to(btn, { scale: 0.965, duration: 0.07, ease: 'power2.in' }, B(10) - 0.07)
  tl.to(btn, { scale: 1, duration: 0.3, ease: 'pop' }, B(10))
  hidePointer(tl, finger, B(10.3))
  const fileRow = sUp.tag('file-1')
  const row = lift(dev, fileRow, { radius: 8 })
  liftUp(tl, row, B(10.15), { scale: 1.05, y: -5, dur: 0.35 })
  liftDown(tl, row, B(11.1), 0.3)

  // the app pushes the thread in (it really does route to the report after sending)
  const base = dev.scroll.querySelector('img.shot') as HTMLElement
  const sent = dev.layer(sSent)
  gsap.set(sent, { x: 390, opacity: 1 })
  tl.set([btn, row], { opacity: 0 }, B(11.5))
  tl.to(sent, { x: 0, duration: 0.42, ease: 'swift' }, B(11.5))
  tl.to(base, { x: -120, duration: 0.42, ease: 'swift' }, B(11.5))
  tl.to(dev.el.querySelector('.phone-status'), { backgroundColor: sSent.topColor, duration: 0.3, ease: 'none' }, B(11.5))
  tl.to(dev.el.querySelector('.phone-home'), { backgroundColor: sSent.bottomColor, duration: 0.3, ease: 'none' }, B(11.5))
  tl.to(dev.el, { y: PT.cy - dev.h / 2, duration: 0.8, ease: 'glide' }, B(11))
  const ev = lift(dev, sSent.tag('event-v1'), { pad: 10, from: sSent, radius: 12 })
  gsap.set(ev, { opacity: 0 })
  tl.set(ev, { opacity: 1 }, B(12.45))
  liftUp(tl, ev, B(12.5), { scale: 1.045, y: -4, dur: 0.4 })
  liftDown(tl, ev, B(13.4), 0.3)

  // it steps back for C, and leaves before the riser
  tl.to(dev.el, { x: REC.cx - dev.w / 2, y: REC.cy - dev.h / 2, scale: REC.scale, duration: 1.0, ease: 'glide' }, B(13.5))
  tl.to(shade, { opacity: 0.56, duration: 1.0, ease: 'glide' }, B(13.5))
  tl.to(dev.el, { x: -480, duration: 0.5, ease: 'swiftIn' }, B(18.95))
  tl.set(dev.el, { opacity: 0 }, B(20.1))

  // ---------------------------------------------------------------- the report (a film graphic: a page, not a screen)
  const cam = h('div.lpkc-cam')
  const world = h('div.lpkc-world')
  add(cam, world)
  add(root, cam)

  const DOC = { w: 520, h: 700 }
  const RB = { cx: 1560, cy: 500, k: 0.68 } // at rest beside the phone
  const RC = { cx: 960, cy: 568, k: 0.92 } //  centre stage
  const doc = h('div.lpkc-doc')
  doc.append(
    h(
      'div.lpkc-doc-head',
      null,
      h('div.lpkc-doc-ico', { html: icon('file-text', 2) }),
      h('div', null, h('div.lpkc-doc-name', { text: 'LPKC_Nur_Aisyah_v1.pdf' }), h('div.lpkc-doc-meta', { text: 'PDF · 2.4 MB' })),
    ),
    h('div.lpkc-doc-rule'),
  )
  interface Bar {
    el: HTMLElement
    y: number
    hd: boolean
    flagAt?: number
    was?: string
  }
  const bars: Bar[] = []
  const INNER = DOC.w - 76
  const bar = (y: number, w: number, o: { hd?: boolean; left?: number; flagAt?: number } = {}) => {
    const el = h('div.lpkc-bar' + (o.hd ? '.hd' : ''), { style: { top: `${y}px`, width: `${w}px`, left: `${o.left ?? 38}px` } })
    doc.append(el)
    bars.push({ el, y, hd: !!o.hd, flagAt: o.flagAt })
  }
  bar(152, INNER * 0.62, { hd: true })
  ;[1, 0.94, 0.98].forEach((w, i) => bar(196 + i * 24, INNER * w))
  bar(268, INNER * 0.56, { flagAt: 21.5 }) // the objectives
  bar(312, INNER * 0.4, { hd: true })
  ;[1, 0.91, 0.7].forEach((w, i) => bar(352 + i * 24, INNER * w))
  doc.append(h('div.lpkc-fig', { style: { left: '38px', top: '440px', width: '196px', height: '104px' }, html: icon('image', 1.8) }))
  ;[1, 0.9, 1].forEach((w, i) => bar(450 + i * 24, 224 * w, { left: 258 }))
  bar(522, 224 * 0.62, { left: 258, flagAt: 23.25 }) // the photo evidence
  bar(580, INNER * 0.34, { hd: true })
  bar(620, INNER)
  bar(644, INNER * 0.8, { flagAt: 22.75 }) // the references
  const band = h('div.lpkc-band')
  doc.append(band)
  add(world, doc)

  // it leaves the phone from its own file row, and lands beside it as the thread opens
  const from = onStage(PB, 41, fileRow.y + fileRow.h / 2)
  place(doc, DOC, from.x, from.y, { scale: 0.07, opacity: 0, rotationZ: -14, rotationY: 30 })
  tl.to(doc, { opacity: 1, duration: 0.1, ease: 'none' }, B(10.4))
  tl.to(doc, { x: RB.cx - DOC.w / 2, scale: RB.k, rotationZ: 0, rotationY: 0, duration: 0.75, ease: 'glide' }, B(10.4))
  tl.to(doc, { y: RB.cy - DOC.h / 2, duration: 0.75, ease: 'power3.out' }, B(10.4))
  sfx('whoosh', B(10.4), 0.35, 0.3)

  const sentChip = chip('Uploaded from the app', { icon: 'upload', sm: true })
  add(root, sentChip)
  put(sentChip, RB.cx - stageBox(sentChip).w / 2, RB.cy + (DOC.h * RB.k) / 2 + 30)
  popIn(tl, sentChip, B(12))
  sfx('pop', B(12), 0.5, 0.3)
  popOut(tl, sentChip, B(13.3))

  // C: the report takes the centre
  tl.to(doc, { x: RC.cx - DOC.w / 2, y: RC.cy - DOC.h / 2, scale: RC.k, duration: 1.0, ease: 'glide' }, B(13.5))
  const docL = RC.cx - (DOC.w * RC.k) / 2
  const docR = RC.cx + (DOC.w * RC.k) / 2
  const docT = RC.cy - (DOC.h * RC.k) / 2

  const label = h('div.lpkc-label', { html: icon('sparkles', 2.2) + '<span>AI check</span>' })
  add(world, label)
  put(label, RC.cx - stageBox(label).w / 2, docT - 60)
  popIn(tl, label, B(15))
  sfx('pop', B(15), 0.4)

  // what the check is: the page, read against the academy's own checklist (the pills of the riser are its items)
  const chk = text('t-h3 lpkc-type', 'Checked against\nthe *LPKC checklist*.', { style: { fontSize: '52px', lineHeight: '1.08', whiteSpace: 'nowrap' } })
  add(root, chk.el)
  put(chk.el, docR + 90, RC.cy - stageBox(chk.el).h / 2)
  rise(tl, chk.words, B(16.25), { stagger: 0.06, dur: 0.6 })
  leave(tl, chk.words, B(19), { stagger: 0.02 })

  // the scan: a teal line across the page, its head the amber dot
  const EDGE = 30 // the scan's first and last line, in the page's own px
  const scanTop = docT + EDGE * RC.k
  const scanRange = (DOC.h - EDGE * 2) * RC.k
  const scan = h('div.lpkc-scan', { style: { width: `${DOC.w * RC.k + 18}px` } })
  add(world, put(scan, docL, 0))
  gsap.set(scan, { y: scanTop, scaleX: 0 })
  tl.set(scan, { opacity: 1 }, B(16))
  tl.to(scan, { scaleX: 1, duration: 0.5, ease: 'swift' }, B(16))
  tl.to(band, { opacity: 1, duration: 0.4, ease: 'none' }, B(16))
  sfx('shimmer', B(16), 0.8)

  // D: the checklist answers — nine ticks, and the three the AI will name
  const POPS = [20, 21, 21.5, 22, 22.5, 22.75, 23, 23.125, 23.25, 23.375, 23.5, 23.625]
  const ITEMS: Array<[string, boolean]> = [
    ['Muka depan', true],
    ['Isi kandungan', true],
    ['Objektif pembelajaran', false],
    ['Pengenalan', true],
    ['Pemerhatian', true],
    ['Rujukan APA', false],
    ['Refleksi', true],
    ['Slide pembentangan', true],
    ['Bukti bergambar', false],
    ['Kesimpulan', true],
    ['Lampiran', true],
    ['Format laporan', true],
  ]
  const ZIG = [34, 6, 44, 0, 30, 12]
  ITEMS.forEach(([name, ok], i) => {
    const c = chip(name, ok ? { icon: 'check' } : { icon: 'flag', tone: 'amber' })
    add(world, c)
    const w = stageBox(c).w
    const left = i % 2 === 0
    const r = Math.floor(i / 2)
    put(c, left ? docL - 56 - ZIG[r] - w : docR + 46 + ZIG[(r + 3) % 6], 320 + r * 88)
    popIn(tl, c, B(POPS[i]), { dur: i < 5 ? 0.4 : i < 7 ? 0.26 : 0.15, from: 0.5 })
    sfx('tick', B(POPS[i]), 0.34 + i * 0.03, left ? -0.3 : 0.3)
  })

  // the camera pushes in through the whole riser
  gsap.set([cam, world], { transformOrigin: `${RC.cx}px ${RC.cy}px` })
  tl.to(cam, { scale: 1.25, x: 960 - RC.cx, y: 10, duration: B(23.75) - B(20), ease: 'power1.in' }, B(20))
  sfx('rise', B(24), 1)

  // ---------------------------------------------------------------- the amber dot
  const guide = dot(D0)
  const halo = h('div.lpkc-halo')
  guide.append(halo)
  const pulse = h('div.lpkc-pulse')
  add(cam, pulse, guide)

  const kStart = 1.2
  const ks = 0.46
  const kf = d2 / D0
  const kb = 0.7
  const kc = 0.78
  const Pw = { x: RB.cx - (DOC.w * RB.k) / 2, y: RB.cy - (DOC.h * RB.k) / 2 + EDGE * RB.k } // waiting where the page's edge will be
  const Pc = { x: docL, y: scanTop }
  gsap.set(guide, { x: 960, y: Pq.y, scale: kStart })
  gsap.set(pulse, { x: Pc.x, y: Pc.y })

  // beat 0: alone in the room as the lights go down
  tl.to(guide, { scale: kStart * 1.3, duration: 0.24, ease: 'power2.out' }, B(0))
  tl.to(guide, { scale: kStart, duration: 0.26, ease: 'power2.inOut' }, B(0) + 0.24)
  // it makes room for the words and waits where the question will end
  tl.to(guide, { x: Pq.x, scale: kq, duration: 0.7, ease: 'glide' }, B(1.05))
  // the question leaves; the dot goes and strikes the meeting out
  tl.to(guide, { x: S0.x, y: S0.y, scale: ks, duration: 0.29, ease: 'glide' }, B(4.9))
  tl.to(guide, { x: S1.x, duration: 0.4, ease: 'glide' }, B(5.5))
  tl.to(strike, { scaleX: 1, duration: 0.4, ease: 'glide' }, B(5.5))
  sfx('whoosh', B(5.5), 0.22)
  tl.to(card, { opacity: 0.4, duration: 0.3, ease: 'none' }, B(6.3))
  tl.to(cardWrap, { y: 260, rotation: 8, duration: 0.42, ease: 'power2.in' }, B(6.85))
  tl.to(cardWrap, { opacity: 0, duration: 0.2, ease: 'none' }, B(6.85) + 0.22)
  // ... and lands as the full stop of "meeting."
  const hop = B(6.42)
  tl.to(guide, { x: F2.x, scale: kf, duration: 0.34, ease: 'power2.inOut' }, hop)
  tl.to(guide, { y: F2.y - 44, duration: 0.15, ease: 'power2.out' }, hop)
  tl.to(guide, { y: F2.y, duration: 0.19, ease: 'power2.in' }, hop + 0.15)
  tl.to(guide, { scaleY: kf * 0.7, scaleX: kf * 1.25, y: F2.y + 3, duration: 0.05, ease: 'power1.out' }, hop + 0.34)
  tl.to(guide, { scaleY: kf, scaleX: kf, y: F2.y, duration: 0.3, ease: 'pop' }, hop + 0.39)
  // B: it waits where the upload will land ...
  tl.to(guide, { x: Pw.x, y: Pw.y, scale: kb, duration: 0.5, ease: 'glide' }, B(7.9))
  tl.to(guide, { scale: kb * 1.4, duration: 0.1, ease: 'power2.out' }, B(11.9) - 0.1)
  tl.to(guide, { scale: kb, duration: 0.4, ease: 'pop' }, B(11.9))
  // C: ... rides the page to the centre, and becomes the checker
  tl.to(guide, { x: Pc.x, y: Pc.y, scale: kc, duration: 1.0, ease: 'glide' }, B(13.5))
  tl.fromTo(guide, { scale: kc }, { scale: kc * 1.45, duration: 0.12, ease: 'power2.out', immediateRender: false }, B(15) - 0.12)
  tl.fromTo(guide, { scale: kc * 1.45 }, { scale: kc, duration: 0.45, ease: 'pop', immediateRender: false }, B(15))
  tl.fromTo(pulse, { scale: 0.6, opacity: 0.9 }, { scale: 4.2, opacity: 0, duration: 0.7, ease: 'power2.out', immediateRender: false }, B(15))

  // the last sixteenth: everything falls into the dot, and the dot goes out
  const end = B(24)
  tl.to(guide, { x: RC.cx, duration: 0.09, ease: 'power2.in' }, B(23.5) - 0.03)
  tl.to(world, { scale: 0, duration: end - 0.075 - B(23.5), ease: 'power4.in' }, B(23.5))
  tl.set(world, { opacity: 0 }, end - 0.07)
  tl.to(guide, { scale: kc * 1.5, duration: 0.05, ease: 'power2.out' }, end - 0.125)
  tl.to(guide, { scale: 0, duration: 0.035, ease: 'power2.in' }, end - 0.075)
  tl.set(guide, { opacity: 0 }, end - 0.04)

  // ---------------------------------------------------------------- life
  const glide = gsap.parseEase('glide')
  const GREY = '#e4e4e7'
  const GREY_HD = '#a1a1aa'
  const READ = '#99f6e4'
  const READ_HD = '#2dd4bf'
  const FLAG = '#fbbf24'
  /** How many times the scan has crossed the page: one slow pass (16-20), then faster and faster. */
  const passes = (beat: number) => {
    if (beat <= 16) return 0
    if (beat < 20) return Math.pow((beat - 16) / 4, 1.2)
    const u = Math.min(1, (beat - 20) / 3.5)
    return 1 + 1.05 * u + 5.45 * u * u
  }
  onFrame((_t, beat) => {
    // the dot's light comes up as the room goes dark, breathes, and swells through the riser
    const riser = Math.pow(clamp01((beat - 20) / 3.6), 2)
    halo.style.opacity = String(bg.ink * (0.78 + 0.22 * Math.sin(beat * 0.9)))
    halo.style.transform = `scale(${1 + riser * 0.9})`

    // the phone sways a little while it is on show, and turns to the page as it steps back
    const rec = glide(clamp01((beat - 13.5) / 2))
    gsap.set(dev.el, { rotationY: 24 * rec + Math.sin(beat * 0.45) * (0.8 + rec * 1.2) * smooth(9, 10, beat) })

    // the scan
    const p = 0.5 - 0.5 * Math.cos(Math.PI * passes(beat))
    gsap.set(guide, { yPercent: ((p * scanRange) / D0) * 100 })
    gsap.set(scan, { y: scanTop + p * scanRange })
    gsap.set(band, { y: EDGE + p * (DOC.h - EDGE * 2) })
    const readTo = beat >= 20 ? DOC.h : beat <= 16 ? -1 : EDGE + p * (DOC.h - EDGE * 2)
    for (const b of bars) {
      const c = b.flagAt !== undefined && beat >= b.flagAt ? FLAG : b.y + 6 < readTo ? (b.hd ? READ_HD : READ) : b.hd ? GREY_HD : GREY
      if (c !== b.was) {
        b.el.style.background = c
        b.was = c
      }
    }
  })
}
