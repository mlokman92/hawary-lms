// Publishes an over-the-air update for one of the two apps.
//
//   pnpm --filter mobile update:student "Fix the upload button"
//   pnpm --filter mobile update:academy "Fix the upload button" preview
//
// Why a script and not a bare `eas update`:
//
//   - `APP_VARIANT` decides which app the config describes, and so which EAS
//     project the update is published to. Forgetting it publishes the Student
//     bundle, silently, because that is the default.
//   - From SDK 55 `eas update` requires `--environment` and then ignores local
//     .env files. The two EXPO_PUBLIC_SUPABASE_* values live in eas.json, on the
//     build profiles — a build reads them from there, an update does not. A
//     bundle exported without them throws on its first line (lib/supabase.ts),
//     and it would reach every phone on the channel. So this reads the very
//     same profile the build used and puts its `env` in the environment the
//     export runs in: one source for both.
//
// The channel defaults to `production`; `preview` reaches the internal builds.
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const [variant, message, channel = 'production'] = process.argv.slice(2)

if (!['student', 'academy'].includes(variant ?? '') || !message?.trim()) {
  console.error('Usage: node scripts/ota.mjs <student|academy> "<message>" [production|preview]')
  process.exit(1)
}
if (!['production', 'preview'].includes(channel)) {
  console.error(`Unknown channel "${channel}". Use production or preview.`)
  process.exit(1)
}

const eas = JSON.parse(readFileSync(resolve(root, 'eas.json'), 'utf8'))
const profile = eas.build?.[`${variant}-${channel}`]
if (!profile?.env?.EXPO_PUBLIC_SUPABASE_URL || !profile.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
  console.error(`eas.json has no Supabase values on the ${variant}-${channel} profile.`)
  process.exit(1)
}
if (profile.env.APP_VARIANT !== variant) {
  console.error(`eas.json: ${variant}-${channel} does not build the ${variant} app.`)
  process.exit(1)
}

const quoted = `"${message.trim().replace(/"/g, "'")}"`
const command = `eas update --channel ${channel} --environment ${channel} --message ${quoted}`
console.log(`> ${variant}: ${command}\n`)

const result = spawnSync(command, {
  cwd: root,
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, ...profile.env },
})
process.exit(result.status ?? 1)
