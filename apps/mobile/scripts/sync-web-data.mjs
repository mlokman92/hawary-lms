// Copies the web app's data layer into the mobile project.
//
// The mobile apps talk to the same tables and RPCs as the web app, through the
// same TanStack Query hooks. Those hooks live in `apps/web/src/features/*` and
// depend on nothing but `@/lib/{supabase,auth,i18n,errors,…}` — and this
// project provides modules at exactly those paths — so the files run here
// unchanged. Copying them (rather than writing a second set of queries) is what
// keeps "approve an enrolment" one statement instead of two that drift.
//
// THE WEB FILE IS THE SOURCE. Never edit a synced file here: change it in
// apps/web and run `pnpm --filter mobile sync:data`. `--check` exits non-zero
// when a copy is stale, for CI.
//
// Two mechanical rewrites are applied, both because there is no browser:
//   - `window.location.origin` -> `APP_ORIGIN` (the web app's address, which is
//     where the links in the emails these calls send have to point);
//   - the DOM `File` an upload takes -> `UploadFile` (a picked file's uri,
//     name, type and size — what React Native's FormData accepts).
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const webSrc = resolve(here, '../../web/src')
const mobileSrc = resolve(here, '../src')

const FILES = [
  'lib/errors.ts',
  'lib/phone.ts',
  'lib/questions.ts',
  'lib/blocks.ts',
  'lib/format.ts',
  'lib/support.ts',
  'lib/academy.tsx',
  'lib/studentAcademy.tsx',
  'features/learn/api.ts',
  'features/learn/dashboard.ts',
  'features/learn/billing.ts',
  'features/learn/status.ts',
  'features/notifications/api.ts',
  'features/notifications/render.ts',
  'features/invitations/api.ts',
  'features/invitations/autoInvite.ts',
  'features/profile/api.ts',
  'features/bank/api.ts',
  'features/incentives/api.ts',
  'features/incentives/learnApi.ts',
  'features/incentives/status.ts',
  'features/reports/api.ts',
  'features/appointments/api.ts',
  'features/appointments/calendar.ts',
  'features/payments/api.ts',
  'features/students/api.ts',
  'features/students/status.ts',
  'features/instructors/api.ts',
  'features/instructors/status.ts',
  'features/courses/api.ts',
  'features/modules/api.ts',
  'features/grading/api.ts',
  'features/enrollment/api.ts',
  'features/search/api.ts',
  'features/dashboard/api.ts',
  'features/assessments/api.ts',
  'features/assignments/api.ts',
  'features/settings/academy.ts',
  'features/settings/api.ts',
]

const header = (file) =>
  `// SYNCED from apps/web/src/${file} — do not edit here.\n` +
  `// Change the web file, then run \`pnpm --filter mobile sync:data\`.\n\n`

/** Insert an import after the last top-level import statement. */
function addImport(source, line) {
  if (source.includes(line)) return source
  const lines = source.split('\n')
  let last = -1
  let depth = 0
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    if (depth === 0 && /^import\b/.test(l)) {
      last = i
      if (!/\bfrom\s+['"][^'"]+['"]\s*;?\s*$/.test(l) && !/^import\s+['"]/.test(l)) depth = 1
    } else if (depth === 1) {
      last = i
      if (/\bfrom\s+['"][^'"]+['"]\s*;?\s*$/.test(l)) depth = 0
    }
  }
  lines.splice(last + 1, 0, line)
  return lines.join('\n')
}

function transform(file, source) {
  // A web-only lint rule; the directive would name a rule this project lacks.
  let out = source
    .split('\n')
    .filter((l) => !l.includes('eslint-disable-next-line react-refresh/'))
    .join('\n')
  if (out.includes('window.location.origin')) {
    out = out.replaceAll('window.location.origin', 'APP_ORIGIN')
    out = addImport(out, "import { APP_ORIGIN } from '@/lib/origin'")
  }
  if (/\bfile: File\b/.test(out)) {
    out = out.replace(/\bfile: File\b/g, 'file: UploadFile')
    // React Native's FormData takes the descriptor itself; its type says Blob.
    out = out.replaceAll(
      "body.append('file', file)",
      "body.append('file', file as unknown as Blob)",
    )
    out = addImport(out, "import type { UploadFile } from '@/lib/storage'")
  }
  if (/\bwindow\.|\bdocument\.|\blocalStorage\b|import\.meta/.test(out)) {
    throw new Error(
      `${file} uses a browser API this script does not know how to rewrite. ` +
        'Move that part behind @/lib in the web app, or teach transform() about it.',
    )
  }
  return header(file) + out
}

const check = process.argv.includes('--check')
let stale = 0

for (const file of FILES) {
  const from = resolve(webSrc, file)
  const to = resolve(mobileSrc, file)
  const next = transform(file, readFileSync(from, 'utf8'))
  const current = existsSync(to) ? readFileSync(to, 'utf8') : null
  if (current === next) continue
  stale += 1
  if (check) {
    console.error(`stale: src/${file}`)
    continue
  }
  mkdirSync(dirname(to), { recursive: true })
  writeFileSync(to, next)
  console.log(`synced src/${file}`)
}

if (check && stale > 0) {
  console.error(`\n${stale} file(s) out of date. Run: pnpm --filter mobile sync:data`)
  process.exit(1)
}
if (!check) console.log(stale === 0 ? 'Already up to date.' : `${stale} file(s) written.`)
