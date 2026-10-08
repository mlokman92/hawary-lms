// Starts the REAL web app (apps/web: its router, shells, pages, styles) on a
// Vite dev server whose only difference from `pnpm --filter web dev` is that
// `src/lib/supabase.ts` is swapped for the fake-backed client. Nothing under
// apps/web is touched, and its .env.local is never read.
//
//   import { startServer, probe } from './server.mjs'
//   const server = await startServer(5311)   …   await server.close()

import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
export const CAPTURE_DIR = path.resolve(here, '..')
export const VIDEO_DIR = path.resolve(CAPTURE_DIR, '../..')
export const REPO_DIR = path.resolve(VIDEO_DIR, '..')
export const WEB_ROOT = path.join(REPO_DIR, 'apps/web')
export const HARNESS_NAME = 'hawary-capture-web'
export const DUMMY_SUPABASE_URL = 'http://127.0.0.1:9'
export const DUMMY_SUPABASE_KEY = 'sb_publishable_capture_harness_not_a_key'

/** Ports that belong to other things on this machine. Never ours. */
export const FORBIDDEN_PORTS = [5173, 5199, 8081, 8191, 8192]

const slash = (p) => p.replace(/\\/g, '/')

/** The app's own Vite — the same instance its plugins were installed against. */
async function loadVite() {
  const require = createRequire(path.join(WEB_ROOT, 'package.json'))
  return import(pathToFileURL(require.resolve('vite')).href)
}

function harnessPlugin(port) {
  const target = slash(path.join(WEB_ROOT, 'src/lib/supabase.ts')).toLowerCase()
  const replacement = slash(path.join(here, 'supabase.harness.ts'))
  const boot = slash(path.join(here, 'boot.ts'))
  const same = (id) => slash(id.split('?')[0]).toLowerCase() === target
  const started = new Date().toISOString()
  return {
    name: HARNESS_NAME,
    enforce: 'pre',

    // Match on the RESOLVED file, so './supabase', '@/lib/supabase' and any
    // other spelling of the same module are all caught.
    async resolveId(source, importer, options) {
      if (!importer || source.startsWith('\0') || !/supabase/i.test(source)) return null
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true })
      if (resolved && same(resolved.id)) return replacement
      return null
    },
    // Belt and braces: if the real file is ever loaded by id, it still becomes ours.
    load(id) {
      if (same(id)) return `export * from ${JSON.stringify(replacement)}`
      return null
    },

    transformIndexHtml: {
      order: 'pre',
      handler() {
        return [
          // The browser itself refuses anything that is not this server: no
          // API, no image, no frame, no font from anywhere else. A stray call
          // shows up as a console error instead of reaching production.
          {
            tag: 'meta',
            attrs: {
              'http-equiv': 'Content-Security-Policy',
              content:
                "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:; frame-src 'self' about: data: blob:; connect-src 'self' ws://127.0.0.1:* ws://localhost:* data: blob:",
            },
            injectTo: 'head-prepend',
          },
          // Runs before the app's own entry: URL params, storage, the film's clock.
          { tag: 'script', attrs: { type: 'module', src: '/@fs/' + encodeURI(boot) }, injectTo: 'head' },
        ]
      },
    },

    configureServer(server) {
      server.middlewares.use('/__harness', (_req, res) => {
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ harness: HARNESS_NAME, port, pid: process.pid, started, root: slash(WEB_ROOT), plugins: process.env.CAPTURE_PLUGINS || null }))
      })
    },
  }
}

/** Is this port answering, and is it us? */
export async function probe(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/__harness`, { signal: AbortSignal.timeout(2500) })
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

/**
 * Extra Vite plugins, OPT-IN per process: CAPTURE_PLUGINS=<file>[;<file>] (paths relative to
 * video/). Unset — the default, and what every other shots file runs with — adds nothing.
 * Each file default-exports ({ webRoot, captureDir }) => plugin. Used by the teaching shots
 * for web/variants/plugin.mjs (the film's one "as it is about to be" feature, the LPKC AI check).
 */
async function optInPlugins() {
  const out = []
  for (const file of (process.env.CAPTURE_PLUGINS ?? '').split(';').map((s) => s.trim()).filter(Boolean)) {
    const mod = await import(pathToFileURL(path.resolve(VIDEO_DIR, file)).href)
    out.push(mod.default({ webRoot: WEB_ROOT, captureDir: CAPTURE_DIR }))
  }
  return out
}

export async function startServer(port, { quiet = false } = {}) {
  if (!Number.isInteger(port) || port < 1024) throw new Error(`bad port ${port}`)
  if (FORBIDDEN_PORTS.includes(port)) throw new Error(`port ${port} belongs to something else on this machine — pick another`)
  const before = await probe(port)
  if (before.state !== 'free') {
    throw new Error(
      before.state === 'harness'
        ? `port ${port} already runs a capture harness (pid ${before.info.pid}) — reuse it or pick another port`
        : `port ${port} is in use by something that is not the capture harness — pick another port`,
    )
  }

  const vite = await loadVite()
  // The app's own config: its plugins (react, tailwind), the '@' alias, the React dedupe.
  let loaded
  try {
    loaded = await vite.loadConfigFromFile({ command: 'serve', mode: 'development' }, path.join(WEB_ROOT, 'vite.config.ts'), WEB_ROOT, 'silent', undefined, 'runner')
  } catch {
    loaded = await vite.loadConfigFromFile({ command: 'serve', mode: 'development' }, path.join(WEB_ROOT, 'vite.config.ts'), WEB_ROOT, 'silent')
  }
  if (!loaded) throw new Error('could not load apps/web/vite.config.ts')

  // Everything the app imports, bundled up front: a dependency discovered in
  // the middle of a shot makes Vite reload the page under the camera.
  const pkg = JSON.parse(readFileSync(path.join(WEB_ROOT, 'package.json'), 'utf8'))
  const skip = new Set(['@hawary/shared', '@fontsource-variable/figtree', 'shadcn', '@tiptap/pm'])
  const deps = Object.keys(pkg.dependencies).filter((d) => !skip.has(d))

  const config = vite.mergeConfig(loaded.config, {
    configFile: false,
    root: WEB_ROOT,
    // One cache per port, under video/: never apps/web/node_modules/.vite, and
    // two harnesses started side by side do not fight over one optimizer.
    cacheDir: path.join(VIDEO_DIR, '.cache', `capture-web-${port}`),
    // No .env files at all: apps/web/.env.local holds the real project URL and
    // key, and this server must never see them. The two the app declares are
    // defined as dummies instead (port 9 is the discard port: nothing listens).
    envDir: false,
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(DUMMY_SUPABASE_URL),
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(DUMMY_SUPABASE_KEY),
    },
    clearScreen: false,
    logLevel: quiet ? 'warn' : 'info',
    server: {
      host: '127.0.0.1',
      port,
      strictPort: true,
      open: false,
      // A partition saved by another agent must not reload a page mid-shot.
      // Files are still re-read on the next navigation.
      hmr: false,
      fs: { allow: [REPO_DIR] },
    },
    optimizeDeps: {
      include: [...deps, 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
    },
    plugins: [harnessPlugin(port), ...(await optInPlugins())],
  })

  const server = await vite.createServer(config)
  await server.listen()
  const url = `http://127.0.0.1:${port}`
  const after = await probe(port)
  if (after.state !== 'harness') {
    await server.close()
    throw new Error(`started on ${port} but /__harness does not answer as the harness`)
  }
  return { url, port, close: () => server.close(), vite: server }
}
