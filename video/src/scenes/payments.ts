import './payments.css'
import type { SceneCtx } from '../engine'
import type { Layer, Rect, Shot } from '../kit'
import { add, browser, chip, click, counter, countTo, dim, focus, gsap, h, hidePointer, lift, liftDown, liftUp, moveTo, phone, place, popIn, pt, put, rise, rm, scrollPane, shot, text, touch } from '../kit'

// Bars 21-24 (40-48s): the full groove with hats.
// VO: beat 0.7 "Fees are invoiced," | beat 3.5 "paid online by FPX, and receipted automatically."
//     ("FPX" ~5.3, "receipted" ~7.2, ends 9.4) | beat 10.6 "Student incentives go out in one batch." (ends 14.6)
//
// The money trail is one wall and the camera travels right along it, the way the
// whip that brings the scene in is already travelling:
// A  beats 0-4     INVOICED   /payments pushed in on its tiles: they count up, the hero invoice steps forward
// B  beats 4-10.5  PAID       the public pay page on a phone: tap, received; the invoice's own summary settles to zero
// C  beats 10.5-16 PAID OUT   the September incentive batch: students' Paid statuses, and the batch total

const FLAT = '0 0px 0px 0px rgba(17,17,19,0), 0 0px 0px 0px rgba(17,17,19,0), 0 0px 0px 0px rgba(15,118,110,0)'
const RAISED = '0 2px 4px 0px rgba(17,17,19,0.06), 0 14px 28px -6px rgba(17,17,19,0.16), 0 40px 70px -18px rgba(15,118,110,0.34)'

interface Piece extends Layer {
  el: HTMLElement
  clip: HTMLElement
}

/** A free-standing piece of a real screenshot: one rect of a shot as its own element, with an overlay in the shot's coordinates. */
function piece(s: Shot, r: Rect): Piece {
  const el = h('div.payments-piece', { style: { width: `${r.w}px`, height: `${r.h}px`, borderRadius: `${r.radius ?? 12}px` } })
  const clip = h('div.payments-clip')
  const im = s.img()
  im.style.left = `${-r.x}px`
  im.style.top = `${-r.y}px`
  clip.append(im)
  const ov = h('div.view-ov', { style: { left: `${-r.x}px`, top: `${-r.y}px`, width: `${s.w}px`, height: `${s.h}px` } })
  el.append(clip, ov)
  return { el, clip, ov, shot: s }
}

/** A second, smaller copy of the screenshot nested inside a lifted piece (a status badge inside its row), so it can pop on its own and still ride with the row. */
function inset(parent: HTMLElement, parentRect: Rect, s: Shot, r: Rect, pad = 3): HTMLElement {
  const el = h('div.lift', {
    style: { left: `${r.x - parentRect.x - pad}px`, top: `${r.y - parentRect.y - pad}px`, width: `${r.w + pad * 2}px`, height: `${r.h + pad * 2}px`, borderRadius: `${r.h / 2 + pad}px` },
  })
  const im = s.img()
  im.style.left = `${-(r.x - pad)}px`
  im.style.top = `${-(r.y - pad)}px`
  el.append(im)
  parent.append(el)
  return el
}

export default async function payments({ root, tl, B, sfx, onFrame }: SceneCtx) {
  const [pay, payFull, payPage, payDone, fpx, inv, invPaid, batch] = await Promise.all(
    ['web/payments', 'web/payments-full', 'web/pay-public-phone', 'web/pay-result-phone', 'web/macro-fpx', 'web/learn-invoice', 'web/learn-invoice-paid', 'web/incentive-batch'].map((k) => shot(k)),
  )

  // ---------------------------------------------------------------- the wall
  const GAP = 2300
  // The wall is seen through the frame only: the windows bleed far off the left edge, and
  // the whip that brings the scene in parks this layer one frame-width to the right.
  const frame = h('div.payments-frame')
  const world = h('div.payments-world')
  const [stA, stB, stC] = [0, 1, 2].map((i) => h('div.payments-station', { style: { left: `${i * GAP}px` } }))
  add(root, add(frame, add(world, stA, stB, stC)))
  // a whip along the wall: the violent middle of the move sits on the beat
  const pan = (to: number, beat: number) => {
    tl.to(world, { x: -to * GAP, duration: 0.64, ease: 'whip' }, B(beat) - 0.32)
    sfx('whoosh', B(beat) - 0.22, 0.5)
  }
  pan(1, 4)
  pan(2, 10.5)

  // ---------------------------------------------------------------- A  invoiced
  const devA = browser(pay, { url: 'app.hawary.my/payments' })
  add(stA, devA.el)
  // the page scrolled a little under its fixed header, so the tiles and the first invoices share the frame
  const DOWN = 135
  const paneA = scrollPane(devA, payFull)
  gsap.set(paneA.inner, { y: -DOWN })
  const inView = (r: Rect): Rect => ({ ...r, y: r.y - DOWN })
  // pinned by the sidebar's edge (just off the frame) at the tiles' mid-line; a slow push in
  const pinA = { x: 257, y: 112, w: 0, h: 0 }
  gsap.set(devA.el, { transformOrigin: '50% 50%', ...focus(devA, pinA, { cx: -4, cy: 504, scale: 1.5 }) })
  tl.to(devA.el, { ...focus(devA, pinA, { cx: -4, cy: 504, scale: 1.56 }), duration: B(4.6), ease: 'none' }, 0)

  const headA = text('t-h1', 'Fees, *invoiced*.', { style: { whiteSpace: 'nowrap' } })
  add(stA, put(headA.el, 116, 96))
  rise(tl, headA.words, B(0.4), { stagger: 0.09, dur: 0.6 })

  // the four totals count up from nothing and land one per half-beat
  const TILES = [
    { tile: 'tileInvoiced', fig: 'invoiced', sen: 143280000 },
    { tile: 'tileCollected', fig: 'collected', sen: 118450000 },
    { tile: 'tileOutstanding', fig: 'outstanding', sen: 24830000 },
    { tile: 'tileOverdue', fig: 'overdue', sen: 1960000 },
  ]
  TILES.forEach((t, i) => {
    const r = payFull.tag(t.tile)
    const f = payFull.tag(t.fig)
    const at = 1 + i * 0.5
    const el = lift(paneA, r, { pad: 3, radius: 17 })
    // the running figure covers the tile's own until it lands, then hands back to the real pixels
    const num = h('div.payments-count', { style: { left: `${f.x - r.x + 3}px`, top: `${f.y - r.y + 3}px`, width: `${r.x + r.w - f.x - 12}px`, height: `${f.h}px` } })
    el.append(num)
    const c = counter(num, 0, rm)
    countTo(tl, c, t.sen, B(0.2), B(at) - B(0.2), 'power2.out')
    tl.to(num, { opacity: 0, duration: 0.1, ease: 'none' }, B(at))
    liftUp(tl, el, B(at), { scale: 1.05, y: -4, dur: 0.32 })
    liftDown(tl, el, B(at + 0.75), 0.3)
    sfx('tick', B(at), 0.8 - i * 0.1)
  })

  // beat 3: the hero invoice steps forward, partially paid
  const heroR = payFull.tag('heroRow')
  const spot = dim(devA, inView(heroR), 0)
  const hero = lift(devA, heroR, { from: payFull, radius: 8 })
  hero.style.top = `${heroR.y - DOWN}px`
  const part = inset(hero, heroR, payFull, payFull.tag('heroStatus'))
  gsap.set(hero, { transformOrigin: '30% 50%' }) // it grows towards the open side, so its invoice number keeps clear of the frame's edge
  tl.to(spot, { opacity: 0.55, duration: 0.25, ease: 'power2.out' }, B(3))
  liftUp(tl, hero, B(3), { scale: 1.02, y: -3, dur: 0.32 })
  tl.to(part, { scale: 1.32, duration: 0.3, ease: 'pop' }, B(3.25))
  sfx('pop', B(3), 0.5)

  // ---------------------------------------------------------------- B  paid by FPX, receipted
  const K = 390 / 430 // the public pay page was shot 430 wide
  const PH = { cx: 905, cy: 548, s: 1.2 }
  const ph = phone(payPage, { time: '12:22' })
  gsap.set(ph.scroll, { scale: K, transformOrigin: '0 0' })
  add(stB, ph.el)
  place(ph.el, ph, PH.cx, PH.cy, { scale: PH.s, transformPerspective: 2600 })
  const donePage = ph.layer(payDone)

  // The page's card steps out of the phone, towards us: a sharper copy of it sits
  // exactly over the phone's own (in the phone's box, so it rides with the phone) and rises.
  const UP = 1.14
  const stepOut = (s: Shot, r: Rect, onPage: Rect) => {
    const p = piece(s, r)
    const rest = (onPage.w * K) / r.w
    put(p.el, 12 + (onPage.x + onPage.w / 2) * K - r.w / 2, 59 + (onPage.y + onPage.h / 2) * K - r.h / 2)
    gsap.set(p.el, { scale: rest, opacity: 0, boxShadow: FLAT })
    ph.el.append(p.el)
    return { ...p, rest }
  }
  const raise = (p: { el: HTMLElement; rest: number }, at: number) => {
    tl.set(p.el, { opacity: 1 }, at)
    tl.to(p.el, { scale: p.rest * UP, y: -8, boxShadow: RAISED, duration: 0.45, ease: 'pop' }, at)
  }
  const payCard = stepOut(fpx, fpx.tag('card'), payPage.tag('card'))
  const okCard = stepOut(payDone, payDone.tag('card'), payDone.tag('card'))

  const btn = fpx.tag('payButton')
  const press = lift(payCard, btn, { radius: 20 })
  const finger = touch(payCard, { x: btn.x + btn.w * 0.96, y: btn.y + 150 })
  raise(payCard, B(4.5))
  moveTo(tl, finger, pt(btn, 0.86, 0.6), B(4.8), 0.3)
  // "FPX": the tap
  click(tl, finger, B(5.5))
  sfx('tap', B(5.5))
  tl.to(press, { scale: 0.955, duration: 0.07, ease: 'power2.in' }, B(5.5) - 0.07)
  tl.to(press, { scale: 1, duration: 0.3, ease: 'pop' }, B(5.5))
  hidePointer(tl, finger, B(5.8))
  tl.to(payCard.el, { scale: payCard.rest, y: 0, boxShadow: FLAT, duration: 0.3, ease: 'glide' }, B(5.85))
  // beat 6.5: the gateway returns, the money is in
  tl.set(payCard.el, { opacity: 0 }, B(6.5))
  tl.set(donePage, { opacity: 1 }, B(6.5))
  raise(okCard, B(6.5))
  sfx('success', B(6.5), 0.9)
  // the page's own check mark answers with one ring
  const okAt = pt(payDone.tag('check'))
  const okRing = h('div.ripple')
  okCard.ov.append(okRing)
  gsap.set(okRing, { x: okAt.x, y: okAt.y })
  tl.fromTo(okRing, { scale: 0.5, opacity: 0.9 }, { scale: 2.6, opacity: 0, duration: 0.6, ease: 'power2.out', immediateRender: false }, B(6.5) + 0.08)
  // beat 9: done, the card settles back into its page
  tl.to(okCard.el, { scale: okCard.rest, y: 0, boxShadow: FLAT, duration: 0.45, ease: 'glide' }, B(9))

  const headB = text('t-h1', 'Paid\n*online*.')
  add(stB, put(headB.el, 116, 356))
  rise(tl, headB.words, B(4.1), { stagger: 0.09, dur: 0.6 })
  const cFpx = chip('FPX', { icon: 'landmark' })
  const cToy = chip('ToyyibPay', { icon: 'shield-check' })
  add(stB, put(cFpx, 120, 598), cToy)
  put(cToy, 120 + cFpx.offsetWidth + 14, 598)
  popIn(tl, cFpx, B(5.5))
  popIn(tl, cToy, B(6))

  // the invoice's own summary card, as the student sees it; it cuts to its paid state when the balance lands
  const sumR = inv.tag('summaryCard')
  const SUM = { x: 1316, y: 214, s: 1.7 }
  const sumG = h('div.abs')
  add(stB, put(sumG, SUM.x, SUM.y))
  const sum = piece(inv, sumR)
  gsap.set(sum.el, { scale: SUM.s, transformOrigin: '0 0', boxShadow: '0 1px 2px 0px rgba(17,17,19,0.05), 0 8px 16px -5px rgba(17,17,19,0.12), 0 24px 40px -14px rgba(15,118,110,0.3)' })
  const sumPaid = invPaid.img()
  sumPaid.style.left = `${-sumR.x}px`
  sumPaid.style.top = `${-sumR.y}px`
  sumPaid.style.opacity = '0'
  sum.clip.append(sumPaid)
  const sumW = sumR.w * SUM.s
  const sumH = sumR.h * SUM.s
  const glow = h('div.ring', { style: { left: '-7px', top: '-7px', width: `${sumW + 14}px`, height: `${sumH + 14}px`, borderRadius: `${(sumR.radius ?? 14) * SUM.s + 7}px`, opacity: '0' } })
  add(sumG, sum.el, glow)

  // the amount: our own figure beside the card, the scene's one amber thing. It runs to zero on beats 7-8.
  const BAL_Y = SUM.y + sumH + 34
  const BAL_W = 272
  const balLabel = h('div.payments-label', { text: 'Balance' })
  const bal = h('div.payments-amount', { style: { width: `${BAL_W}px` } })
  const balC = counter(bal, 90000, rm)
  add(stB, put(balLabel, SUM.x + 8, BAL_Y + 27), put(bal, SUM.x + sumW - BAL_W, BAL_Y))
  gsap.set(balLabel, { opacity: 0, x: -14 })
  tl.to(balLabel, { opacity: 1, x: 0, duration: 0.4, ease: 'swift' }, B(5))
  popIn(tl, bal, B(5))
  countTo(tl, balC, 0, B(7), B(8) - B(7), 'power2.out')
  tl.fromTo(bal, { scale: 1.1 }, { scale: 1, duration: 0.4, ease: 'pop', immediateRender: false }, B(8))
  tl.set(sumPaid, { opacity: 1 }, B(8))
  tl.fromTo(glow, { opacity: 0 }, { opacity: 1, duration: 0.12, ease: 'none', immediateRender: false }, B(8))
  tl.to(glow, { opacity: 0, duration: 0.8, ease: 'power2.out' }, B(8) + 0.3)
  sfx('tick', B(8), 0.7)

  // "receipted": the receipt exists as soon as the money is in
  const cRec = chip('Receipt, automatically', { icon: 'file-check' })
  add(stB, put(cRec, SUM.x, BAL_Y + 76 + 30))
  popIn(tl, cRec, B(7.25))
  sfx('pop', B(7.25), 0.55)

  // ---------------------------------------------------------------- C  incentives, one batch
  const devC = browser(batch, { url: 'app.hawary.my/incentives' })
  add(stC, devC.el)
  const pinC = { x: 349, y: 401, w: 0, h: 0 } // the third student's name
  gsap.set(devC.el, { transformOrigin: '50% 50%', ...focus(devC, pinC, { cx: 48, cy: 590, scale: 1.2 }) })
  tl.to(devC.el, { ...focus(devC, pinC, { cx: 48, cy: 590, scale: 1.245 }), duration: B(16.9) - B(10), ease: 'none' }, B(10))

  const COL = 1452
  const headC = text('t-h3', 'Incentives,\nin *one batch*.', { style: { fontSize: '60px', lineHeight: '1.06' } })
  add(stC, put(headC.el, COL, 330))
  rise(tl, headC.words, B(10.7), { stagger: 0.06, dur: 0.6 })

  const total = h('div.payments-total')
  const totC = counter(total, 0, rm)
  const cap = text('payments-cap', '16 students · RM 500.00 each')
  add(stC, put(total, COL, 506), put(cap.el, COL + 2, 584))
  gsap.set(total, { opacity: 0, y: 16 })
  tl.to(total, { opacity: 1, y: 0, duration: 0.35, ease: 'swift' }, B(11.5))

  // students step forward one per half-beat, RM 500.00 each, and their Paid status stays forward ...
  const STEP = 50000
  const rows = Array.from({ length: 9 }, (_, i) => batch.tag(`row${i + 1}`))
  const lifted = rows.slice(0, 4).map((r) => lift(devC, r, { radius: 8 }))
  const paid = rows.map((r) => lift(devC, { x: 1090, y: r.y + 21, w: 41, h: 20 }, { pad: 3, radius: 13 }))
  lifted.forEach((row, i) => {
    const at = 12 + i * 0.5
    liftUp(tl, row, B(at), { scale: 1.022, y: -3, dur: 0.32 })
    liftDown(tl, row, B(at + 0.75), 0.3)
    liftUp(tl, paid[i], B(at) + 0.04, { scale: 1.42, y: -3, dur: 0.3 })
    tl.to(paid[i], { y: 0, duration: 0.3, ease: 'glide' }, B(at + 0.75))
    sfx('tick', B(at), 0.75)
    // ... and from the fourth the count runs out to the batch's real total, landing on beat 14
    if (i < 3) countTo(tl, totC, STEP * (i + 1), B(at), 0.16, 'power2.out')
    else countTo(tl, totC, 800000, B(at), B(14) - B(at), 'power2.out')
  })
  // beat 14: the rest of the batch answers at once
  for (let i = 4; i < 9; i++) liftUp(tl, paid[i], B(14) + (i - 4) * 0.045, { scale: 1.42, y: 0, dur: 0.3 })
  tl.fromTo(total, { scale: 1.09 }, { scale: 1, duration: 0.4, ease: 'pop', immediateRender: false }, B(14))
  rise(tl, cap.words, B(14), { stagger: 0.03, dur: 0.5 })
  sfx('pop', B(14), 0.7)

  const cOne = chip('One batch · Billplz', { icon: 'send', tone: 'teal' })
  add(stC, put(cOne, COL, 636))
  popIn(tl, cOne, B(14.5))
  sfx('pop', B(14.5), 0.5)

  // ---------------------------------------------------------------- life
  onFrame((_t, beat) => {
    // the phone is held, not bolted down; the invoice card floats beside it
    if (beat > 3 && beat < 11.5) {
      gsap.set(ph.el, { rotationY: Math.sin(beat * 0.45 + 1) * 2.4, rotationX: Math.cos(beat * 0.4) * 1.3 })
      gsap.set(sumG, { y: Math.sin(beat * 0.5 + 0.6) * 4 })
    }
  })
}
