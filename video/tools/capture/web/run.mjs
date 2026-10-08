// Shoot a shots file against the web harness.
//
//   node tools/capture/web/run.mjs <shots-file> [ids…] --port N [--serve] [--out DIR] [--trace]
//
//   <shots-file>  an .mjs whose default export is an array of shots (see ../shoot.mjs).
//                 It may also export `defaults` — URL params added to every shot that
//                 does not set them itself, e.g. { as: 'director', db: 'teaching' } —
//                 and `outDir`.
//   ids…          shoot only these shot ids.
//   --port N      the harness to use. It must answer /__harness as the harness.
//   --serve       bring your own: start a harness for this run and stop it after. If the
//                 port is taken (by anyone), the next free one above it is used.
//   --out DIR     where the PNG + JSON go (default: the file's `outDir`, else video/public/shots/web).
//   --trace       print every backend call each page made (which tables, RPCs, how many rows).
//
// A shot may carry the harness params as fields instead of spelling them into
// the URL: { id, url: '/lpkc', as: 'trainer', db: 'teaching', now: '2026-10-07T12:06' }.
//
// The browser is started with DNS switched off for everything but this
// machine, and its clock zone pinned to Asia/Kuala_Lumpur.

import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { launch, shoot } from '../shoot.mjs'
import { FORBIDDEN_PORTS, VIDEO_DIR, probe, startServer } from './server.mjs'

const PARAMS = ['as', 'lang', 'theme', 'db', 'now', 'writes', 'trace']

function parseArgs(argv) {
  const out = { file: null, ids: [], port: NaN, serve: false, out: null, trace: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--port') out.port = Number(argv[++i])
    else if (a === '--out') out.out = argv[++i]
    else if (a === '--serve') out.serve = true
    else if (a === '--trace') out.trace = true
    else if (!out.file) out.file = a
    else out.ids.push(a)
  }
  return out
}

/** Fold a shot's harness fields and the file's defaults into its URL. */
export function withParams(shot, defaults = {}, trace = false) {
  const u = new URL(shot.url, 'http://harness.invalid')
  for (const key of PARAMS) {
    if (u.searchParams.has(key)) continue
    const value = shot[key] ?? defaults[key]
    if (value !== undefined && value !== null && value !== '') u.searchParams.set(key, Array.isArray(value) ? value.join(',') : String(value))
  }
  if (trace) u.searchParams.set('trace', '1')
  return { ...shot, url: u.pathname + u.search + u.hash }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.file || !Number.isInteger(args.port)) {
    console.error('usage: node run.mjs <shots-file> [ids…] --port N [--serve] [--out DIR] [--trace]')
    process.exit(2)
  }
  if (FORBIDDEN_PORTS.includes(args.port)) {
    console.error(`port ${args.port} belongs to something else on this machine — pick another`)
    process.exit(2)
  }

  const mod = await import(pathToFileURL(path.resolve(args.file)).href)
  const all = mod.default ?? mod.shots
  if (!Array.isArray(all)) throw new Error(`${args.file}: the default export must be an array of shots`)
  const defaults = mod.defaults ?? {}
  const outDir = path.resolve(args.out ?? mod.outDir ?? path.join(VIDEO_DIR, 'public/shots/web'))
  const wanted = args.ids.length ? all.filter((s) => args.ids.includes(s.id)) : all
  const missing = args.ids.filter((id) => !all.some((s) => s.id === id))
  if (missing.length) throw new Error(`no such shot id: ${missing.join(', ')}`)

  // Be sure of who is answering before a single frame is trusted.
  let own = null
  let port = args.port
  if (args.serve) {
    // --serve always brings its OWN server, so nobody else stopping theirs can
    // pull it away mid-run. If the port asked for is taken — by another
    // agent's harness or by anything else — walk up to the next free one.
    for (let tries = 0; tries < 40 && !own; tries++, port++) {
      if (FORBIDDEN_PORTS.includes(port)) continue
      if ((await probe(port)).state !== 'free') continue
      try {
        own = await startServer(port, { quiet: true })
      } catch {
        // lost a race for it; try the next
      }
      if (own) break
    }
    if (!own) {
      console.error(`no free port found from ${args.port} upwards. Nothing was shot.`)
      process.exit(1)
    }
    port = own.port
    console.log(`started a harness on ${own.url} for this run${port !== args.port ? ` (port ${args.port} was taken)` : ''}`)
  } else {
    const state = await probe(port)
    if (state.state === 'foreign') {
      console.error(`port ${port} is answered by something that is NOT the capture harness. Nothing was shot.`)
      process.exit(1)
    }
    if (state.state === 'free') {
      console.error(`nothing is listening on ${port}. Start it (node tools/capture/web/serve.mjs --port ${port}) or add --serve.`)
      process.exit(1)
    }
  }
  const base = `http://127.0.0.1:${port}`

  const browser = await launch(['--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1 , EXCLUDE localhost'])
  let failed = 0
  try {
    for (const raw of wanted) {
      const shot = withParams(raw, defaults, args.trace)
      const page = await browser.newPage()
      const trace = []
      if (args.trace) page.on('console', (m) => { if (m.text().startsWith('[fake]')) trace.push(m.text()) })
      try {
        await page.emulateTimezone('Asia/Kuala_Lumpur')
        const r = await shoot(page, shot, { base, outDir })
        const errors = [...new Set(r.errors)]
        console.log(`ok   ${shot.id}  ->  ${path.relative(process.cwd(), r.file)}${errors.length ? `   (${errors.length} console error${errors.length > 1 ? 's' : ''})` : ''}`)
        for (const e of errors.slice(0, 15)) console.log(`       ! ${e.replace(/\s+/g, ' ').slice(0, 400)}`)
        if (errors.length) failed++
      } catch (e) {
        failed++
        console.log(`FAIL ${shot.id}  ${e?.message ?? e}`)
      } finally {
        for (const t of trace) console.log(`       ${t.slice(0, 300)}`)
        await page.close()
      }
    }
  } finally {
    await browser.close()
    if (own) await own.close()
  }
  console.log(`\n${wanted.length} shot(s) -> ${outDir}${failed ? `   ${failed} with errors: look at the PNG and fix the data` : ''}`)
  process.exit(failed ? 1 : 0)
}

// Only when run directly; shots files may import `withParams`.
if (process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) {
  main().catch((e) => {
    console.error(e?.stack ?? String(e))
    process.exit(1)
  })
}
