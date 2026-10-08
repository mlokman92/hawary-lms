// Runs before the app's own entry (the server injects it into <head>).
// Reads the harness's URL params, primes the app's own storage keys, sets the
// film's clock and closes the network. Then removes its params from the URL so
// the router sees only what belongs to it.
//
//   ?as=director|admin|trainer|student|anon|…   who is signed in      (default director)
//   ?lang=en|ms                                  UI language           (default en)
//   ?theme=light|dark                            theme                 (default light)
//   ?db=teaching,money                           extra partitions      (default none; base is always in)
//   ?now=2026-10-07T12:06                        the film's clock, MYT (default 2026-10-07T11:55)
//   ?writes=apply                                writes change the in-memory tables (default: accepted, not stored)
//   ?trace=1                                     console.debug every backend call
//   ?ls.<key>=<value> / ?ss.<key>=<value>        preset a localStorage / sessionStorage entry
//
// The choice is remembered for the tab (sessionStorage), so client-side
// navigation and reloads keep the persona without the params.

import { installClock } from '../fake/clock'
import { ACADEMY_ID } from '../fake/ids.js'

export type HarnessConfig = {
  as: string
  lang: 'en' | 'ms'
  theme: 'light' | 'dark'
  db: string[]
  now: string | null
  writes: 'noop' | 'apply'
  trace: boolean
}

const STORE = 'capture.harness'
const OWN = ['as', 'lang', 'theme', 'db', 'now', 'writes', 'trace']

function read(): HarnessConfig {
  const url = new URL(window.location.href)
  const q = url.searchParams
  let saved: Partial<HarnessConfig> = {}
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
  const config: HarnessConfig = {
    as: pick('as', (r) => r || 'director', 'director'),
    lang: pick('lang', (r) => (r === 'ms' ? 'ms' : 'en'), 'en'),
    theme: pick('theme', (r) => (r === 'dark' ? 'dark' : 'light'), 'light'),
    db: pick('db', (r) => r.split(',').map((s) => s.trim()).filter((s) => s && s !== 'base'), [] as string[]),
    now: pick('now', (r) => r || null, null as string | null),
    writes: pick('writes', (r) => (r === 'apply' ? 'apply' : 'noop'), 'noop'),
    trace: pick('trace', (r) => r === '1' || r === 'true', false),
  }
  sessionStorage.setItem(STORE, JSON.stringify(config))

  // Storage presets, e.g. ?ss.hawary.course.<id>.open=["…","…"]
  const presets: string[] = []
  q.forEach((value, key) => {
    if (key.startsWith('ls.')) localStorage.setItem(key.slice(3), value)
    else if (key.startsWith('ss.')) sessionStorage.setItem(key.slice(3), value)
    else return
    presets.push(key)
  })

  // The keys the app itself reads at first render.
  localStorage.setItem('hawary.lang', config.lang)
  localStorage.setItem('hawary.theme', config.theme)
  localStorage.setItem('hawary.activeAcademyId', ACADEMY_ID)
  localStorage.setItem('hawary.learnAcademyId', ACADEMY_ID)

  // Leave the router exactly what is its own.
  for (const key of [...OWN, ...presets]) q.delete(key)
  const search = q.toString()
  window.history.replaceState(window.history.state, '', url.pathname + (search ? `?${search}` : '') + url.hash)
  return config
}

export const config: HarnessConfig = read()
export const clock: string = installClock(config.now)

// --- the network is off -------------------------------------------------------
// The page's CSP already refuses anything that is not this server; this adds a
// message that says what tried, in words an agent can grep for.
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
