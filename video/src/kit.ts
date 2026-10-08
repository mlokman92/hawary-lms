// The motion kit: every scene is built from these pieces so the film reads as
// one hand. Devices are laid out at the screenshot's own CSS-pixel size (a
// browser view is 1440x900, a phone screen 390x844) and scaled by the scene, so
// a rect from a shot's JSON is a position you can use as-is inside `device.ov`.

import gsap from 'gsap'
import lockupRaw from '../public/brand/lockup.svg?raw'

const ICONS = import.meta.glob('/node_modules/lucide-static/icons/*.svg', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

export type Rect = { x: number; y: number; w: number; h: number; radius?: number }
export type Tl = gsap.core.Timeline

// ---------------------------------------------------------------- dom

/** h('div.chip.teal', { style: 'top:4px' }, child, 'text') */
export function h(spec: string, attrs?: Record<string, any> | null, ...kids: Array<Node | string | null | undefined>): HTMLElement {
  const [tagAndId, ...classes] = spec.split('.')
  const [tag, id] = tagAndId.split('#')
  const el = document.createElement(tag || 'div')
  if (id) el.id = id
  if (classes.length) el.className = classes.join(' ')
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null) continue
      if (k === 'style' && typeof v === 'object') Object.assign(el.style, v)
      else if (k === 'html') el.innerHTML = v
      else if (k === 'text') el.textContent = v
      else el.setAttribute(k, String(v))
    }
  }
  for (const kid of kids) if (kid != null) el.append(kid)
  return el
}

/** Append children to a parent and return the parent. */
export function add<T extends HTMLElement>(parent: T, ...kids: Array<Node | null | undefined>): T {
  for (const k of kids) if (k) parent.append(k)
  return parent
}

/** A lucide icon as inline SVG markup (names as on lucide.dev: 'sparkles', 'file-text', 'check'). */
export function icon(name: string, strokeWidth = 2): string {
  const raw = ICONS[`/node_modules/lucide-static/icons/${name}.svg`]
  if (!raw) throw new Error(`no lucide icon "${name}"`)
  return raw.replace(/<!--[\s\S]*?-->/g, '').replace(/stroke-width="[^"]*"/, `stroke-width="${strokeWidth}"`).replace(/\s(width|height)="24"/g, '')
}

// ---------------------------------------------------------------- shots

export interface Shot {
  key: string
  src: string
  w: number
  h: number
  dpr: number
  pageH: number
  /** The colour of the screenshot's top-left and bottom-left corner (what a phone's status bar and home strip should continue). */
  topColor: string
  bottomColor: string
  tags: Record<string, Rect>
  els: Array<Rect & { kind: 'box' | 'text'; tag: string; slot?: string; role?: string; text: string }>
  /** A rect the capture agent named. Throws if absent, so a typo fails loudly. */
  tag: (name: string) => Rect
  /** The first auto-collected element matching the query (text is a substring match). */
  find: (q: { text?: string; kind?: 'box' | 'text'; tag?: string; slot?: string; nth?: number; minW?: number; maxW?: number }) => Rect
  img: () => HTMLImageElement
}

const shotCache = new Map<string, Promise<Shot>>()

/** Load a captured screen: shot('web/courses'), shot('student/home'), shot('academy/lpkc'). */
export function shot(key: string): Promise<Shot> {
  if (!shotCache.has(key)) {
    shotCache.set(
      key,
      (async () => {
        const res = await fetch(`/shots/${key}.json`)
        if (!res.ok) throw new Error(`shot ${key}: no JSON (${res.status})`)
        const meta = await res.json()
        const src = `/shots/${key}.png`
        const probe = new Image()
        probe.src = src
        await probe.decode()
        // sample the corners so a phone frame can continue the app's own header and footer colours
        const cv = document.createElement('canvas')
        cv.width = 2
        cv.height = 1
        const g = cv.getContext('2d', { willReadFrequently: true })!
        const px = Math.round(6 * meta.dpr)
        g.drawImage(probe, px, px, 1, 1, 0, 0, 1, 1)
        g.drawImage(probe, px, probe.naturalHeight - px, 1, 1, 1, 0, 1, 1)
        const d = g.getImageData(0, 0, 2, 1).data
        const s: Shot = {
          key,
          src,
          w: meta.w,
          h: meta.h,
          dpr: meta.dpr,
          pageH: meta.pageH,
          topColor: `rgb(${d[0]},${d[1]},${d[2]})`,
          bottomColor: `rgb(${d[4]},${d[5]},${d[6]})`,
          tags: meta.tags || {},
          els: meta.els || [],
          tag(name) {
            const r = s.tags[name]
            if (!r) throw new Error(`shot ${key}: no tag "${name}" (have: ${Object.keys(s.tags).join(', ')})`)
            return r
          },
          find(q) {
            const hits = s.els.filter(
              (e) =>
                (!q.text || e.text.includes(q.text)) &&
                (!q.kind || e.kind === q.kind) &&
                (!q.tag || e.tag === q.tag) &&
                (!q.slot || e.slot === q.slot) &&
                (!q.minW || e.w >= q.minW) &&
                (!q.maxW || e.w <= q.maxW),
            )
            const r = hits[q.nth || 0]
            if (!r) throw new Error(`shot ${key}: nothing matches ${JSON.stringify(q)}`)
            return r
          },
          img() {
            const im = new Image()
            im.decoding = 'sync'
            im.src = src
            im.className = 'shot'
            im.style.width = `${s.w}px`
            im.style.height = `${s.h}px`
            return im
          },
        }
        return s
      })(),
    )
  }
  return shotCache.get(key)!
}

// ---------------------------------------------------------------- devices

/** Anything overlays can sit on: a device, or a scroll pane inside one. Positions in `ov` are the shot's CSS pixels. */
export interface Layer {
  ov: HTMLElement
  shot: Shot
}

export interface Device {
  /** The whole device. Position and animate this (x, y, scale, rotationX/Y/Z). Its untransformed size is `w` x `h`. */
  el: HTMLElement
  /** The clipped screen. */
  view: HTMLElement
  /** The page inside the screen: animate its `y` to scroll a fullPage shot. */
  scroll: HTMLElement
  /** Overlay layer in the shot's own CSS-pixel space, scrolling with the page. Lifts, rings, cursors go here. */
  ov: HTMLElement
  shot: Shot
  w: number
  h: number
  /** Stack another, pixel-aligned shot on top (hidden). Fade or wipe it in to change the screen's state. Returns its <img>. */
  layer: (s: Shot) => HTMLImageElement
}

const LOCK = icon('lock', 2.4)

/** A browser window showing a web shot. Native size 1440 x (52 + viewH). */
export function browser(s: Shot, opts: { url?: string; viewH?: number; bare?: boolean } = {}): Device {
  const viewH = opts.viewH ?? 900
  const el = h('div.browser' + (opts.bare ? '.bare' : ''))
  if (!opts.bare) {
    const [host, ...rest] = (opts.url ?? 'app.hawary.my').split('/')
    const path = rest.length ? '/' + rest.join('/') : ''
    el.append(h('div.browser-bar', null, h('i'), h('i'), h('i'), h('div.browser-url', { html: `${LOCK}<span><b>${host}</b>${path}</span>` })))
  }
  const view = h('div.browser-view', { style: { height: `${viewH}px` } })
  const scroll = h('div.view-scroll', { style: { width: `${s.w}px`, height: `${s.h}px` } })
  const ov = h('div.view-ov', { style: { width: `${s.w}px`, height: `${s.h}px` } })
  scroll.append(s.img(), ov)
  view.append(scroll)
  el.append(view)
  const dev: Device = {
    el,
    view,
    scroll,
    ov,
    shot: s,
    w: 1440,
    h: viewH + (opts.bare ? 0 : 52),
    layer(s2) {
      const im = s2.img()
      im.style.position = 'absolute'
      im.style.left = '0'
      im.style.top = '0'
      im.style.opacity = '0'
      scroll.insertBefore(im, ov)
      return im
    },
  }
  return dev
}

const SIGNAL = `<svg viewBox="0 0 18 12" fill="currentColor"><rect x="0" y="8" width="3" height="4" rx=".7"/><rect x="5" y="5.5" width="3" height="6.5" rx=".7"/><rect x="10" y="3" width="3" height="9" rx=".7"/><rect x="15" y="0" width="3" height="12" rx=".7"/></svg>`
const WIFI = `<svg viewBox="0 0 16 12" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M1.3 4.3a10 10 0 0 1 13.4 0"/><path d="M3.8 7a6.2 6.2 0 0 1 8.4 0"/><circle cx="8" cy="10.2" r="1.2" fill="currentColor" stroke="none"/></svg>`
const BATTERY = `<svg viewBox="0 0 27 12"><rect x=".5" y=".5" width="23" height="11" rx="3.3" fill="none" stroke="currentColor" opacity=".4"/><rect x="2" y="2" width="20" height="8" rx="2" fill="currentColor"/><rect x="24.6" y="4" width="1.6" height="4" rx=".8" fill="currentColor" opacity=".45"/></svg>`

/**
 * A phone showing a mobile shot (390 x 763 capture). Native size 414 x 868; the screen is 390 x 844.
 * The status bar and home strip take the screenshot's own corner colours unless you pass statusBg / homeBg.
 * A web page shot at phone width (430 wide) fits with: gsap.set(dev.scroll, { scale: 390 / 430, transformOrigin: '0 0' }).
 */
export function phone(s: Shot, opts: { time?: string; statusBg?: string; homeBg?: string } = {}): Device {
  const el = h('div.phone')
  const screen = h('div.phone-screen')
  const status = h('div.phone-status', { style: { background: opts.statusBg ?? s.topColor ?? '#fff' } }, h('span', { text: opts.time ?? '9:41' }), h('span.sys', { html: SIGNAL + WIFI + BATTERY }))
  const view = h('div.phone-view')
  const scroll = h('div.view-scroll', { style: { width: `${s.w}px`, height: `${s.h}px` } })
  const ov = h('div.view-ov', { style: { width: `${s.w}px`, height: `${s.h}px` } })
  scroll.append(s.img(), ov)
  view.append(scroll)
  screen.append(status, h('div.phone-island'), view, h('div.phone-home', { style: { background: opts.homeBg ?? s.bottomColor ?? '#fff' } }), h('div.phone-glare'))
  el.append(screen)
  return {
    el,
    view,
    scroll,
    ov,
    shot: s,
    w: 414,
    h: 868,
    layer(s2) {
      const im = s2.img()
      im.style.position = 'absolute'
      im.style.left = '0'
      im.style.top = '0'
      im.style.opacity = '0'
      scroll.insertBefore(im, ov)
      return im
    },
  }
}

export interface Pane extends Layer {
  /** The clipped window onto the long page. */
  el: HTMLElement
  /** The long page inside it: tween its `y` from 0 to -maxScroll to scroll. */
  inner: HTMLElement
  /** How far it can scroll (px). */
  maxScroll: number
}

/**
 * Scroll one region of a screen while the rest stays put — the way the real
 * app scrolls its content under a fixed sidebar and header. `full` is the
 * fullPage shot of the same screen; `region` is the part of the viewport that
 * scrolls (default: everything right of the web sidebar, below the header).
 * `extra` adds blank page below the end so the last rows can be brought to the
 * middle of the screen (keep it under ~250px).
 * Overlays that must travel with the content go in the returned pane
 * (`lift(pane, full.tag('row'))`), using the FULL shot's coordinates.
 */
export function scrollPane(dev: Device, full: Shot, opts: { region?: Rect; extra?: number; bg?: string } = {}): Pane {
  const region = opts.region ?? { x: 257, y: 57, w: 1183, h: 843 }
  const el = h('div.abs', { style: { left: `${region.x}px`, top: `${region.y}px`, width: `${region.w}px`, height: `${region.h}px`, overflow: 'hidden', background: opts.bg ?? '#fff' } })
  const inner = h('div.abs', { style: { left: `${-region.x}px`, top: `${-region.y}px`, width: `${full.w}px`, height: `${full.h}px` } })
  const ov = h('div.view-ov', { style: { width: `${full.w}px`, height: `${full.h}px` } })
  inner.append(full.img(), ov)
  el.append(inner)
  dev.ov.append(el)
  return { el, inner, ov, shot: full, maxScroll: Math.max(0, full.h - (region.y + region.h)) + (opts.extra ?? 0) }
}

/** Where an attached element currently is, in stage pixels (works in the scaled dev preview too). Use at build time to lay things out from real text metrics. */
export function stageBox(el: Element): Rect {
  const st = document.getElementById('stage')!.getBoundingClientRect()
  const k = st.width / 1920
  const r = el.getBoundingClientRect()
  return { x: (r.left - st.left) / k, y: (r.top - st.top) / k, w: r.width / k, h: r.height / k }
}

/**
 * Lay an element out at a stage (or overlay) position using left/top. Use this for type, chips, dots —
 * everything except devices — so that x / y / scale stay free for animation.
 */
export function put<T extends HTMLElement>(el: T, x: number, y: number): T {
  el.style.left = `${x}px`
  el.style.top = `${y}px`
  return el
}

/** Put a device (or anything of known size) so its centre is at stage point (cx, cy). Extra props go to gsap.set. */
export function place(el: HTMLElement, size: { w: number; h: number }, cx: number, cy: number, props: gsap.TweenVars = {}) {
  gsap.set(el, { x: cx - size.w / 2, y: cy - size.h / 2, transformOrigin: '50% 50%', ...props })
}

// ---------------------------------------------------------------- lifting real UI out of a shot

/**
 * A live copy of one region of the device's screenshot, sitting exactly over
 * the original. Scale it, raise it, give it a shadow: a real card pops out of
 * the real page. `from` picks which shot to copy from (default: the device's).
 */
export function lift(dev: Layer, r: Rect, opts: { pad?: number; radius?: number; from?: Shot } = {}): HTMLElement {
  const pad = opts.pad ?? 0
  const s = opts.from ?? dev.shot
  const el = h('div.lift', {
    style: {
      left: `${r.x - pad}px`,
      top: `${r.y - pad}px`,
      width: `${r.w + pad * 2}px`,
      height: `${r.h + pad * 2}px`,
      borderRadius: `${opts.radius ?? r.radius ?? 12}px`,
    },
  })
  const im = s.img()
  im.style.left = `${-(r.x - pad)}px`
  im.style.top = `${-(r.y - pad)}px`
  el.append(im)
  dev.ov.append(el)
  return el
}

/** Raise a lifted piece: grows, floats up and gains a shadow. Pair with `liftDown`. */
export function liftUp(tl: Tl, el: HTMLElement, at: number, v: { scale?: number; y?: number; dur?: number } = {}) {
  tl.fromTo(
    el,
    { scale: 1, y: 0, boxShadow: '0 0px 0px 0px rgba(17,17,19,0), 0 0px 0px 0px rgba(17,17,19,0), 0 0px 0px 0px rgba(15,118,110,0)' },
    {
      scale: v.scale ?? 1.06,
      y: v.y ?? -6,
      boxShadow: '0 2px 4px 0px rgba(17,17,19,0.06), 0 14px 28px -6px rgba(17,17,19,0.16), 0 40px 70px -18px rgba(15,118,110,0.34)',
      duration: v.dur ?? 0.5,
      ease: 'pop',
      immediateRender: false,
    },
    at,
  )
}
export function liftDown(tl: Tl, el: HTMLElement, at: number, dur = 0.35) {
  tl.to(el, { scale: 1, y: 0, boxShadow: '0 0px 0px 0px rgba(17,17,19,0), 0 0px 0px 0px rgba(17,17,19,0), 0 0px 0px 0px rgba(15,118,110,0)', duration: dur, ease: 'glide' }, at)
}

/** A teal outline around a rect of the screen (hidden until you animate opacity/scale). */
export function ring(dev: Layer, r: Rect, pad = 6): HTMLElement {
  const el = h('div.ring', {
    style: { left: `${r.x - pad}px`, top: `${r.y - pad}px`, width: `${r.w + pad * 2}px`, height: `${r.h + pad * 2}px`, borderRadius: `${(r.radius ?? 10) + pad}px`, opacity: '0' },
  })
  dev.ov.append(el)
  return el
}

/** Darkens the screen except one rect (hidden until you animate its opacity). */
export function dim(dev: Layer, r: Rect, pad = 8): HTMLElement {
  const el = h('div.dim', {
    style: { left: `${r.x - pad}px`, top: `${r.y - pad}px`, width: `${r.w + pad * 2}px`, height: `${r.h + pad * 2}px`, borderRadius: `${(r.radius ?? 10) + pad}px`, opacity: '0' },
  })
  dev.ov.append(el)
  return el
}

/** A point inside a rect: (0.5, 0.5) is its centre. */
export const pt = (r: Rect, ax = 0.5, ay = 0.5) => ({ x: r.x + r.w * ax, y: r.y + r.h * ay })

/**
 * Animate a device so that a rect of its screen fills a given part of the
 * stage ("push in on the row"). Returns the gsap vars; you choose when:
 *   tl.to(dev.el, { ...focus(dev, rect, { cx: 960, cy: 540, width: 900 }), duration: 1, ease: 'glide' }, B(4))
 * Assumes the device is not rotated at the destination and transformOrigin is its centre.
 */
export function focus(dev: Device, r: Rect, to: { cx?: number; cy?: number; width?: number; scale?: number }) {
  const barH = dev.h - (dev.view.clientHeight || parseFloat(dev.view.style.height) || 0)
  const top = dev.el.classList.contains('phone') ? 12 + 47 : barH
  const left = dev.el.classList.contains('phone') ? 12 : 0
  const scrollY = Number(gsap.getProperty(dev.scroll, 'y')) || 0
  const scale = to.scale ?? (to.width ?? 900) / r.w
  const px = left + r.x + r.w / 2
  const py = top + r.y + r.h / 2 + scrollY
  // with transformOrigin at centre: stage = pos + centre + (p - centre) * scale
  const cx = to.cx ?? 960
  const cy = to.cy ?? 540
  return { x: cx - dev.w / 2 - (px - dev.w / 2) * scale, y: cy - dev.h / 2 - (py - dev.h / 2) * scale, scale, rotationX: 0, rotationY: 0, rotationZ: 0 }
}

// ---------------------------------------------------------------- pointer

const ARROW = `<svg viewBox="0 0 30 30"><path d="M4 3l0 20.500 5.600-5.300 3.700 8.600 3.300-1.400-3.700-8.500 7.600-.300z" fill="#111113" stroke="#fff" stroke-width="1.700" stroke-linejoin="round"/></svg>`

export interface Pointer {
  el: HTMLElement
  ripple: HTMLElement
}

/** A mouse pointer living in a device's overlay (positions are shot pixels). Starts hidden. */
export function cursor(dev: Layer, at: { x: number; y: number }): Pointer {
  const el = h('div.cursor', { html: ARROW })
  const ripple = h('div.ripple')
  dev.ov.append(ripple, el)
  gsap.set(el, { x: at.x, y: at.y, opacity: 0 })
  gsap.set(ripple, { x: at.x, y: at.y })
  return { el, ripple }
}

/** A fingertip for phone screens. Starts hidden. */
export function touch(dev: Layer, at: { x: number; y: number }): Pointer {
  const el = h('div.touch')
  const ripple = h('div.ripple')
  dev.ov.append(ripple, el)
  gsap.set(el, { x: at.x, y: at.y, opacity: 0, scale: 1.3 })
  gsap.set(ripple, { x: at.x, y: at.y })
  return { el, ripple }
}

/** Glide the pointer to a point (shot pixels), arriving at `at + dur`. */
export function moveTo(tl: Tl, p: Pointer, to: { x: number; y: number }, at: number, dur = 0.6) {
  tl.to(p.el, { opacity: 1, duration: 0.15, ease: 'none' }, at)
  tl.to(p.el, { x: to.x, y: to.y, duration: dur, ease: 'glide' }, at)
  tl.set(p.ripple, { x: to.x, y: to.y }, at)
}

/** A click or tap at the pointer's current place: the press lands exactly at `at`. */
export function click(tl: Tl, p: Pointer, at: number) {
  const isTouch = p.el.classList.contains('touch')
  const rest = isTouch ? 1.3 : 1
  tl.to(p.el, { scale: rest * 0.8, duration: 0.07, ease: 'power2.in' }, at - 0.07)
  tl.to(p.el, { scale: rest, duration: 0.3, ease: 'pop' }, at)
  tl.fromTo(p.ripple, { scale: 0.3, opacity: 0.9 }, { scale: 1.8, opacity: 0, duration: 0.5, ease: 'power2.out', immediateRender: false }, at)
}

export function hidePointer(tl: Tl, p: Pointer, at: number) {
  tl.to(p.el, { opacity: 0, duration: 0.2, ease: 'none' }, at)
}

// ---------------------------------------------------------------- type

export interface Split {
  el: HTMLElement
  lines: HTMLElement[]
  words: HTMLElement[]
  chars: HTMLElement[]
}

/**
 * Kinetic type. `text('t-h1', 'Every intake\nis a *course*.')` — "\n" breaks
 * lines, *word* is teal, _word_ is amber. Every line is a mask; reveal the
 * words (or chars) by sliding them up into it with `rise`.
 */
export function text(cls: string, str: string, opts: { chars?: boolean; style?: Partial<CSSStyleDeclaration> } = {}): Split {
  const el = h('div.abs.' + cls.split(' ').join('.'))
  if (opts.style) Object.assign(el.style, opts.style)
  const out: Split = { el, lines: [], words: [], chars: [] }
  for (const lineStr of str.split('\n')) {
    const line = h('span.sp-line')
    const tokens = lineStr.split(/(\s+)/)
    let tone: string | null = null
    for (const tok of tokens) {
      if (tok === '') continue
      if (/^\s+$/.test(tok)) {
        line.append(h('span.sp-word', { text: tok }))
        continue
      }
      let word = tok
      let cls2 = ''
      const open = word.match(/^([*_])/)
      if (open && !tone) {
        tone = open[1]
        word = word.slice(1)
      }
      if (tone) cls2 = tone === '*' ? '.t-teal' : '.t-amber'
      const close = tone && word.match(new RegExp(`\\${tone}([.,!?;:]*)$`))
      if (close) {
        word = word.slice(0, word.length - close[0].length) + close[1]
        tone = null
      }
      const w = h('span.sp-word' + cls2)
      if (opts.chars) {
        for (const ch of [...word]) {
          const c = h('span.sp-char', { text: ch })
          w.append(c)
          out.chars.push(c)
        }
      } else w.textContent = word
      line.append(w)
      out.words.push(w)
    }
    el.append(line)
    out.lines.push(line)
  }
  return out
}

/** Words (or chars) slide up into their line masks. They start hidden as soon as this is called. */
export function rise(tl: Tl, parts: HTMLElement[], at: number, v: { stagger?: number; dur?: number; ease?: string } = {}) {
  gsap.set(parts, { yPercent: 118 })
  tl.to(parts, { yPercent: 0, duration: v.dur ?? 0.7, ease: v.ease ?? 'swift', stagger: v.stagger ?? 0.05 }, at)
}

/** Words (or chars) leave upward through their line masks. */
export function leave(tl: Tl, parts: HTMLElement[], at: number, v: { stagger?: number; dur?: number } = {}) {
  tl.to(parts, { yPercent: -118, duration: v.dur ?? 0.4, ease: 'swiftIn', stagger: v.stagger ?? 0.025 }, at)
}

/** A pill label: chip('Published', { icon: 'check', tone: 'teal' }). Tones: (white) | teal | amber | ink. */
export function chip(label: string, opts: { icon?: string; tone?: 'teal' | 'amber' | 'ink'; sm?: boolean } = {}): HTMLElement {
  return h('div.chip' + (opts.tone ? '.' + opts.tone : '') + (opts.sm ? '.sm' : ''), { html: (opts.icon ? icon(opts.icon, 2.2) : '') + `<span>${label}</span>` })
}

/** Pop something in (scale + fade, slight overshoot). Hidden from the moment this is called. */
export function popIn(tl: Tl, els: HTMLElement | HTMLElement[], at: number, v: { stagger?: number; dur?: number; from?: number } = {}) {
  gsap.set(els, { scale: v.from ?? 0.6, opacity: 0, yPercent: 35 })
  tl.to(els, { scale: 1, opacity: 1, yPercent: 0, duration: v.dur ?? 0.45, ease: 'pop', stagger: v.stagger ?? 0.06 }, at)
}
export function popOut(tl: Tl, els: HTMLElement | HTMLElement[], at: number, v: { stagger?: number; dur?: number } = {}) {
  tl.to(els, { scale: 0.7, opacity: 0, duration: v.dur ?? 0.22, ease: 'power2.in', stagger: v.stagger ?? 0.03 }, at)
}

/** A number that counts: tween the returned object's `v`. fmt gets the raw value each frame. */
export function counter(el: HTMLElement, from: number, fmt: (v: number) => string) {
  const state = { v: from }
  const draw = () => {
    el.textContent = fmt(state.v)
  }
  draw()
  return { state, draw }
}
export function countTo(tl: Tl, c: { state: { v: number }; draw: () => void }, to: number, at: number, dur = 1, ease = 'power2.out') {
  tl.to(c.state, { v: to, duration: dur, ease, onUpdate: c.draw }, at)
}

/** RM 1,800.00 from integer sen. */
export const rm = (sen: number) => 'RM ' + (Math.round(sen) / 100).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const int = (n: number) => Math.round(n).toLocaleString('en-MY')

// ---------------------------------------------------------------- brand

export interface Mark {
  el: HTMLElement
  svg: SVGSVGElement
  arch: SVGPathElement
  dot: SVGCircleElement
}

/** The symbol alone (arch + dot), `size` px square, as two separately animatable shapes. */
export function mark(size: number, opts: { arch?: string; dot?: string } = {}): Mark {
  const el = h('div.abs', {
    style: { width: `${size}px`, height: `${size}px` },
    html: `<svg viewBox="0 0 512 512" width="${size}" height="${size}" style="display:block;overflow:visible"><path fill="${opts.arch ?? '#0f766e'}" d="M40 440V272A216 216 0 0 1 472 272V440H376V272A120 124 0 0 0 136 272V440Z"/><circle fill="${opts.dot ?? '#f59e0b'}" cx="256" cy="371" r="72"/></svg>`,
  })
  const svg = el.querySelector('svg') as SVGSVGElement
  return { el, svg, arch: svg.querySelector('path') as SVGPathElement, dot: svg.querySelector('circle') as SVGCircleElement }
}

export interface Lockup {
  el: HTMLElement
  svg: SVGSVGElement
  arch: SVGPathElement
  dot: SVGCircleElement
  hawary: SVGPathElement
  academy: SVGPathElement
  /** rendered width / height in px */
  w: number
  hgt: number
}

/** The real lockup (brand/lockup.svg): arch, dot, 'Hawary', 'Academy' as four shapes. */
export function lockup(width: number): Lockup {
  const el = h('div.abs', { html: lockupRaw.replace(/<!--[\s\S]*?-->/g, '') })
  const svg = el.querySelector('svg') as SVGSVGElement
  const hgt = (width * 277.92) / 1619.04
  svg.setAttribute('width', String(width))
  svg.setAttribute('height', String(hgt))
  svg.style.display = 'block'
  svg.style.overflow = 'visible'
  el.style.width = `${width}px`
  el.style.height = `${hgt}px`
  const paths = svg.querySelectorAll('path')
  return { el, svg, arch: paths[0], dot: svg.querySelector('circle') as SVGCircleElement, hawary: paths[1], academy: paths[2], w: width, hgt }
}

/** The amber dot as a free-floating element (centre-anchored: its x/y is its centre). */
export function dot(size = 40, color = '#f59e0b'): HTMLElement {
  return h('div.dot', { style: { width: `${size}px`, height: `${size}px`, margin: `${-size / 2}px 0 0 ${-size / 2}px`, background: color } })
}

/** A thin SVG connector from a to b (stage px). Draw it with `draw`. */
export function connector(a: { x: number; y: number }, b: { x: number; y: number }, opts: { color?: string; width?: number; curve?: number } = {}) {
  const dx = b.x - a.x
  const c = opts.curve ?? 0.5
  const d = `M${a.x},${a.y} C${a.x + dx * c},${a.y} ${b.x - dx * c},${b.y} ${b.x},${b.y}`
  const el = h('div.fill', {
    html: `<svg width="1920" height="1080" viewBox="0 0 1920 1080" style="position:absolute;inset:0;overflow:visible"><path d="${d}" fill="none" stroke="${opts.color ?? '#0f766e'}" stroke-width="${opts.width ?? 3}" stroke-linecap="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/></svg>`,
  })
  return { el, path: el.querySelector('path') as SVGPathElement }
}
export function draw(tl: Tl, path: SVGPathElement, at: number, dur = 0.5) {
  tl.to(path, { attr: { 'stroke-dashoffset': 0 }, duration: dur, ease: 'glide' }, at)
}

export { gsap }
