// Step 3 of the bank receipt check — see docs/receipt-check.md.
//
//   node units.mjs <work dir>
//
// One file is often attached to several payments (one transfer, several
// students). Identical files are grouped by content hash into a "unit", so each
// is read once, and only units with at least one payment nobody has ruled on
// are listed. Writes units.json for the readers — it carries a path and
// nothing about what was recorded — and adds `unit` to each worklist row.
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const dir = path.resolve(process.argv[2])
const rows = JSON.parse(readFileSync(path.join(dir, 'worklist.json'), 'utf8'))
const bySha = new Map()
for (const r of rows) {
  r.sha = createHash('sha256').update(readFileSync(r.local)).digest('hex')
  if (!bySha.has(r.sha)) bySha.set(r.sha, [])
  bySha.get(r.sha).push(r)
}

const units = []
let n = 0
for (const list of bySha.values()) {
  if (!list.some((r) => r.state === 'uploaded')) continue
  n++
  const id = 'u' + String(n).padStart(2, '0')
  for (const r of list) r.unit = id
  units.push({ id, path: list[0].local, kind: list[0].mime_type === 'application/pdf' ? 'pdf' : 'image' })
}
writeFileSync(path.join(dir, 'worklist.json'), JSON.stringify(rows, null, 1))
writeFileSync(path.join(dir, 'units.json'), JSON.stringify(units))

const states = {}
for (const r of rows) states[r.state] = (states[r.state] ?? 0) + 1
console.log(JSON.stringify({ payments: rows.length, states, units: units.length }))
