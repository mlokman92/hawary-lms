// Export one of the two Expo apps for the web target, as a film-set build.
//
//   node tools/capture/mobile/export.mjs student|academy [--tmp DIR]
//
// - EXPO_PUBLIC_HARNESS=1 turns on the guarded hook in apps/mobile/src/lib/supabase.ts
//   (harness.patch must be applied): the client is built on the discard port and
//   the page's harness script (served by serve.mjs) replaces everything that talks.
// - The Supabase URL and key are overridden with dummies, so apps/mobile/.env.local
//   never reaches the bundle. The bundle is searched for the real project ref afterwards.
// - TEMP/TMP point at a folder of our own: `--clear` then wipes OUR Metro cache,
//   not the one the owner's running dev servers use.
//
// The export only has to be redone when product code or the patch changes. The
// fake backend and its data are NOT in this bundle (see serve.mjs).

import { spawn } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DUMMY_SUPABASE_KEY, DUMMY_SUPABASE_URL, MOBILE_ROOT, REAL_PROJECT_REF, VARIANTS, distOf } from './paths.mjs'

const args = process.argv.slice(2)
const variant = args.find((a) => VARIANTS.includes(a))
if (!variant) {
  console.error('usage: node export.mjs student|academy [--tmp DIR]')
  process.exit(2)
}
const tmpIx = args.indexOf('--tmp')
const tmp = path.resolve(tmpIx >= 0 ? args[tmpIx + 1] : path.join(os.tmpdir(), 'hawary-capture-mobile', variant))
mkdirSync(tmp, { recursive: true })

const dist = distOf(variant)
rmSync(dist, { recursive: true, force: true })

const env = {
  ...process.env,
  APP_VARIANT: variant,
  EXPO_PUBLIC_HARNESS: '1',
  EXPO_PUBLIC_SUPABASE_URL: DUMMY_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: DUMMY_SUPABASE_KEY,
  TEMP: tmp,
  TMP: tmp,
  TMPDIR: tmp,
  CI: '1',
  EXPO_NO_TELEMETRY: '1',
  EXPO_OFFLINE: '1',
  NODE_ENV: 'production',
}

console.log(`exporting ${variant} -> ${dist}\n  metro cache under ${tmp}`)
const started = Date.now()
// Relative to the project, with forward slashes: the repo path has a space in
// it and this goes through a shell (pnpm is a .cmd on Windows).
const outArg = path.relative(MOBILE_ROOT, dist).replace(/\\/g, '/')
const child = spawn('pnpm', ['exec', 'expo', 'export', '--platform', 'web', '--clear', '--output-dir', outArg], {
  cwd: MOBILE_ROOT,
  env,
  stdio: 'inherit',
  shell: true,
})

child.on('exit', (code) => {
  if (code !== 0) {
    console.error(`expo export failed (${code})`)
    process.exit(code ?? 1)
  }
  // The real project must not be in what we serve.
  let leaked = 0
  let files = 0
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = path.join(dir, name)
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.(js|html|json|map)$/.test(name)) {
        files++
        if (readFileSync(p, 'utf8').includes(REAL_PROJECT_REF)) {
          leaked++
          console.error(`  LEAK: ${p} mentions the real project`)
        }
      }
    }
  }
  walk(dist)
  if (leaked) {
    console.error('The export contains the real Supabase project ref. Do not serve it.')
    process.exit(1)
  }
  console.log(`ok: ${variant} exported in ${Math.round((Date.now() - started) / 1000)} s; ${files} text files checked, the real project is not in them`)
})
