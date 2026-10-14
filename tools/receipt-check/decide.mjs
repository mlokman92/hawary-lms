// Step 5 of the bank receipt check — see docs/receipt-check.md for the rules
// and who decided each of them.
//
//   node decide.mjs <work dir>
//
// Reads worklist.json, readings.json (the reading workflow's result) and
// ledger.json; writes decisions.json. Decides nothing in the database.
//
//   pass   — on the recorded date the receipt shows a transfer of
//            (a) exactly the recorded amount, or
//            (b) the combined amount of the payments this same file is attached to, or
//            (c) a lump sum equal to everything recorded that day for students
//                of the same organisation (one employer paying for several)
//   flag   — wrong_date: no transfer on the recorded date
//            wrong_amount: a transfer on that date for some other amount —
//            including a lump sum that does not reconcile under (c)
//   human  — unreadable or the readers disagreed; no date visible; the receipt
//            says "processing"; or the recorded date is the slip's application
//            date rather than its value date
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const dir = path.resolve(process.argv[2])
const load = (f) => JSON.parse(readFileSync(path.join(dir, f), 'utf8'))
const rows = load('worklist.json')
const readings = load('readings.json')
const ledgerRaw = load('ledger_raw.json')
const ledger = ledgerRaw.rows[0].rows

// Readers are asked for other_dates as YYYY-MM-DD but sometimes copy the label
// with it ("Application Date 08/03/2026", "04-Jun-2026 (Transfer Date)"). Left
// as text, the application-date rule below never matches and a two-date slip is
// flagged wrong_date — the second run (2026-10-14) did exactly that once.
const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }
const pad = (n) => String(n).padStart(2, '0')
function iso(s) {
  if (/^\d{4}-\d\d-\d\d$/.test(s)) return s
  let m = s.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/)
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`
  m = s.match(/(\d{1,2})[\s-]([A-Za-z]{3})[A-Za-z]*[\s-](\d{4})/)
  if (m && MON[m[2].toLowerCase()]) return `${m[3]}-${pad(MON[m[2].toLowerCase()])}-${pad(m[1])}`
  console.error('other_date not understood, left as is:', JSON.stringify(s))
  return s
}
for (const r of readings)
  for (const t of [...(r.transactions ?? []), ...(r.all ?? []).flatMap((x) => x.transactions ?? [])])
    t.other_dates = (t.other_dates ?? []).map(iso)

const byUnit = Object.fromEntries(readings.map((r) => [r.id, r]))
const led = Object.fromEntries(ledger.map((l) => [l.payment_id, l]))
const sen = (rm) => Math.round(Number(rm) * 100)
// Organisation names are typed by hand; only case, spacing and punctuation
// are forgiven. Two spellings of one kindergarten do NOT reconcile, on purpose.
const norm = (s) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
const orgSum = (org, date) =>
  ledger.filter((l) => norm(l.organization) === org && l.paid_date === date)
    .reduce((n, l) => n + l.amount_sen, 0)

const groups = new Map()
for (const r of rows) {
  if (!r.unit) continue
  if (!groups.has(r.unit)) groups.set(r.unit, [])
  groups.get(r.unit).push(r)
}

const out = []
for (const r of rows) {
  if (r.state !== 'uploaded') continue
  const u = byUnit[r.unit]
  const org = norm(led[r.payment_id]?.organization)
  const base = {
    payment_id: r.payment_id, unit: r.unit, invoice_no: r.invoice_no, student: r.student,
    file_name: r.file_name, recorded: { date: r.paid_date, rm: r.amount_sen / 100 },
  }
  const human = (why, shows = null) => out.push({ ...base, decision: 'human', why, shows })

  if (!u || !u.agreed) {
    // Readers who all found an amount but no date: a cropped screenshot.
    const noDate = (u?.all ?? []).length > 0 &&
      u.all.every((x) => x.readable && x.transactions.length > 0 && x.transactions.every((t) => !t.date))
    human(noDate ? 'no date visible on the receipt' : 'unreadable, or the readings disagreed')
    continue
  }
  const txs = u.transactions
  const shows = txs.map((t) => ({
    date: t.date, other_dates: t.other_dates ?? [], rm: t.amount_rm, status: t.status, ref: t.reference,
  }))
  if (txs.length === 0) {
    human('no transfer in the file', shows)
    continue
  }
  const E = r.amount_sen
  const sameFile = groups.get(r.unit)
  const fileSum = sameFile.filter((g) => g.paid_date === r.paid_date).reduce((n, g) => n + g.amount_sen, 0)
  const multiple = (t) => sen(t.amount_rm) > E && sen(t.amount_rm) % E === 0
  const onDate = txs.filter((t) => t.date === r.paid_date)

  const exact = onDate.find((t) => sen(t.amount_rm) === E)
    ?? onDate.find((t) => sameFile.length > 1 && sen(t.amount_rm) === fileSum)
  const lump = onDate.find((t) => multiple(t) && org && orgSum(org, t.date) === sen(t.amount_rm))
  const hit = exact ?? lump
  if (hit) {
    if (hit.status === 'pending') human('matches, but the receipt says processing', shows)
    else out.push({ ...base, decision: 'pass', how: exact ? 'exact' : 'lump sum reconciled to organisation', shows })
    continue
  }
  if (onDate.length > 0) {
    const t = onDate.find(multiple)
    out.push({
      ...base, decision: 'flag', reasons: ['wrong_amount'], shows,
      note: !t
        ? undefined
        : org
          ? `lump sum RM${t.amount_rm}; the organisation's recorded payments that day total RM${orgSum(org, t.date) / 100}`
          : `lump sum RM${t.amount_rm}; the student has no organisation on record`,
    })
    continue
  }
  // Nothing on the recorded date. A slip with two dates may have been recorded
  // by the other one — the owner has not ruled on which date counts.
  if (txs.some((t) => (t.other_dates ?? []).includes(r.paid_date))) {
    human("recorded on the slip's application date, not its value date", shows)
    continue
  }
  const reasons = ['wrong_date']
  if (!txs.some((t) => sen(t.amount_rm) === E || multiple(t))) reasons.push('wrong_amount')
  out.push({ ...base, decision: 'flag', reasons, shows })
}

writeFileSync(path.join(dir, 'decisions.json'), JSON.stringify(out, null, 1))
const tally = (list, f) => list.reduce((m, o) => ((m[f(o)] = (m[f(o)] ?? 0) + 1), m), {})
console.log(JSON.stringify({
  payments: out.length,
  pass: tally(out.filter((o) => o.decision === 'pass'), (o) => o.how),
  flag: tally(out.filter((o) => o.decision === 'flag'), (o) => o.reasons.join('+')),
  human: tally(out.filter((o) => o.decision === 'human'), (o) => o.why),
}, null, 1))
