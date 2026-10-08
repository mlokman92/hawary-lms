// Phone OS chrome the product does not own — the lock screen and native
// notification banners — for the notification demo. These are the only UI the
// film draws itself; everything inside an app is a real screenshot.

import './os.css'
import gsap from 'gsap'
import type { Device, Tl } from './kit'
import { h, icon } from './kit'

export const APP_ICON = { student: '/brand/icon-student.svg', academy: '/brand/icon-academy.svg' }
/** The apps' real display names (apps/mobile/app.config.ts). */
export const APP_NAME = { student: 'Hawary Student LMS', academy: 'Hawary Academy LMS' }

export interface Lock {
  /** The whole lock screen, 390x844, sitting over the app inside the phone's screen. Fade it in/out. */
  el: HTMLElement
  /** Where banners go (366 px wide, starts under the clock). */
  list: HTMLElement
}

/**
 * Put a lock screen into a phone. It starts hidden (opacity 0). While it shows,
 * the status bar and home indicator must go light: call `statusLight(dev, true)`
 * at the same moment (it returns the elements so you can tween instead).
 */
export function lockScreen(dev: Device, o: { time?: string; date?: string } = {}): Lock {
  const el = h('div.os-lock')
  const list = h('div.os-lock-list')
  el.append(
    h('div.os-lock-glyph', { html: icon('lock', 2.6) }),
    h('div.os-lock-date', { text: o.date ?? 'Wednesday, 7 October' }),
    h('div.os-lock-time', { text: o.time ?? '9:41' }),
    list,
    h('div.os-lock-tool', { style: { left: '46px' }, html: icon('flashlight', 2) }),
    h('div.os-lock-tool', { style: { right: '46px' }, html: icon('camera', 2) }),
  )
  const screen = dev.el.querySelector('.phone-screen') as HTMLElement
  screen.insertBefore(el, screen.firstChild)
  // above the app view, below the status bar / island / glare
  el.style.zIndex = '2'
  ;(dev.view as HTMLElement).style.zIndex = '1'
  gsap.set(el, { opacity: 0 })
  return { el, list }
}

/** The phone's status bar and home indicator, for switching them between dark-on-light and light-on-dark. */
export function statusParts(dev: Device) {
  return { status: dev.el.querySelector('.phone-status') as HTMLElement, home: dev.el.querySelector('.phone-home') as HTMLElement }
}

/** Flip the status bar for a dark screen (lock screen) or back for the app, at a moment on the timeline. */
export function statusLight(tl: Tl, dev: Device, light: boolean, at: number) {
  const { status, home } = statusParts(dev)
  tl.set(status, { color: light ? '#ffffff' : '#0b0b0d', backgroundColor: light ? 'rgba(255,255,255,0)' : '#ffffff' }, at)
  tl.set(home, { backgroundColor: light ? 'rgba(255,255,255,0)' : '#ffffff', '--bar': light ? '#ffffff' : '#0b0b0d' }, at)
}

export interface NoteOpts {
  app: 'student' | 'academy'
  title: string
  body?: string
  when?: string
  /** true for a banner dropping over an open app (opaque, with a shadow). */
  overApp?: boolean
}

/** One native notification banner (366 px wide). Position it yourself, or hand it to `deliver`. */
export function note(o: NoteOpts): HTMLElement {
  const img = new Image()
  img.decoding = 'sync'
  img.src = APP_ICON[o.app]
  const el = h(
    'div.os-note' + (o.overApp ? '.over-app' : ''),
    null,
    h('div.os-note-icon', null, img),
    h('div', null, h('div.os-note-head', null, h('div.os-note-title', { text: o.title }), h('div.os-note-when', { text: o.when ?? 'now' })), o.body ? h('div.os-note-body', { text: o.body }) : null),
  )
  return el
}

/**
 * Deliver banners into a lock screen's list the way a phone does: each new one
 * lands at the top and the earlier ones slide down to make room. `at` is the
 * timeline time each one LANDS (put it on a beat). The list must already be in
 * the document. Returns the banners in order.
 */
export function deliver(tl: Tl, list: HTMLElement, items: Array<NoteOpts & { at: number }>, o: { gap?: number } = {}): HTMLElement[] {
  const gap = o.gap ?? 8
  const cards = items.map((it) => {
    const c = note(it)
    list.append(c)
    gsap.set(c, { opacity: 0, y: -34, scale: 0.9 })
    return c
  })
  items.forEach((it, k) => {
    const hgt = cards[k].offsetHeight
    tl.to(cards[k], { opacity: 1, duration: 0.14, ease: 'none' }, it.at - 0.2)
    tl.to(cards[k], { y: 0, scale: 1, duration: 0.5, ease: 'pop' }, it.at - 0.2)
    for (let j = 0; j < k; j++) {
      const depth = k - j // how many are above this one after the arrival
      tl.to(cards[j], { y: `+=${hgt + gap}`, scale: depth >= 3 ? 0.97 : 1, opacity: depth >= 4 ? 0 : 1, duration: 0.46, ease: 'glide' }, it.at - 0.24)
    }
  })
  return cards
}

/** The small jolt a phone gives when a notification lands. */
export function buzz(tl: Tl, dev: Device, at: number) {
  tl.to(dev.el, { rotationZ: '+=0.5', duration: 0.045, ease: 'power1.out' }, at)
  tl.to(dev.el, { rotationZ: '-=0.9', duration: 0.07, ease: 'power1.inOut' }, at + 0.045)
  tl.to(dev.el, { rotationZ: '+=0.4', duration: 0.12, ease: 'power2.out' }, at + 0.115)
}
