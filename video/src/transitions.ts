import gsap from 'gsap'
import { forceBlur } from './engine'
import { h } from './kit'

// Hand-overs between scenes. They act on the scene WRAPPERS, so a scene never
// has to know what comes before or after it. `at` is the bar line.

type Tl = gsap.core.Timeline

/** Whip pan: the outgoing scene is thrown off one way as the incoming one flies in behind it. */
export function whip(master: Tl, out: HTMLElement, inn: HTMLElement, at: number, dir: 'left' | 'right' | 'up' | 'down' = 'left') {
  const horiz = dir === 'left' || dir === 'right'
  const sign = dir === 'left' || dir === 'up' ? -1 : 1
  const dist = horiz ? 2100 : 1250
  const prop = horiz ? 'x' : 'y'
  master.to(out, { [prop]: sign * dist, duration: 0.3, ease: 'power3.in' }, at - 0.28)
  master.fromTo(inn, { [prop]: -sign * dist }, { [prop]: 0, duration: 0.5, ease: 'swift', immediateRender: false }, at - 0.02)
  master.set(inn, { [prop]: -sign * dist }, 0)
}

/** The incoming scene opens from a point, behind a ring of brand teal. */
export function iris(master: Tl, inn: HTMLElement, at: number, o: { x: number; y: number; color?: string }) {
  const lead = h('div.abs', { style: { width: '1920px', height: '1080px', background: o.color ?? '#0f766e', clipPath: `circle(0px at ${o.x}px ${o.y}px)` } })
  document.getElementById('overlay')!.append(lead)
  const R = 2300
  master.set(inn, { clipPath: `circle(0px at ${o.x}px ${o.y}px)` }, 0)
  master.fromTo(lead, { clipPath: `circle(0px at ${o.x}px ${o.y}px)` }, { clipPath: `circle(${R}px at ${o.x}px ${o.y}px)`, duration: 0.55, ease: 'power2.in', immediateRender: false }, at - 0.5)
  master.fromTo(inn, { clipPath: `circle(0px at ${o.x}px ${o.y}px)` }, { clipPath: `circle(${R}px at ${o.x}px ${o.y}px)`, duration: 0.6, ease: 'power2.out', immediateRender: false }, at - 0.02)
  master.set(inn, { clipPath: 'none' }, at + 0.6)
  master.set(lead, { opacity: 0 }, at + 0.6)
  master.set(lead, { opacity: 1 }, at - 0.5)
  gsap.set(lead, { opacity: 0 })
  forceBlur(at - 0.5, at + 0.6, 12)
}

/** Push through the outgoing scene into the incoming one. */
export function zoomThrough(master: Tl, out: HTMLElement, inn: HTMLElement, at: number) {
  master.to(out, { scale: 2.6, opacity: 0, duration: 0.34, ease: 'power3.in' }, at - 0.32)
  master.set(inn, { scale: 0.62, opacity: 0 }, 0)
  master.fromTo(inn, { scale: 0.62, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.55, ease: 'swift', immediateRender: false }, at - 0.04)
}

/** A hard cut on the beat. */
export function cut(master: Tl, out: HTMLElement, inn: HTMLElement, at: number) {
  master.set(out, { opacity: 0 }, at)
  master.set(inn, { opacity: 0 }, 0)
  master.set(inn, { opacity: 1 }, at)
}
