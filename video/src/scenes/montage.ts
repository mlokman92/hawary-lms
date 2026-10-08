import type { SceneCtx } from '../engine'
import { forceBlur } from '../engine'
import { add, browser, chip, dot, gsap, h, lift, liftDown, liftUp, popIn, put, rise, shot, stageBox, text } from '../kit'
import './montage.css'

// Bars 43-45 (84.07-88.07s): the last two bars of the big section, driving to the final hit.
// VO: beat 0.6 "Bilingual." | beat 2.2 "Secure." | beat 4.1 "Built for Malaysian skills training." (ends 7.4)
//
// Three ideas, hard cuts on the beat, each one a different frame so the cut lands:
// A  beats 0-2  type left, the dashboard from the right; on beat 1 it is wiped from English to Malay
// B  beats 2-4  the Members screen from the left, type right; the roles answer on the sixteenths
// C  beats 4-8  type over the analytics window; four stamps on the half-beats; then the amber full stop
//               leaves the line for the centre and the whole frame collapses into it, where the logo opens
export default async function montage({ root, tl, B, beats, start, sfx }: SceneCtx) {
  const [dashEn, dashMs, members, analytics] = await Promise.all([shot('web/dashboard-en2'), shot('web/dashboard-ms'), shot('web/members'), shot('web/analytics')])

  // One layer per idea; a hard cut is one layer off and the next on, on the beat.
  const gA = h('div.abs')
  const gB = h('div.abs')
  const gC = h('div.abs')
  add(root, gA, gB, gC)
  gsap.set([gB, gC], { opacity: 0 })
  tl.set(gA, { opacity: 0 }, B(2))
  tl.set(gB, { opacity: 1 }, B(2))
  tl.set(gB, { opacity: 0 }, B(4))
  tl.set(gC, { opacity: 1 }, B(4))

  // ---------------------------------------------------------------- A  bilingual
  // The dashboard pushed in on its top-left: the menu, the title and the first tiles are what change language.
  const EDGE = 828 // the screen x (shot px) that stays on the frame's right edge: just past the second tile's text
  const win = browser(dashEn, { url: 'app.hawary.my' })
  add(gA, win.el)
  gsap.set(win.el, { x: 1920 - EDGE, y: 208, transformOrigin: `${EDGE}px 300px`, scale: 1.25 })
  tl.to(win.el, { scale: 1.31, duration: B(2), ease: 'none' }, 0) // a steady push for the whole idea

  const pair = text('t-display', 'Bilingual.\n*Dwibahasa.*', { style: { whiteSpace: 'nowrap' } })
  add(gA, pair.el)
  // set the pair as large as the column beside the window allows
  const size = Math.min(148, Math.floor((148 * 650) / stageBox(pair.el).w))
  pair.el.style.fontSize = `${size}px`
  const pairH = stageBox(pair.el).h
  const blockTop = 540 - (58 + 34 + pairH) / 2
  put(pair.el, 116, blockTop + 58 + 34)
  rise(tl, [pair.words[0]], B(0.15), { dur: 0.5 })
  rise(tl, [pair.words[1]], B(1) - 0.06, { dur: 0.5 })

  // the label of the language on screen: it flips over with the wipe
  const en = chip('English', { icon: 'languages' })
  const bm = chip('Bahasa Melayu', { icon: 'languages', tone: 'teal' })
  const flip = h('div.abs')
  add(flip, en, bm)
  add(gA, put(flip, 122, blockTop))
  gsap.set([en, bm], { transformPerspective: 700 })
  gsap.set(bm, { rotationX: -90, opacity: 0 })
  tl.to(en, { rotationX: 90, duration: 0.1, ease: 'power2.in' }, B(1) - 0.1)
  tl.set(en, { opacity: 0 }, B(1))
  tl.set(bm, { opacity: 1 }, B(1))
  tl.to(bm, { rotationX: 0, duration: 0.4, ease: 'pop' }, B(1))

  // beat 1: the same screen, pixel for pixel, in Malay, wiped in behind a teal edge
  const ms = win.layer(dashMs)
  const edge = h('div.montage-edge')
  win.ov.append(edge)
  gsap.set(edge, { opacity: 0 })
  const wipe = { p: 0 }
  const drawWipe = () => {
    ms.style.clipPath = `inset(0px ${Math.max(0, 1440 - wipe.p)}px 0px 0px)`
    edge.style.transform = `translateX(${wipe.p}px)`
  }
  drawWipe()
  const W0 = B(1) - 0.08
  tl.set([ms, edge], { opacity: 1 }, W0)
  tl.to(wipe, { p: 1000, duration: 0.5, ease: 'power2.out', onUpdate: drawWipe }, W0) // it leaves the frame at EDGE
  tl.set(edge, { opacity: 0 }, W0 + 0.5)
  forceBlur(start + beats(1) - 0.1, start + beats(1) + 0.44)
  sfx('whoosh', W0, 0.45, 0.3)

  // ---------------------------------------------------------------- B  secure
  // The Members screen from the other side. The window is cut after the Access column, so what is in frame
  // is people and their roles; the sidebar is off the frame's left edge.
  const PW = 980
  const pane = browser(members, { url: 'app.hawary.my/members' })
  pane.el.style.width = `${PW}px`
  pane.view.style.width = `${PW}px`
  ;(pane.el.querySelector('.browser-url') as HTMLElement).style.transform = 'translateX(150px)'
  add(gB, pane.el)
  gsap.set(pane.el, { x: 1064 - PW, y: 92, transformOrigin: '100% 0%', scale: 1.47 })
  tl.to(pane.el, { scale: 1.56, duration: 1.25, ease: 'power2.out' }, B(2)) // lands hard, keeps pushing

  const XB = 1184
  const secure = text('t-display', 'Secure.', { style: { whiteSpace: 'nowrap' } })
  const sub = text('t-body', 'Access enforced in the database', { style: { whiteSpace: 'nowrap', fontSize: '32px', fontWeight: '550' } })
  add(gB, put(secure.el, XB - 6, 356), put(sub.el, XB, 516))
  rise(tl, secure.words, B(2) - 0.06, { dur: 0.45 }) // already moving when the cut shows it
  rise(tl, sub.words, B(2.25), { dur: 0.45, stagger: 0.03 })

  // the roles, a sixteenth apart; the real rows step forward with the first three
  const rowTags = ['rowDirector', 'rowAdmin', 'rowHajar']
  let chipX = XB
  ;['Director', 'Admin', 'Trainer', 'Student'].forEach((role, i) => {
    const at = B(2.5 + i * 0.25)
    const c = chip(role, i === 0 ? { tone: 'teal' } : {})
    c.classList.add('montage-role')
    add(gB, put(c, chipX, 596))
    chipX += stageBox(c).w + 12
    popIn(tl, c, at, { dur: 0.35 })
    sfx('tick', at, 0.45)
    if (rowTags[i]) {
      const r = members.tag(rowTags[i])
      const row = lift(pane, { x: 341, y: r.y + 3, w: 620, h: r.h - 6 }, { radius: 10 })
      liftUp(tl, row, at, { scale: 1.03, y: -2, dur: 0.28 })
      liftDown(tl, row, at + 0.32, 0.25)
    }
  })

  // ---------------------------------------------------------------- C  built for Malaysia
  // The window and the line live in `world`, so the last move can let them fall into the centre as one piece.
  // Its origin is the middle of what it holds (the window runs far below the frame).
  const FALL = 230
  const world = h('div.abs')
  add(gC, world)
  gsap.set(world, { transformOrigin: `960px ${540 + FALL}px` })

  const an = browser(analytics, { url: 'app.hawary.my/analytics' })
  add(world, an.el)
  gsap.set(an.el, { x: 240, y: 340, transformOrigin: '50% 0%', scale: 1.08 })
  tl.to(an.el, { scale: 1.15, duration: 1.3, ease: 'power2.out' }, B(4)) // lands 132..1788 wide, cut just under the chart card

  // the month's thirty bars come up from the baseline, left to right, as the cut lands
  const PITCH = 35.33
  const covers = Array.from({ length: 30 }, (_, i) => {
    const c = h('div.abs', { style: { left: `${336.3 + i * PITCH}px`, top: '332px', width: `${PITCH + 0.6}px`, height: '190.4px', background: '#fff', transformOrigin: '50% 0%' } })
    an.ov.append(c)
    return c
  })
  tl.to(covers, { scaleY: 0, duration: 0.5, ease: 'power3.out', stagger: 0.014 }, B(4) - 0.02)

  const SIZE = 104
  const HX = 132 // the line sits on the window's left edge, the stamps end on its right edge
  const head = text('t-h1', 'Built for\n*Malaysian* skills training', { style: { whiteSpace: 'nowrap' } })
  add(world, put(head.el, HX, 84))
  // the line's full stop is the amber dot (measured before the words are hidden)
  const hb = stageBox(head.el)
  const lb = stageBox(head.words[head.words.length - 1])
  const STOP = Math.round(SIZE * 0.2)
  const stopAt = { x: HX + (lb.x - hb.x) + lb.w + SIZE * 0.05 + STOP / 2, y: 84 + (lb.y - hb.y) + lb.h / 2 + SIZE * 0.29 }
  rise(tl, head.words, B(4) - 0.06, { stagger: 0.08, dur: 0.6 })

  // four stamps, one per half-beat, each landing ON its beat
  const labels = ['MYR', 'SST', 'FPX', 'JPK · DKM']
  const badges = labels.map((l, i) => h('div.montage-badge' + (i === 3 ? '.teal' : ''), { text: l }))
  add(gC, ...badges)
  const widths = badges.map((b) => stageBox(b).w)
  const GAP = 14
  let bx = 1920 - HX - widths.reduce((a, w) => a + w, 0) - GAP * (badges.length - 1)
  const BY = 84 + (SIZE * 0.98) / 2 - 33
  const centres: Array<{ x: number; y: number }> = []
  badges.forEach((b, i) => {
    put(b, bx, BY)
    centres.push({ x: bx + widths[i] / 2, y: BY + 33 })
    bx += widths[i] + GAP
    const at = B(4.5 + i * 0.5)
    gsap.set(b, { scale: 1.8, opacity: 0 })
    tl.to(b, { opacity: 1, duration: 0.06, ease: 'none' }, at - 0.14)
    tl.to(b, { scale: 1, duration: 0.14, ease: 'power2.in' }, at - 0.14)
    tl.to(b, { scaleX: 1.07, scaleY: 0.9, duration: 0.05, ease: 'power1.out' }, at)
    tl.to(b, { scaleX: 1, scaleY: 1, duration: 0.3, ease: 'pop' }, at + 0.05)
    sfx('pop', at, 0.55, 0.3 + i * 0.1)
  })

  const stop = dot(STOP)
  gsap.set(stop, { x: stopAt.x, y: stopAt.y, scale: 0, opacity: 0 })
  add(gC, stop)
  tl.to(stop, { scale: 1, opacity: 1, duration: 0.35, ease: 'pop' }, B(4.75))

  // beats 6.5-8: the full stop leaves the line for the centre of the frame and lands there on beat 7, where the
  // film's teal iris opens. The stamps chase it in, then the window and the line fall in after them.
  const G = B(6.5)
  tl.to(stop, { x: 960, y: 540, duration: B(7) - G, ease: 'glide' }, G)
  tl.to(stop, { scale: 2.2, duration: B(7) - G, ease: 'power2.in' }, G)
  badges.forEach((b, i) => {
    const at = G + 0.02 + i * 0.04 // they arrive one after another, just behind the dot
    tl.to(b, { x: 960 - centres[i].x, y: 540 - centres[i].y, duration: 0.26, ease: 'power1.in' }, at)
    tl.to(b, { scale: 0, duration: 0.26, ease: 'power3.in' }, at)
  })
  tl.to(world, { scale: 0.06, y: -FALL, rotation: -4, duration: B(7.5) - B(6.75), ease: 'power2.in' }, B(6.75))
  sfx('whoosh', G, 0.5)
}
