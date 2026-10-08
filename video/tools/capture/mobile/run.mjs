// Shoot the Student or the Academy app.
//
//   node tools/capture/mobile/run.mjs student|academy [ids…] [--port N] [--serve] [--trace] [--out DIR] [--shots FILE]
//
//   ids…      shoot only these shot ids (a "-full" twin is shot with its parent).
//   --port N  the harness to use (default 5341 student, 5342 academy). It must answer
//             /__harness as the mobile harness FOR THAT APP, or nothing is shot.
//   --serve   start a server for this run and stop it afterwards. If the port is
//             taken by anyone, the next free one above it is used.
//   --trace   print every backend call each screen made.
//   --out     where PNG + JSON go (default video/public/shots/<app>).
//   --shots   another shots file (default ./shots.mjs; it exports `student` and `academy`).
//
// A shot is a ../shoot.mjs shot — { id, url, steps, tag, settle, … } — plus:
//
//   as, lang, theme, db, now, writes      harness params (see harness.entry.ts), folded into the URL
//   viewport                              defaults to the film's phone: 390 x 763 @3x
//   full: true                            also write <id>-full: the same screen in a viewport tall
//                                         enough to hold everything it scrolls (tab bar / footer at the bottom)
//   dialog: 'dismiss'                     answer the app's confirm() with Cancel (default: accept)
//   mark: { name: spec }                  name an element the film will go to. spec is
//                                           'css selector'
//                                           { sel, nth? }
//                                           { text, exact?, nth?, in?: 'css' }   the deepest element with that text, then
//                                             button: true    … its button / tab / chip
//                                             card: true      … its card (nearest raised or rounded surface)
//                                             row: true       … its list row
//                                             up: n           … n parents further up
//                                         Marked rects land in the JSON under `tags`, next to `tag`.
//                                         A mark that matches nothing is reported as an error.
//
// The browser runs with DNS off for everything but this machine and its clock
// zone pinned to Asia/Kuala_Lumpur; the page carries a CSP that refuses any
// other origin; the app's client is built on http://127.0.0.1:9.

import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { launch, shoot } from '../shoot.mjs'
import { DEFAULT_PORT, FORBIDDEN_PORTS, HERE, PHONE, VARIANTS, outOf } from './paths.mjs'
import { probe, startServer } from './server.mjs'

const PARAMS = ['as', 'lang', 'theme', 'db', 'now', 'writes', 'trace']

function parseArgs(argv) {
  const out = { variant: null, ids: [], port: NaN, serve: false, out: null, trace: false, shots: path.join(HERE, 'shots.mjs') }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--port') out.port = Number(argv[++i])
    else if (a === '--out') out.out = argv[++i]
    else if (a === '--shots') out.shots = argv[++i]
    else if (a === '--serve') out.serve = true
    else if (a === '--trace') out.trace = true
    else if (!out.variant && VARIANTS.includes(a)) out.variant = a
    else out.ids.push(a)
  }
  return out
}

/** Fold a shot's harness fields into its URL. */
function withParams(shot, trace) {
  const u = new URL(shot.url, 'http://harness.invalid')
  for (const key of PARAMS) {
    if (u.searchParams.has(key)) continue
    const value = shot[key]
    if (value !== undefined && value !== null && value !== '') u.searchParams.set(key, String(value))
  }
  if (trace) u.searchParams.set('trace', '1')
  return u.pathname + u.search + u.hash
}

// Runs in the page: resolve when the fake is loaded, something is drawn, and no
// spinner has been on screen for a moment. performance.now() is not shifted by
// the film's clock.
const IDLE = `(async () => {
  const t0 = performance.now()
  let quiet = 0
  while (performance.now() - t0 < 15000) {
    const busy =
      document.documentElement.dataset.fake !== 'ready' ||
      !!document.querySelector('[role="progressbar"]') ||
      (document.body.innerText || '').trim().length === 0
    quiet = busy ? 0 : quiet + 1
    if (quiet >= 5) return true
    await new Promise((r) => setTimeout(r, 80))
  }
  return false
})()`

// Runs in the page: put data-cap-<name>="1" on what each mark names (one attribute per name, so two marks may name the same element).
//
// Only what is DRAWN counts. The tab screens stay mounted (display: none) under
// a pushed screen, and `innerText` of an element that is not rendered is its
// whole textContent — so a text search that did not check would happily name
// a row on a screen nobody is looking at.
function applyMarks(marks) {
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim()
  const transparent = (c) => !c || c === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(c)
  const drawn = (e) => {
    const r = e.getBoundingClientRect()
    return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'
  }
  for (const [name, spec] of Object.entries(marks)) {
    let el = null
    if (typeof spec === 'string') el = [...document.querySelectorAll(spec)].filter(drawn)[0] || null
    else if (spec.sel) el = [...document.querySelectorAll(spec.sel)].filter(drawn)[spec.nth || 0] || null
    else {
      const root = spec.in ? [...document.querySelectorAll(spec.in)].filter(drawn)[0] : document.body
      if (root) {
        const all = [...root.querySelectorAll('*')].filter((e) => {
          if (!drawn(e)) return false
          const t = norm(e.innerText)
          return spec.exact ? t === spec.text : t.includes(spec.text)
        })
        el = all.filter((e) => !all.some((o) => o !== e && e.contains(o)))[spec.nth || 0] || null
      }
    }
    if (el && spec && typeof spec === 'object') {
      if (spec.button) el = el.closest('[role="button"],[role="tab"],[role="radio"],[role="checkbox"],[role="link"],button,a') || el
      if (spec.wide) {
        while (el.parentElement && el.getBoundingClientRect().width < window.innerWidth - 1) el = el.parentElement
      }
      if (spec.card) {
        let p = el
        while (p && p !== document.body) {
          const cs = getComputedStyle(p)
          const raised = cs.boxShadow && cs.boxShadow !== 'none'
          const rounded = parseFloat(cs.borderTopLeftRadius) >= 14 && !transparent(cs.backgroundColor) && p.getBoundingClientRect().width > 120
          if (raised || rounded) break
          p = p.parentElement
        }
        if (p && p !== document.body) el = p
      }
      if (spec.row) {
        let p = el
        while (p && p !== document.body) {
          const cs = getComputedStyle(p)
          if (cs.flexDirection === 'row' && parseFloat(cs.minHeight) >= 56 && p.getBoundingClientRect().width > 200) break
          p = p.parentElement
        }
        if (p && p !== document.body) el = p
      }
      for (let i = 0; i < (spec.up || 0) && el.parentElement; i++) el = el.parentElement
    }
    if (el) el.setAttribute("data-cap-" + name.toLowerCase(), "1")
  }
}

// How much taller the viewport must be to hold everything the screen scrolls.
async function overflowOf(page) {
  const measure = () => {
    let extra = 0
    for (const el of document.querySelectorAll('*')) {
      const cs = getComputedStyle(el)
      if (!/(auto|scroll)/.test(cs.overflowY)) continue
      const r = el.getBoundingClientRect()
      if (r.width < 200 || r.height < 120) continue
      extra = Math.max(extra, el.scrollHeight - el.clientHeight)
    }
    const doc = document.scrollingElement
    if (doc) extra = Math.max(extra, doc.scrollHeight - window.innerHeight)
    return extra
  }
  let extra = await page.evaluate(measure)
  for (const frame of page.frames()) {
    if (frame === page.mainFrame()) continue
    try {
      extra = Math.max(extra, await frame.evaluate(measure))
    } catch {
      // a frame that went away
    }
  }
  return Math.ceil(extra)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.variant) {
    console.error('usage: node run.mjs student|academy [ids…] [--port N] [--serve] [--trace] [--out DIR] [--shots FILE]')
    process.exit(2)
  }
  const variant = args.variant
  let port = Number.isInteger(args.port) ? args.port : DEFAULT_PORT[variant]
  if (FORBIDDEN_PORTS.includes(port)) {
    console.error(`port ${port} belongs to something else on this machine — pick another`)
    process.exit(2)
  }

  const mod = await import(pathToFileURL(path.resolve(args.shots)).href)
  const all = mod[variant]
  if (!Array.isArray(all)) throw new Error(`${args.shots}: no "${variant}" array exported`)
  const outDir = path.resolve(args.out ?? outOf(variant))
  const wantIds = args.ids.map((id) => id.replace(/-full$/, ''))
  const missing = wantIds.filter((id) => !all.some((s) => s.id === id))
  if (missing.length) throw new Error(`no such shot id: ${missing.join(', ')}`)
  const wanted = wantIds.length ? all.filter((s) => wantIds.includes(s.id)) : all

  let own = null
  if (args.serve) {
    for (let tries = 0; tries < 40 && !own; tries++, port++) {
      if (FORBIDDEN_PORTS.includes(port)) continue
      if ((await probe(port)).state !== 'free') continue
      try {
        own = await startServer(variant, port, { quiet: true })
      } catch {
        // lost a race for it; try the next
      }
      if (own) break
    }
    if (!own) {
      console.error('no free port found. Nothing was shot.')
      process.exit(1)
    }
    port = own.port
    if (own.harnessError) {
      await own.close()
      console.error('the harness did not build (see above). Nothing was shot.')
      process.exit(1)
    }
    console.log(`started a ${variant} harness on ${own.url} for this run`)
  } else {
    const state = await probe(port)
    if (state.state === 'foreign') {
      console.error(`port ${port} is answered by something that is NOT the mobile capture harness. Nothing was shot.`)
      process.exit(1)
    }
    if (state.state === 'free') {
      console.error(`nothing is listening on ${port}. Start it (node tools/capture/mobile/serve.mjs ${variant} --port ${port}) or add --serve.`)
      process.exit(1)
    }
    if (state.info.variant !== variant) {
      console.error(`port ${port} serves the ${state.info.variant} app, not ${variant}. Nothing was shot.`)
      process.exit(1)
    }
    if (state.info.error) {
      console.error(`the harness on ${port} did not build:\n${state.info.error}`)
      process.exit(1)
    }
  }
  const base = `http://127.0.0.1:${port}`

  const browser = await launch(['--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1 , EXCLUDE localhost'])
  let failed = 0
  let count = 0

  /** One frame. Returns how far the screen scrolls beyond this viewport. */
  const take = async (raw, id, viewport) => {
    const page = await browser.newPage()
    const trace = []
    page.on('console', (m) => {
      const text = m.text()
      if (args.trace && text.startsWith('[fake]')) trace.push(text)
    })
    // window.confirm / alert: what the app's own confirm() and notify() are on the web target.
    page.on('dialog', (d) => void (raw.dialog === 'dismiss' ? d.dismiss() : d.accept()).catch(() => {}))
    let extra = 0
    try {
      await page.emulateTimezone('Asia/Kuala_Lumpur')
      const marks = raw.mark ?? {}
      const tag = { ...(raw.tag ?? {}) }
      for (const name of Object.keys(marks)) tag[name] = `[data-cap-${name.toLowerCase()}="1"]`
      const steps = [
        { eval: IDLE },
        ...(raw.steps ?? []),
        { eval: IDLE },
        // What a phone does and the web target does not (see harness.entry.ts).
        { eval: 'window.__captureDeviceFixes && window.__captureDeviceFixes()' },
        { eval: `(${applyMarks.toString()})(${JSON.stringify(marks)})` },
      ]
      const shot = { ...raw, id, url: withParams(raw, args.trace), viewport, steps, tag }
      const r = await shoot(page, shot, { base, outDir })
      const who = await page.evaluate(() => ({ variant: window.__CAPTURE__?.variant, as: document.documentElement.dataset.fakeAs, db: document.documentElement.dataset.fakeDb }))
      const errors = [...new Set(r.errors)]
      if (who.variant !== variant) errors.push(`this page is not the ${variant} harness`)
      console.log(`ok   ${id}  (${who.as}; ${who.db})  ->  ${path.relative(process.cwd(), r.file)}${errors.length ? `   (${errors.length} console error${errors.length > 1 ? 's' : ''})` : ''}`)
      for (const e of errors.slice(0, 15)) console.log(`       ! ${e.replace(/\s+/g, ' ').slice(0, 500)}`)
      if (errors.length) failed++
      extra = await overflowOf(page)
    } catch (e) {
      failed++
      console.log(`FAIL ${id}  ${e?.message ?? e}`)
    } finally {
      for (const t of trace) console.log(`       ${t.slice(0, 320)}`)
      await page.close()
    }
    count++
    return extra
  }

  try {
    for (const raw of wanted) {
      const vp = { ...PHONE, ...(raw.viewport ?? {}) }
      const extra = await take(raw, raw.id, vp)
      if (raw.full) {
        if (extra > 6) {
          // Chrome will not capture more than 16384 device px in one go.
          const h = Math.min(vp.h + extra, Math.floor(16000 / vp.dpr))
          await take(raw, `${raw.id}-full`, { ...vp, h })
        } else {
          console.log(`     ${raw.id}-full skipped: the screen does not scroll`)
        }
      }
    }
  } finally {
    await browser.close()
    if (own) await own.close()
  }
  console.log(`\n${count} frame(s) -> ${outDir}${failed ? `   ${failed} with errors: look at the PNG and fix the data` : ''}`)
  process.exit(failed ? 1 : 0)
}

if (process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) {
  main().catch((e) => {
    console.error(e?.stack ?? String(e))
    process.exit(1)
  })
}
