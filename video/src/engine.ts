import gsap from 'gsap'
import { CustomEase } from 'gsap/CustomEase'
import { BEAT, music } from './music'

gsap.registerPlugin(CustomEase)
// Nothing is lazy and nothing ticks: the film is a pure function of time, and
// the only clock is `seek()`.
gsap.defaults({ lazy: false, overwrite: false, ease: 'power3.out' })
gsap.ticker.lagSmoothing(0)

export const W = 1920
export const H = 1080
export const FPS = 30

// The house curves. Use these by name instead of inventing new ones.
CustomEase.create('swift', 'M0,0 C0.16,1 0.3,1 1,1') //  fast in, long settle: entrances
CustomEase.create('swiftIn', 'M0,0 C0.7,0 0.84,0 1,1') // slow start, hard exit: exits
CustomEase.create('glide', 'M0,0 C0.65,0 0.35,1 1,1') //  symmetric: camera moves, A-to-B
CustomEase.create('whip', 'M0,0 C0.9,0 0.1,1 1,1') //     violent middle: whip pans
CustomEase.create('pop', 'M0,0 C0.34,1.56 0.64,1 1,1') // slight overshoot: chips, badges, dots

export type SfxName = 'whoosh' | 'whooshLong' | 'click' | 'tap' | 'pop' | 'tick' | 'ding' | 'success' | 'shimmer' | 'rise' | 'impact'
export interface SfxCue {
  name: SfxName
  /** absolute seconds */
  t: number
  gain: number
  pan: number
  scene: string
}
/** Every sound effect the film asks for; tools/audio/mix.mjs reads this to build the soundtrack. */
export const sfxCues: SfxCue[] = []

export interface SceneCtx {
  /** The scene's own root (absolute, 1920x1080, perspective 2400px). Put everything in here. */
  root: HTMLElement
  /** The scene's timeline. Local time 0 is `lead` seconds before the scene's downbeat. */
  tl: gsap.core.Timeline
  /** Local time of `n` beats after the scene's first downbeat (fractions allowed). Use for every position. */
  B: (n: number) => number
  /** A length of n beats in seconds, for durations. */
  beats: (n: number) => number
  /** Scene length in beats, downbeat to end. */
  lengthBeats: number
  /** Absolute time of the scene's first downbeat. */
  start: number
  /**
   * Cue a sound effect at a local timeline time (use B()). Names: 'whoosh' (fast move), 'whooshLong' (big
   * transition), 'click' (mouse), 'tap' (finger), 'pop' (chip or badge appears), 'tick' (small step, counter,
   * keystroke), 'ding' (notification arrives), 'success' (approved / paid / published), 'shimmer' (AI at work),
   * 'rise' (2s build that ENDS at the given time), 'impact' (big landing). `gain` 0-1.5, `pan` -1..1.
   */
  sfx: (name: SfxName, at: number, gain?: number, pan?: number) => void
  /** Run a function on every rendered frame while the scene is visible. `t` is absolute seconds, `beat` is beats since the scene's downbeat. Must be a pure function of its arguments. */
  onFrame: (fn: (t: number, beat: number) => void) => void
  music: typeof music
}

export interface SceneDef {
  id: string
  /** First downbeat, absolute seconds (use bar() from music.ts). */
  start: number
  /** Nominal end, absolute seconds. */
  end: number
  /** Seconds the scene is alive before `start` (for transitions in). Default 0.5. */
  lead?: number
  /** Seconds the scene stays alive after `end` (for transitions out). Default 0.5. */
  tail?: number
  build: (ctx: SceneCtx) => void | Promise<void>
}

interface LiveScene {
  def: SceneDef
  wrap: HTMLElement
  root: HTMLElement
  from: number
  to: number
  hooks: Array<(t: number, beat: number) => void>
  shown: boolean
}

const live: LiveScene[] = []
const globalHooks: Array<(t: number) => void> = []
export const master = gsap.timeline({ paused: true })

export function onEveryFrame(fn: (t: number) => void) {
  globalHooks.push(fn)
}

/** The wrapper the film animates for transitions between scenes. */
export function wrapOf(id: string): HTMLElement {
  const s = live.find((l) => l.def.id === id)
  if (!s) throw new Error(`no scene ${id}`)
  return s.wrap
}

export async function mountScene(def: SceneDef, index: number) {
  const lead = Math.min(def.lead ?? 0.5, def.start)
  const tail = def.tail ?? 0.5
  const wrap = document.createElement('div')
  wrap.className = 'scene-wrap'
  wrap.dataset.id = def.id
  wrap.style.zIndex = String(10 + index)
  const root = document.createElement('div')
  root.className = 'scene'
  root.dataset.id = def.id
  wrap.appendChild(root)
  document.getElementById('scenes')!.appendChild(wrap)

  const tl = gsap.timeline()
  const s: LiveScene = { def, wrap, root, from: def.start - lead, to: def.end + tail, hooks: [], shown: true }
  const ctx: SceneCtx = {
    root,
    tl,
    B: (n) => lead + n * BEAT,
    beats: (n) => n * BEAT,
    lengthBeats: (def.end - def.start) / BEAT,
    start: def.start,
    sfx: (name, at, gain = 1, pan = 0) => sfxCues.push({ name, t: Math.round((s.from + at) * 1000) / 1000, gain, pan, scene: def.id }),
    onFrame: (fn) => s.hooks.push(fn),
    music,
  }
  await def.build(ctx)
  // Pad so the timeline's clock covers the scene's whole life even if its last tween ends early.
  tl.set({}, {}, s.to - s.from)
  master.add(tl, s.from)
  live.push(s)
}

/** Put the whole film at time `t` (seconds). Resolves when every visible image is decoded. */
export async function seek(t: number) {
  master.time(Math.max(0, t), false)
  const pending: Promise<unknown>[] = []
  for (const s of live) {
    const on = t >= s.from - 1e-6 && t < s.to
    if (on !== s.shown) {
      s.wrap.style.display = on ? 'block' : 'none'
      s.shown = on
      if (on) for (const img of s.wrap.querySelectorAll('img')) pending.push(img.decode().catch(() => {}))
    }
    if (on) for (const fn of s.hooks) fn(t, (t - s.def.start) / BEAT)
  }
  for (const fn of globalHooks) fn(t)
  if (pending.length) await Promise.all(pending)
}

// ---- motion blur support -------------------------------------------------
// The renderer blends several sub-frames into each output frame, but only where
// something is actually moving: it asks `motion()` how far anything on screen
// travels while the shutter is open and spends samples accordingly.

const forced: Array<[number, number, number]> = []
/** Ask for motion blur between two absolute times even if no element's box moves (clip-path wipes, canvas, SVG path morphs). */
export function forceBlur(t0: number, t1: number, samples = 12) {
  forced.push([t0, t1, samples])
}

function boxes(): Map<Element, DOMRect> {
  const out = new Map<Element, DOMRect>()
  const roots: Element[] = live.filter((s) => s.shown).map((s) => s.wrap)
  roots.push(document.getElementById('overlay')!)
  for (const root of roots) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
      acceptNode(n) {
        const st = (n as HTMLElement).style
        return st && (st.opacity === '0' || st.visibility === 'hidden' || st.display === 'none') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
      },
    })
    for (let n = walker.nextNode() as Element | null; n; n = walker.nextNode() as Element | null) {
      const r = n.getBoundingClientRect()
      if (r.width > 0 || r.height > 0) out.set(n, r)
    }
  }
  return out
}

/** Largest on-screen travel (px) of anything between t and t + dt, and the forced sample count for t. Leaves the film at t. */
export async function motion(t: number, dt: number): Promise<{ px: number; forced: number; who: string }> {
  await seek(t + dt)
  const b = boxes()
  await seek(t)
  const a = boxes()
  let px = 0
  let who = ''
  for (const [el, ra] of a) {
    const rb = b.get(el)
    if (!rb) continue
    const onA = ra.right > 0 && ra.left < W && ra.bottom > 0 && ra.top < H
    const onB = rb.right > 0 && rb.left < W && rb.bottom > 0 && rb.top < H
    if (!onA && !onB) continue
    const d = Math.max(Math.abs(ra.left - rb.left), Math.abs(ra.top - rb.top), Math.abs(ra.right - rb.right), Math.abs(ra.bottom - rb.bottom))
    if (d > px) {
      px = d
      who = `${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').split(' ')[0]}`
    }
  }
  let f = 0
  for (const [t0, t1, n] of forced) if (t >= t0 && t < t1 && n > f) f = n
  return { px, forced: f, who }
}

export function sceneList() {
  return live.map((s) => ({ id: s.def.id, start: s.def.start, end: s.def.end, from: s.from, to: s.to }))
}

/** A seeded random source: the film must render the same way every time. */
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let x = Math.imul(a ^ (a >>> 15), 1 | a)
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

export { gsap }
