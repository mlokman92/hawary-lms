// Serves one exported Expo app (dist-student / dist-academy) as a film set.
//
// The export is the real app, built once by export.mjs with the guarded hook in
// apps/mobile/src/lib/supabase.ts switched on. This server adds the other half
// at request time, so data can change without re-exporting:
//
//   /                      index.html (and every route: SPA fallback) with four
//                          things put at the top of <head>:
//                            - a CSP that refuses every origin but this one
//                            - the web-target fixes (FIXES, below)
//                            - which app this is
//                            - /__capture/harness.js
//   /__capture/harness.js  harness.entry.ts + ../fake + ../fake/db/mobile.ts,
//                          bundled into one classic script. Rebuilt when any of
//                          those files changes, so an edit to the partition is
//                          live on the next page load.
//   /__capture/partition/<name>.js
//                          ../fake/db/<name>.ts as a script of its own, for a
//                          shot that asks for it with ?db=<name>. Each is built
//                          separately, so a partition another agent has left
//                          half-written fails alone (and loudly) instead of
//                          taking the harness with it.
//   /__harness             who is answering (JSON) — check it before trusting a frame.
//
//   import { startServer, probe } from './server.mjs'
//   const server = await startServer('student', 5341)  …  await server.close()

import http from 'node:http'
import net from 'node:net'
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { build } from 'vite'
import { CAPTURE_DIR, FORBIDDEN_PORTS, HARNESS_NAME, HERE, VARIANTS, VIDEO_DIR, distOf } from './paths.mjs'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
}

const CSP =
  "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:; frame-src 'self' about: data: blob:; connect-src 'self' data: blob:"

// What the web target gets wrong about the phone, put right for the camera. Kept
// to things a device does not do; nothing here restyles the product.
//
// 1. A tab's label has 68px (a 78px tab, 5px padding each side). "Appointments"
//    in Figtree SemiBold 10.5 measures a fraction over that in Chrome and is
//    ended with an ellipsis; the app's own comment in shell/nav.tsx says the
//    label fits a phone. The label gets the missing pixels back.
// 2. A sheet (react-native-web's Modal) takes the keyboard focus when it opens,
//    and Chrome draws its focus ring round the whole screen. A phone has no
//    focus ring.
//
// Two more things of the same kind need the page's own measurements and live
// in harness.entry.ts (`__captureDeviceFixes`): the shrink-to-fit of button
// labels and tile figures, and the navigation bar's trailing gutter.
const FIXES =
  '[role="tablist"] [role="tab"]{padding-left:3px!important;padding-right:3px!important}' +
  'div:focus,div:focus-visible,a:focus,a:focus-visible,[role="dialog"]{outline:none!important}'

// --- the bundles ----------------------------------------------------------------

const WATCHED_DIRS = [path.join(CAPTURE_DIR, 'fake'), path.join(CAPTURE_DIR, 'fake/db')]
const WATCHED_FILES = [path.join(HERE, 'harness.entry.ts'), path.join(VIDEO_DIR, 'cast.json')]

function signature() {
  let sig = 0
  const see = (file) => {
    try {
      const s = statSync(file)
      sig = Math.max(sig, s.mtimeMs) + s.size / 1e9
    } catch {
      // gone: the build will say so
    }
  }
  for (const dir of WATCHED_DIRS) {
    for (const name of readdirSync(dir)) if (/\.(ts|js|json)$/.test(name)) see(path.join(dir, name))
  }
  for (const f of WATCHED_FILES) see(f)
  return sig
}

const built = new Map()
const building = new Map()

/** Bundle one entry file into a classic script. Cached until a watched file changes. */
async function bundle(key, entry, globalName) {
  const sig = signature()
  const have = built.get(key)
  if (have && have.sig === sig) return have
  if (building.has(key)) return building.get(key)
  const job = (async () => {
    let out
    try {
      const result = await build({
        configFile: false,
        root: CAPTURE_DIR,
        logLevel: 'silent',
        envDir: false,
        publicDir: false,
        cacheDir: path.join(VIDEO_DIR, '.cache', 'capture-mobile-vite'),
        build: {
          write: false,
          minify: false,
          sourcemap: false,
          target: 'es2022',
          emptyOutDir: false,
          lib: { entry, formats: ['iife'], name: globalName },
        },
      })
      const first = Array.isArray(result) ? result[0] : result
      const chunk = first.output.find((o) => o.type === 'chunk')
      out = { sig, code: chunk.code, error: null }
    } catch (e) {
      const message = String(e?.message ?? e)
      console.error('[capture-mobile] ' + key + ' did not build:\n' + message)
      // Fail on the page too, loudly, instead of serving an app with no backend.
      out = { sig, error: message, code: 'console.error(' + JSON.stringify('[fake] ' + key + ' did not build: ' + message.slice(0, 1500)) + ');' }
    } finally {
      building.delete(key)
    }
    built.set(key, out)
    return out
  })()
  building.set(key, job)
  return job
}

const harnessCode = () => bundle('the capture harness', path.join(HERE, 'harness.entry.ts'), '__captureHarness')

/** fake/db/<name>.ts as its own script: it registers itself in window.__capturePartitions. */
async function partitionCode(name) {
  const file = path.join(CAPTURE_DIR, 'fake/db', name + '.ts')
  if (!/^[\w.-]+$/.test(name) || !existsSync(file)) {
    return { error: 'no such partition', code: 'console.error(' + JSON.stringify('[fake] partition "' + name + '": there is no fake/db/' + name + '.ts') + ');' }
  }
  const dir = path.join(VIDEO_DIR, '.cache', 'capture-mobile-entries')
  mkdirSync(dir, { recursive: true })
  const entry = path.join(dir, name + '.ts')
  const source =
    'import partition from ' + JSON.stringify(file.split(path.sep).join('/')) + '\n' +
    ';((globalThis as any).__capturePartitions ??= {})[' + JSON.stringify(name) + '] = partition\n'
  if (!existsSync(entry) || readFileSync(entry, 'utf8') !== source) writeFileSync(entry, source)
  return bundle('partition "' + name + '"', entry, '__capturePartition_' + name.replace(/\W/g, '_'))
}

// --- http -----------------------------------------------------------------------

function indexHtml(dist, variant) {
  const html = readFileSync(path.join(dist, 'index.html'), 'utf8')
  const inject =
    '\n    <meta http-equiv="Content-Security-Policy" content="' + CSP + '" />' +
    '\n    <style id="capture-fixes">' + FIXES + '</style>' +
    '\n    <script>window.__CAPTURE_VARIANT__=' + JSON.stringify(variant) + '</script>' +
    '\n    <script src="/__capture/harness.js"></script>'
  return html.replace(/<head>/i, (m) => m + inject)
}

/** Is this port answering, and is it us? */
export async function probe(port) {
  try {
    const res = await fetch('http://127.0.0.1:' + port + '/__harness', { signal: AbortSignal.timeout(4000) })
    const text = await res.text()
    try {
      const json = JSON.parse(text)
      if (json.harness === HARNESS_NAME) return { state: 'harness', info: json }
    } catch {
      // not JSON: somebody else's server (an SPA fallback answers 200 for anything)
    }
    return { state: 'foreign' }
  } catch {
    return (await portBusy(port)) ? { state: 'foreign' } : { state: 'free' }
  }
}

function portBusy(port) {
  return new Promise((resolve) => {
    const s = net.createConnection({ port, host: '127.0.0.1' })
    s.once('connect', () => { s.destroy(); resolve(true) })
    s.once('error', () => resolve(false))
    s.setTimeout(1500, () => { s.destroy(); resolve(false) })
  })
}

export async function startServer(variant, port, { quiet = false } = {}) {
  if (!VARIANTS.includes(variant)) throw new Error('unknown app "' + variant + '" — student or academy')
  if (!Number.isInteger(port) || port < 1024) throw new Error('bad port ' + port)
  if (FORBIDDEN_PORTS.includes(port)) throw new Error('port ' + port + ' belongs to something else on this machine — pick another')
  const dist = distOf(variant)
  if (!existsSync(path.join(dist, 'index.html'))) {
    throw new Error('no export at ' + dist + ' — run: node tools/capture/mobile/export.mjs ' + variant)
  }
  const before = await probe(port)
  if (before.state !== 'free') {
    throw new Error(
      before.state === 'harness'
        ? 'port ' + port + ' already runs a mobile capture harness (pid ' + before.info.pid + ', ' + before.info.variant + ') — reuse it or pick another port'
        : 'port ' + port + ' is in use by something that is not the mobile capture harness — pick another port',
    )
  }
  const started = new Date().toISOString()
  const root = path.resolve(dist)

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      const pathname = decodeURIComponent(url.pathname)
      const send = (status, type, body) => {
        res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' })
        res.end(body)
      }
      if (pathname === '/__harness') {
        const b = await harnessCode()
        return send(200, MIME['.json'], JSON.stringify({ harness: HARNESS_NAME, variant, port, pid: process.pid, started, dist: root.split(path.sep).join('/'), harnessBuilt: !b.error, error: b.error ?? undefined }))
      }
      if (pathname === '/__capture/harness.js') {
        const b = await harnessCode()
        return send(200, MIME['.js'], b.code)
      }
      const part = /^\/__capture\/partition\/([^/]+)\.js$/.exec(pathname)
      if (part) {
        const b = await partitionCode(part[1])
        return send(200, MIME['.js'], b.code)
      }
      const file = path.resolve(root, '.' + pathname)
      if (file.startsWith(root) && existsSync(file) && statSync(file).isFile() && path.basename(file) !== 'index.html') {
        res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream', 'cache-control': 'no-store' })
        return createReadStream(file).pipe(res)
      }
      // A missing asset is a 404; everything else is a route of the app.
      if (path.extname(pathname) && !/\.html?$/.test(pathname)) return send(404, 'text/plain', 'not found')
      return send(200, MIME['.html'], indexHtml(root, variant))
    } catch (e) {
      res.writeHead(500, { 'content-type': 'text/plain' })
      res.end(String(e?.stack ?? e))
    }
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', resolve)
  })
  const first = await harnessCode()
  if (!quiet) console.log('[capture-mobile] ' + variant + ' on http://127.0.0.1:' + port + ' (pid ' + process.pid + ')' + (first.error ? ' — THE HARNESS DID NOT BUILD' : ''))
  const after = await probe(port)
  const close = () => new Promise((resolve) => { server.closeAllConnections?.(); server.close(() => resolve()) })
  if (after.state !== 'harness') {
    await close()
    throw new Error('started on ' + port + ' but /__harness does not answer as the harness')
  }
  return { url: 'http://127.0.0.1:' + port, port, variant, close, harnessError: first.error }
}
