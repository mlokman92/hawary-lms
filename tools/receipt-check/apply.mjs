// Step 7 of the bank receipt check — see docs/receipt-check.md.
//
//   node apply.mjs <work dir>
//
// Turns decisions.json (plus overrides.json, if a decision was changed by
// hand after looking at the file) into <work dir>/apply.sql, and runs nothing.
//
// Every statement is guarded by "nobody has ruled on it yet", so a receipt a
// Director checked or flagged while the check was running is left as it is.
// The name written is the checker's own — never a Director's.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const dir = path.resolve(process.argv[2])
const WHO = 'Automated check (Claude)'
const decisions = JSON.parse(readFileSync(path.join(dir, 'decisions.json'), 'utf8'))
const overridesFile = path.join(dir, 'overrides.json')
// { "<payment id>": { "decision": "human", "why": "…" } }
const overrides = existsSync(overridesFile) ? JSON.parse(readFileSync(overridesFile, 'utf8')) : {}
for (const d of decisions) if (overrides[d.payment_id]) Object.assign(d, overrides[d.payment_id])
writeFileSync(path.join(dir, 'final.json'), JSON.stringify(decisions, null, 1))

const ids = (list) => list.map((d) => `'${d.payment_id}'`).join(', ')
const pass = decisions.filter((d) => d.decision === 'pass')
const byReason = {}
for (const f of decisions.filter((d) => d.decision === 'flag'))
  (byReason[[...f.reasons].sort().join(',')] ??= []).push(f)

const guard = `confirmed_at is null and cardinality(flag_reasons) = 0`
const parts = []
if (pass.length)
  parts.push(['checked', `update public.payment_receipts
     set confirmed_at = now(), confirmed_by = null, confirmed_by_name = '${WHO}'
   where payment_id in (${ids(pass)}) and ${guard}
  returning payment_id`])
for (const [reasons, list] of Object.entries(byReason))
  parts.push([`flagged_${reasons.replace(',', '_and_')}`, `update public.payment_receipts
     set flag_reasons = array[${reasons.split(',').map((r) => `'${r}'`).join(', ')}]::text[],
         flagged_at = now(), flagged_by = null, flagged_by_name = '${WHO}'
   where payment_id in (${ids(list)}) and ${guard}
  returning payment_id`])

const sql = parts.length === 0
  ? 'select 0 as nothing_to_apply;\n'
  : `with ${parts.map(([name, body]) => `${name} as (\n  ${body}\n)`).join(', ')}
select ${parts.map(([name]) => `(select count(*) from ${name}) as ${name}`).join(',\n       ')};
`
writeFileSync(path.join(dir, 'apply.sql'), sql)
console.log(JSON.stringify({
  pass: pass.length,
  flag: Object.fromEntries(Object.entries(byReason).map(([k, v]) => [k, v.length])),
  human: decisions.filter((d) => d.decision === 'human').length,
}))
