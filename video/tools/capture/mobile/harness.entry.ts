// The page-side half of the mobile film set. serve.mjs bundles this file (with
// the fake backend, base and the `mobile` partition) into one classic script
// and puts it in <head>, so it runs before the Expo bundle does.
//
// It reads the harness's URL params, primes the keys the app's own storage
// layer reads at launch, sets the film's clock, closes the network — and
// leaves `__captureInstall` for the guarded hook in
// apps/mobile/src/lib/supabase.ts (harness.patch) to call with the client.
//
//   ?as=student|trainer|director|admin|farah|amirul|izzah|newcomer|anon
//                                   who is signed in  (default: student in the Student app, trainer in Academy)
//   ?lang=en|ms                     UI language       (default en)
//   ?theme=light|dark               theme             (default light)
//   ?db=money,teaching              other partitions to lay UNDER `mobile`, in this order (default none).
//                                   base is always first and `mobile` always last. Each is fetched as its own
//                                   script (/__capture/partition/<name>.js); one that does not build or throws
//                                   is reported and skipped.
//   ?now=2026-10-07T12:06           the film's clock, Malaysian wall time (default 2026-10-07T11:55)
//   ?writes=apply                   writes change the in-memory tables (default: accepted, not stored)
//   ?trace=1                        console.debug every backend call
//   ?ls.<key>=<value>               preset an AsyncStorage (= localStorage) entry
//
// The choice is remembered for the tab, so navigation inside the app keeps it.

import { ACADEMY_ID, installClock, installFake, type Partition, type PartitionLoader } from '../fake'
import mobile from '../fake/db/mobile'

type Config = {
  as: string
  lang: 'en' | 'ms'
  theme: 'light' | 'dark'
  db: string[]
  now: string | null
  writes: 'noop' | 'apply'
  trace: boolean
}

const g = globalThis as any
const variant: 'student' | 'academy' = g.__CAPTURE_VARIANT__ === 'academy' ? 'academy' : 'student'
const STORE = 'capture.harness'
const OWN = ['as', 'lang', 'theme', 'db', 'now', 'writes', 'trace']

function read(): Config {
  const url = new URL(window.location.href)
  const q = url.searchParams
  let saved: Partial<Config> = {}
  try {
    saved = JSON.parse(sessionStorage.getItem(STORE) ?? '{}')
  } catch {
    saved = {}
  }
  const pick = <T,>(key: string, parse: (raw: string) => T, fallback: T): T => {
    const raw = q.get(key)
    if (raw !== null) return parse(raw)
    const kept = (saved as Record<string, unknown>)[key]
    return kept === undefined ? fallback : (kept as T)
  }
  const defaultPersona = variant === 'academy' ? 'trainer' : 'student'
  const config: Config = {
    as: pick('as', (r) => r || defaultPersona, defaultPersona),
    lang: pick('lang', (r) => (r === 'ms' ? 'ms' : 'en'), 'en'),
    theme: pick('theme', (r) => (r === 'dark' ? 'dark' : 'light'), 'light'),
    db: pick('db', (r) => r.split(',').map((s) => s.trim()).filter((s) => s && s !== 'base' && s !== 'mobile'), [] as string[]),
    now: pick('now', (r) => r || null, null as string | null),
    writes: pick('writes', (r) => (r === 'apply' ? 'apply' : 'noop'), 'noop'),
    trace: pick('trace', (r) => r === '1' || r === 'true', false),
  }
  sessionStorage.setItem(STORE, JSON.stringify(config))

  const presets: string[] = []
  q.forEach((value, key) => {
    if (key.startsWith('ls.')) localStorage.setItem(key.slice(3), value)
    else if (key.startsWith('ss.')) sessionStorage.setItem(key.slice(3), value)
    else return
    presets.push(key)
  })

  // The keys the app's own `lib/kv.ts` hydrates before its first render
  // (AsyncStorage is localStorage on the web target).
  localStorage.setItem('hawary.lang', config.lang)
  localStorage.setItem('hawary.theme', config.theme)
  localStorage.setItem('hawary.activeAcademyId', ACADEMY_ID)
  localStorage.setItem('hawary.learnAcademyId', ACADEMY_ID)
  localStorage.removeItem('hawary.pushToken')

  // Leave the router exactly what is its own.
  for (const key of [...OWN, ...presets]) q.delete(key)
  const search = q.toString()
  window.history.replaceState(window.history.state, '', url.pathname + (search ? `?${search}` : '') + url.hash)
  return config
}

const config = read()
const clock = installClock(config.now)
g.__CAPTURE__ = { ...config, variant, clock }

// --- the network is off ---------------------------------------------------------
const local = (input: string): boolean => {
  try {
    const u = new URL(input, window.location.href)
    return u.origin === window.location.origin || ['data:', 'blob:', 'about:'].includes(u.protocol)
  } catch {
    return true
  }
}
const realFetch = window.fetch.bind(window)
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const target = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  if (!local(target)) {
    console.error(`[fake] BLOCKED network request: fetch ${init?.method ?? 'GET'} ${target} — the harness answers from the fake backend only`)
    return Promise.reject(new TypeError('capture harness: the network is off'))
  }
  return realFetch(input, init)
}
const realOpen = XMLHttpRequest.prototype.open
XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, method: string, target: string | URL, ...rest: unknown[]) {
  if (!local(String(target))) {
    console.error(`[fake] BLOCKED network request: XHR ${method} ${String(target)}`)
    throw new TypeError('capture harness: the network is off')
  }
  return (realOpen as (...args: unknown[]) => void).call(this, method, target, ...rest)
} as typeof XMLHttpRequest.prototype.open
// Leaving the app (a pay page, WhatsApp, a signed file) is not something a shot does.
window.open = ((target?: string | URL) => {
  console.info(`[fake] window.open(${String(target ?? '')}) ignored`)
  return null
}) as typeof window.open

// --- other people's partitions, each as its own script --------------------------
function fetchPartition(name: string): Promise<Partition> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = `/__capture/partition/${encodeURIComponent(name)}.js`
    s.onload = () => {
      const p = g.__capturePartitions?.[name]
      if (typeof p === 'function') resolve(p as Partition)
      else reject(new Error(`fake/db/${name}.ts did not load (no such file, or it does not build — see the server's console)`))
    }
    s.onerror = () => reject(new Error(`could not fetch the partition "${name}"`))
    document.head.appendChild(s)
  })
}

// --- what a phone does and the web target does not ------------------------------
//
// run.mjs calls this once the screen has settled, just before the frame is taken.
// Nothing here restyles the product: each line reproduces something the app's own
// code asks the device for and react-native-web leaves out.
//
// 1. `adjustsFontSizeToFit` (ui/index.tsx: Button, minimumFontScale 0.85; StatTile's
//    figure, 0.7). On a phone a label a few points too wide shrinks; on the web
//    it is cut with an ellipsis ("Submit assessm…", "RM 1,184,50…"). The same
//    shrink is applied here, to those two components only, never below their floor.
// 2. The navigation bar's trailing gutter. On a phone the bar insets `headerRight`
//    by 16; the web bar has none (the app says so itself in screens/Notifications.tsx,
//    where it adds the 16 by hand). Where an item sits flush against the edge,
//    the 16 is put back.
// 3. Spell-check squiggles: a desktop browser's, not a phone's.
g.__captureDeviceFixes = (): void => {
  // 3. Chrome underlines every Malay word in a text box as a spelling mistake.
  //    (A shot that types switches it off on the field before the first key — see
  //    `fill` in shots.mjs — because a squiggle already drawn can outlive this.)
  for (const field of Array.from(document.querySelectorAll<HTMLElement>('input, textarea'))) {
    field.setAttribute('spellcheck', 'false')
  }
  for (const el of Array.from(document.querySelectorAll<HTMLElement>('div[dir="auto"]'))) {
    if (el.getBoundingClientRect().width === 0) continue
    const cs = getComputedStyle(el)
    if (cs.whiteSpace !== 'nowrap' || cs.textOverflow !== 'ellipsis') continue
    const button = el.parentElement?.getAttribute('role') === 'button'
    const figure = cs.lineHeight === '34px' && /ExtraBold/.test(cs.fontFamily)
    const floor = button ? 0.85 : figure ? 0.7 : 0
    if (!floor) continue
    const base = Number(el.dataset.capBase ?? parseFloat(cs.fontSize))
    el.dataset.capBase = String(base)
    el.style.fontSize = `${base}px`
    for (let scale = 1; scale > floor && el.scrollWidth > el.clientWidth; ) {
      scale = Math.max(floor, scale - 0.01)
      el.style.fontSize = `${(base * scale).toFixed(2)}px`
    }
  }
  for (const h1 of Array.from(document.querySelectorAll<HTMLElement>('h1[role="heading"]'))) {
    const right = h1.parentElement?.nextElementSibling as HTMLElement | null
    const last = right?.lastElementChild
    if (!right || !last || right.getBoundingClientRect().width === 0) continue
    if (window.innerWidth - last.getBoundingClientRect().right < 2) right.style.paddingRight = '16px'
  }
}

// --- the hook the app calls -----------------------------------------------------
g.__captureInstall = (client: unknown) => {
  const partitions: PartitionLoader[] = [
    ...config.db.map((name) => ({ name, load: () => fetchPartition(name) })),
    { name: 'mobile', load: async () => mobile },
  ]
  const fake = installFake(client, { persona: config.as, partitions, writes: config.writes, trace: config.trace })
  g.__fake = { ...fake, config, clock, variant }
  void fake.ready.then(() => {
    document.documentElement.dataset.fake = 'ready'
    document.documentElement.dataset.fakeAs = fake.current()?.key ?? 'anon'
    document.documentElement.dataset.fakeDb = fake.db.loaded.join(',')
    console.info(`[fake] ready — app=${variant} as=${fake.current()?.key ?? 'anon'} db=${fake.db.loaded.join(',')} now=${clock} lang=${config.lang} theme=${config.theme}`)
  })
}
