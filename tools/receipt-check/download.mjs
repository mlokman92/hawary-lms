// Step 2 of the bank receipt check — see docs/receipt-check.md.
//
//   node download.mjs <work dir>
//
// Reads <work dir>/worklist_raw.json (the output of worklist.sql), downloads
// every receipt to <work dir>/files/<payment_id>/receipt.<ext> and writes
// <work dir>/worklist.json. The work dir must be OUTSIDE the repository: a
// receipt shows a payer's name, bank and account number.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const dir = path.resolve(process.argv[2])
const PROJECT = 'vpklztxqkvqmmzsxfqgp'
const raw = JSON.parse(readFileSync(path.join(dir, 'worklist_raw.json'), 'utf8'))
const rows = raw.rows[0].rows
const EXT = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

function cp(src, dst) {
  return new Promise((resolve) => {
    const p = spawn(
      'npx',
      ['-y', 'supabase@latest', 'storage', 'cp', '--linked', '--project-ref',
        PROJECT, '--experimental', src, dst],
      // cwd is the work dir so the destination can be relative: the CLI reads
      // an absolute Windows path ("C:/…") as a URL scheme and refuses it.
      { shell: true, cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] },
    )
    let out = ''
    p.stdout.on('data', (d) => (out += d))
    p.stderr.on('data', (d) => (out += d))
    p.on('close', (code) => resolve({ code, out }))
  })
}

const jobs = rows.map((r) => {
  const d = path.join(dir, 'files', r.payment_id)
  mkdirSync(d, { recursive: true })
  return { r, local: path.join(d, `receipt.${EXT[r.mime_type] ?? 'bin'}`) }
})

// `storage cp -r` cannot download a folder, so it is one call per file, six at
// a time. A file already here at the right size is not fetched again.
let next = 0
let failed = 0
async function worker() {
  while (next < jobs.length) {
    const { r, local } = jobs[next++]
    if (existsSync(local) && statSync(local).size === Number(r.size_bytes)) continue
    const rel = './' + path.relative(dir, local).split(path.sep).join('/')
    const res = await cp(`"ss:///payment-receipts/${r.file_path}"`, `"${rel}"`)
    const ok = existsSync(local) && statSync(local).size === Number(r.size_bytes)
    if (!ok) {
      failed++
      console.log('FAILED', r.payment_id, res.code, res.out.slice(-200))
    }
  }
}
await Promise.all(Array.from({ length: 6 }, worker))

writeFileSync(
  path.join(dir, 'worklist.json'),
  JSON.stringify(jobs.map(({ r, local }) => ({ ...r, local: local.split(path.sep).join('/') })), null, 1),
)
console.log(`rows ${rows.length}, failed ${failed}`)
