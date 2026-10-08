import type { SceneCtx } from '../engine'
import { add, chip, gsap, leave, lockup, popIn, popOut, put, rise, stageBox, text } from '../kit'

// Bar 45 to the end (88-93s): the final hit, ringing out.
// VO (beat 1.1): "Hawary LMS. Your whole academy, in one place."
// The film ends where it began: the last frame is the first frame, the lockup at rest.
export default function outro({ root, tl, B, sfx }: SceneCtx) {
  const LW = 900
  const lk = lockup(LW)
  const s = LW / 1619.04
  const x0 = 960 - lk.w / 2
  const y0 = 540 - lk.hgt / 2
  gsap.set(lk.el, { x: x0, y: y0 })
  add(root, lk.el)

  // The hit: the arch lands, the dot drops in under it, the name follows.
  gsap.set(lk.arch, { scale: 1.9, svgOrigin: '136 158', opacity: 0 })
  gsap.set(lk.dot, { attr: { cy: -420 }, opacity: 0 })
  tl.set(lk.dot, { opacity: 1 }, B(1) - 0.42)
  gsap.set([lk.hawary, lk.academy], { x: -90, opacity: 0 })
  tl.to(lk.arch, { opacity: 1, duration: 0.12, ease: 'none' }, B(0) - 0.05)
  tl.to(lk.arch, { scale: 1, duration: 0.7, ease: 'swift' }, B(0) - 0.05)
  sfx('impact', B(0), 0.7)

  const cy = 193.75
  tl.to(lk.dot, { attr: { cy }, duration: 0.42, ease: 'power2.in' }, B(1) - 0.42)
  tl.to(lk.dot, { attr: { ry: 33, rx: 49, cy: cy + 9 }, duration: 0.06, ease: 'power1.out' }, B(1))
  tl.to(lk.dot, { attr: { ry: 42, rx: 42, cy: cy - 44 }, duration: 0.24, ease: 'power2.out' }, B(1) + 0.06)
  tl.to(lk.dot, { attr: { cy }, duration: 0.22, ease: 'power2.in' }, B(1) + 0.3)
  tl.to(lk.dot, { attr: { ry: 38, rx: 45, cy: cy + 4 }, duration: 0.05, ease: 'power1.out' }, B(1) + 0.52)
  tl.to(lk.dot, { attr: { ry: 42, rx: 42, cy }, duration: 0.3, ease: 'pop' }, B(1) + 0.57)
  sfx('pop', B(1), 0.7)

  tl.to(lk.hawary, { x: 0, opacity: 1, duration: 0.6, ease: 'swift' }, B(1.5))
  tl.to(lk.academy, { x: 0, opacity: 1, duration: 0.6, ease: 'swift' }, B(1.5) + 0.08)

  // The line, on her words, and where to find it.
  const line = text('t-h3', 'Your whole academy, in *one place*.', { style: { whiteSpace: 'nowrap', fontWeight: '600', fontSize: '46px' } })
  add(root, line.el)
  const lb = stageBox(line.el)
  put(line.el, 960 - lb.w / 2, 540 + lk.hgt / 2 + 46)
  rise(tl, line.words, B(3.3), { stagger: 0.06, dur: 0.6 })

  const url = chip('app.hawary.my', { icon: 'globe' })
  add(root, url)
  const ub = stageBox(url)
  put(url, 960 - ub.w / 2, 540 + lk.hgt / 2 + 140)
  popIn(tl, url, B(5.2))
  sfx('pop', B(5.2), 0.4)

  // Clear the stage so the last frame is the logo alone, exactly as the film opened.
  leave(tl, line.words, B(8.2), { stagger: 0.015, dur: 0.35 })
  popOut(tl, url, B(8.2))
  void s
}
