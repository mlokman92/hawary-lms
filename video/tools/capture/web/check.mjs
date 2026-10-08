// Load the fake backend in Node (no browser, no server) and say what is in it.
// Use it to find out whether your partition even loads before you shoot, and
// what a persona would see.
//
//   node tools/capture/web/check.mjs                         base only
//   node tools/capture/web/check.mjs --db teaching,money     with partitions
//   node tools/capture/web/check.mjs --db money --as trainer --q "invoices?select=id&status=eq.paid"
//   node tools/capture/web/check.mjs --db teaching --rpc report_counts
//
// --q runs one read as that persona:  <table>?select=<cols>&<col>=<op>.<value>&order=<col>.desc&limit=5
// --rpc calls one RPC as that persona with --args '<json>'.
// Exits 1 if a partition failed to load or anything was reported unhandled.

import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { CAPTURE_DIR, VIDEO_DIR, WEB_ROOT } from './server.mjs'

const argv = process.argv.slice(2)
const opt = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] : fallback
}
const names = (opt('db', '') || '').split(',').map((s) => s.trim()).filter((s) => s && s !== 'base')
const as = opt('as', 'director')
const now = opt('now')

const require = createRequire(path.join(WEB_ROOT, 'package.json'))
const vite = await import(pathToFileURL(require.resolve('vite')).href)
const server = await vite.createServer({
  configFile: false,
  root: CAPTURE_DIR,
  envDir: false,
  logLevel: 'error',
  appType: 'custom',
  cacheDir: path.join(VIDEO_DIR, '.cache', 'capture-check'),
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
})

let problems = 0
const realError = console.error
console.error = (...a) => {
  problems++
  realError(...a)
}

try {
  const fakeMod = await server.ssrLoadModule('/fake/index.ts')
  const clock = fakeMod.installClock(now)
  const client = {}
  const fake = fakeMod.installFake(client, {
    persona: as,
    partitions: names.map((name) => ({ name, load: () => server.ssrLoadModule(`/fake/db/${name}.ts`) })),
  })
  await fake.ready
  const db = fake.db
  const sum = (rows, col) => rows.reduce((s, r) => s + (r[col] ?? 0), 0)
  const rm = (sen) => 'RM ' + (sen / 100).toLocaleString('en-MY', { minimumFractionDigits: 2 })

  console.log(`clock ${clock}   partitions ${db.loaded.join(', ')}   signed in as ${fake.current()?.key ?? 'anon'}`)
  console.log('\npersonas')
  for (const p of db.personas) console.log(`  ${p.key.padEnd(10)} ${p.label ?? p.fullName ?? ''}`)

  console.log('\nrows')
  const counts = db.counts()
  console.log('  ' + Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(' · '))

  const invoices = db.rows('invoices')
  const payments = db.rows('payments').filter((p) => p.status === 'succeeded')
  console.log('\nledger')
  console.log(`  invoiced ${rm(sum(invoices, 'total_sen'))} · collected ${rm(sum(payments, 'amount_sen'))} · outstanding ${rm(sum(invoices, 'total_sen') - sum(invoices, 'amount_paid_sen'))}`)
  const byStatus = {}
  for (const i of invoices) byStatus[i.status] = (byStatus[i.status] ?? 0) + 1
  console.log('  invoices ' + Object.entries(byStatus).map(([k, v]) => `${k} ${v}`).join(' · '))
  const overdue = invoices.filter((i) => i.total_sen > i.amount_paid_sen && i.due_at && Date.parse(i.due_at) < Date.now() && !['draft', 'void', 'cancelled'].includes(i.status))
  console.log(`  overdue ${overdue.length} invoices, ${rm(overdue.reduce((s, i) => s + i.total_sen - i.amount_paid_sen, 0))}`)
  const months = {}
  for (const p of payments) {
    const k = new Date(Date.parse(p.paid_at) + 8 * 3600e3).toISOString().slice(0, 7)
    months[k] = (months[k] ?? 0) + p.amount_sen
  }
  console.log('  collected by month ' + Object.keys(months).sort().map((k) => `${k} ${rm(months[k])}`).join(' · '))

  console.log('\nwhat each persona sees')
  for (const p of db.personas) {
    if (!p.userId) continue
    const ctx = db.ctx(p)
    const see = (t) => db.visible(t, db.rows(t), ctx)
    const reports = see('report_submissions')
    const waiting = reports.filter((r) => r.status === 'submitted' || r.status === 'in_review').length
    const upcoming = see('appointments').filter((a) => a.status === 'booked' && Date.parse(a.starts_at) > Date.now()).length
    const unread = see('notifications').filter((n) => !n.read_at).length
    const pending = see('enrollments').filter((e) => e.status === 'pending').length
    console.log(
      `  ${p.key.padEnd(10)} role ${(ctx.role ?? '—').padEnd(7)} courses ${String(see('courses').length).padEnd(2)} students ${String(see('students').length).padEnd(4)} invoices ${String(see('invoices').length).padEnd(4)}` +
        ` | badges: enrolments ${pending} · LPKC ${waiting} · appointments ${upcoming} · bell ${unread}`,
    )
  }

  const q = opt('q')
  if (q) {
    const [table, qs = ''] = q.split('?')
    let query = client.from(table)
    const params = new URLSearchParams(qs)
    query = query.select(params.get('select') ?? '*', params.get('count') ? { count: 'exact' } : {})
    for (const [k, v] of params) {
      if (['select', 'order', 'limit', 'count'].includes(k)) continue
      const m = /^(not\.)?(\w+)\.(.*)$/.exec(v)
      if (!m) continue
      const value = m[2] === 'in' ? m[3].replace(/^\(|\)$/g, '').split(',') : m[3] === 'null' ? null : m[3]
      query = m[1] ? query.not(k, m[2], value) : query.filter(k, m[2], value)
    }
    for (const o of (params.get('order') ?? '').split(',').filter(Boolean)) {
      const [col, dir] = o.split('.')
      query = query.order(col, { ascending: dir !== 'desc' })
    }
    if (params.get('limit')) query = query.limit(Number(params.get('limit')))
    const res = await query
    console.log(`\n--q ${q}  (as ${as})`)
    console.log(JSON.stringify({ error: res.error, count: res.count, rows: res.data?.length, first: res.data?.slice(0, 3) }, null, 1))
  }
  const rpc = opt('rpc')
  if (rpc) {
    const res = await client.rpc(rpc, JSON.parse(opt('args', '{}')))
    console.log(`\n--rpc ${rpc}  (as ${as})`)
    console.log(JSON.stringify(res, null, 1).slice(0, 4000))
  }

  const failed = names.filter((n) => !db.loaded.includes(n))
  if (failed.length) console.log(`\nNOT LOADED: ${failed.join(', ')}`)
  console.log(problems ? `\n${problems} problem(s) reported above.` : '\nclean.')
} finally {
  await server.close()
}
process.exit(problems ? 1 : 0)
