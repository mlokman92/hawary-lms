// Step 4 of the bank receipt check when it is run with Agent calls instead of
// the Workflow tool — see docs/receipt-check.md.
//
//   node merge-reads.mjs <work dir> --disagree   which files need a third reading
//   node merge-reads.mjs <work dir>              write readings.json
//
// Each reader agent writes {units: [...]} (the shape SCHEMA describes in
// read-receipts.workflow.js) to <work dir>/reads/A_*.json for the first pass,
// B_*.json for the second and C_*.json for the tie-breaks. The agreement rule
// is the workflow's, so readings.json comes out the same either way: a file
// counts as read when two readings give the same set of date|amount pairs.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const dir = path.resolve(process.argv[2])
const units = JSON.parse(readFileSync(path.join(dir, 'units.json'), 'utf8'))
const readsDir = path.join(dir, 'reads')
const pass = { A: {}, B: {}, C: {} }
for (const f of readdirSync(readsDir)) {
  if (!pass[f[0]] || !f.endsWith('.json')) continue
  let j
  try {
    j = JSON.parse(readFileSync(path.join(readsDir, f), 'utf8'))
  } catch {
    console.error('not valid JSON, skipped:', f)
    continue
  }
  for (const u of j.units ?? []) pass[f[0]][u.id] = u
}

function key(reading) {
  if (!reading || !reading.readable) return 'UNREADABLE'
  const txs = reading.transactions.filter((t) => t.status !== 'failed')
  if (txs.some((t) => t.uncertain || !t.date)) return null
  return txs.map((t) => `${t.date}|${Number(t.amount_rm).toFixed(2)}`).sort().join(';')
}

const ids = units.map((u) => u.id)
const missing = ids.filter((id) => !pass.A[id] || !pass.B[id])
const disagree = ids.filter((id) => {
  const ka = key(pass.A[id])
  const kb = key(pass.B[id])
  return ka === null || kb === null || ka !== kb || ka === 'UNREADABLE'
})
if (process.argv.includes('--disagree')) {
  // idx is what a tie-break reader is told to take from units.json.
  console.log(JSON.stringify({ units: ids.length, missing, disagree, idx: disagree.map((id) => ids.indexOf(id)) }))
  process.exit(0)
}

const out = ids.map((id) => {
  const readings = [pass.A[id], pass.B[id], pass.C[id]].filter(Boolean)
  const keys = readings.map(key)
  let agreed = null
  for (const k of keys) {
    if (k === null || k === 'UNREADABLE') continue
    if (keys.filter((x) => x === k).length >= 2) agreed = k
  }
  const chosen = agreed === null ? null : readings[keys.indexOf(agreed)]
  return {
    id,
    agreed: agreed !== null,
    readings: readings.length,
    keys,
    transactions: chosen ? chosen.transactions.filter((t) => t.status !== 'failed') : [],
    all: agreed !== null ? undefined : readings,
    notes: readings.map((r) => r.notes).filter(Boolean),
  }
})
writeFileSync(path.join(dir, 'readings.json'), JSON.stringify(out, null, 1))
console.log(`${out.filter((o) => o.agreed).length} of ${out.length} files have an agreed reading; ${missing.length} missing a first or second reading`)
