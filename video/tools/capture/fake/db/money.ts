// PARTITION: money — the money screens, the learner's side, and the public pay page.
//
//   ?db=money
//
// base already holds the whole invoice book and the payment ledger (they add
// up to cast.money.tiles to the sen). This partition adds what the money and
// learner screens ask for on top of it:
//
//   - the reporting RPCs the pages read instead of tables: invoice_totals,
//     payment_log_page / _totals, payment_report, invoice_report(+_page),
//     course_billing_summary / _roster
//   - the public pay page: get_public_invoice, get_pay_status, create-bill,
//     verify-payment
//   - incentives (money OUT, through Billplz): bank accounts, batches, payouts,
//     incentive_candidates
//   - the learner's own rows: her quiz attempt, a draft Tugasan, the booking
//     RPCs (get_my_appointments, get_booking_options), a longer note
//
// EVERY SUM IS LEFT WHERE BASE PUT IT. The two changes to the invoice book are
// sum-neutral on purpose (see "The invoice book" below), so the four tiles on
// /payments still read cast.money.tiles exactly.
//
// THE CLOCK (`?now=`) walks four small stories, the way base walks the LPKC one:
//
//   2026-10-06T16:21   Nur Aisyah is in the middle of Kuiz 1 (attempt 1, timer running)
//   2026-10-06T20:12   she has not booked her session yet — the week of 12 Oct is open
//   default (7 Oct 11:55)  Kuiz 1 is marked 18 / 20; the session on 13 Oct is booked;
//                      INV-2026-0412 is part-paid, RM 900.00 outstanding
//   2026-10-07T12:22   she has paid the balance by FPX — the invoice is Paid
//
// INCENTIVES ARE PAID TO STUDENTS: a government grant the academy passes on, one
// flat amount per student per batch (docs/billplz-incentives.md, cast.money
// .incentiveBatch). "September 2026" pays the cast's sixteen students RM 500.00
// each = RM 8,000.00, sent yesterday afternoon; fifteen have landed and one is
// still with the bank. Nur Aisyah is one of the sixteen, so her own billing page
// shows the payout arriving.

import type { Ctx, FakeDb, Row } from '..'
import {
  ACADEMY_ID,
  COURSE_FEE_SEN,
  ID,
  at,
  cast,
  day,
  enrollmentId,
  invoiceId,
  invoiceNo,
  mytDate,
  plusMinutes,
  rm,
  rng,
  studentId,
  studentUserId,
  uid,
} from '..'

// ---------------------------------------------------------------------------
// Facts a shots file may want (ids are derived, so they are stable)
// ---------------------------------------------------------------------------

/** incentive_batches.id by key. */
export const BATCH = {
  oct: uid('incentive-batch', '2026-10'),
  sep: uid('incentive-batch', '2026-09'),
  aug: uid('incentive-batch', '2026-08'),
  jul: uid('incentive-batch', '2026-07'),
  jun: uid('incentive-batch', '2026-06'),
  may: uid('incentive-batch', '2026-05'),
}

/** The flat amount every batch pays per student: RM 500.00 (cast.money.incentiveBatch.per_student_sen). */
const INCENTIVE_SEN: number = (cast.money.incentiveBatch as Row).per_student_sen ?? 50_000

/** Nur Aisyah's one attempt at Kuiz 1. */
export const HERO_ATTEMPT = uid('attempt', 'aisyah/kuiz1/1')

const HERO_TOKEN = 'hawary-demo-pay-0412'

const NOT_RECEIVABLE = new Set(['void', 'cancelled', 'draft'])

const SWIFT = ['MBBEMYKL', 'MBBEMYKL', 'MBBEMYKL', 'CIBBMYKL', 'CIBBMYKL', 'BIMBMYKL', 'BIMBMYKL', 'RHBBMYKL', 'PBBEMYKL', 'BSNAMYK1', 'BKRMMYKL', 'ARBKMYKL', 'HLBBMYKL']

const MS_DAY = 86_400_000
const MYT = 8 * 3_600_000

export default function money(db: FakeDb): void {
  const now = db.now().getTime()
  const iso = (ms: number) => new Date(ms).toISOString()
  const balanceOf = (i: Row) => Math.max(0, i.total_sen - i.amount_paid_sen)

  // =========================================================================
  // The invoice book — two sum-neutral changes
  // =========================================================================
  //
  // 1. /courses/:id/billing exists to answer "who was never invoiced". In base
  //    every enrolled student has an invoice, so that page would have nothing
  //    to say. Five of Siri 3's latest joiners therefore lose their (unpaid)
  //    invoice, and the five people whose enrolment request is still waiting
  //    are invoiced instead — same count, same RM 1,800.00 each, all unpaid.
  //    Invoiced / collected / outstanding do not move by a sen.
  {
    const victims = db
      .where('invoices', (i) => i.course_id === ID.course.siri3 && i.status === 'issued' && i.amount_paid_sen === 0)
      .sort((a, b) => b.invoice_no.localeCompare(a.invoice_no))
      .slice(0, 5)
    const gone = new Set(victims.map((v) => v.id))
    db.remove('invoice_items', (it) => gone.has(it.invoice_id))
    db.remove('invoices', (i) => gone.has(i.id))

    const title = db.get('courses', ID.course.siri3).title
    ;[801, 802, 803, 804, 805].forEach((n, k) => {
      const s = db.get('students', studentId(n))
      const seq = 797 + k
      const issued = plusMinutes(s.created_at, 34 + k * 3)
      db.add('invoices', {
        id: invoiceId(seq),
        invoice_no: invoiceNo(seq),
        student_id: s.id,
        course_id: ID.course.siri3,
        enrollment_id: enrollmentId(n),
        status: 'issued',
        subtotal_sen: COURSE_FEE_SEN,
        tax_sen: 0,
        total_sen: COURSE_FEE_SEN,
        amount_paid_sen: 0,
        balance_sen: COURSE_FEE_SEN,
        issued_at: issued,
        due_at: at('2026-10-31'),
        pay_token: `hawary-demo-pay-${String(seq).padStart(4, '0')}`,
        pay_token_created_at: issued,
        created_at: issued,
        created_by: ID.user.admin,
      })
      db.add('invoice_items', {
        id: uid('invoice-item', seq),
        invoice_id: invoiceId(seq),
        description: `Yuran ${title}`,
        quantity: 1,
        unit_price_sen: COURSE_FEE_SEN,
        amount_sen: COURSE_FEE_SEN,
        created_at: issued,
      })
    })
  }

  // 2. /payments lists by created_at, newest first, and the hero's invoice was
  //    issued in July — it would sit on page 8. `created_at` is printed nowhere
  //    (every screen shows issued_at), so moving it reorders the list and
  //    changes no figure and no date on any screen. The first screenful is set
  //    by hand: the hero's invoice second, and around it all three courses and
  //    every state an invoice can be in — paid, part-paid, unpaid, past due.
  {
    const TODAY_MS = Date.parse(day(0, '11:55'))
    const byNo = (a: Row, b: Row) => String(b.invoice_no).localeCompare(String(a.invoice_no))
    const overdue = (course: string, partial: boolean) =>
      (db.where('invoices', (i) => i.course_id === course && balanceOf(i) > 0 && !!i.due_at && Date.parse(i.due_at) < TODAY_MS && (partial ? i.amount_paid_sen > 0 : i.amount_paid_sen === 0)) as Row[]).sort(byNo).reverse()[0]
    const paid = (course: string, nth = 0) => (db.where('invoices', (i) => i.course_id === course && i.status === 'paid') as Row[]).sort(byNo)[nth]
    const top: (Row | undefined)[] = [
      db.byId('invoices', invoiceId(801)) as Row, // this morning's, unpaid
      db.get('invoices', ID.hero.invoice) as Row, // INV-2026-0412, part-paid
      paid(ID.course.siri3, 0),
      overdue(ID.course.siri2, true), // part-paid, due 30 Sept
      paid(ID.course.siri2, 0),
      overdue(ID.course.siri1, false), // unpaid, due 31 Aug
      paid(ID.course.siri3, 1),
      db.byId('invoices', invoiceId(800)) as Row,
    ]
    top.forEach((inv, k) => {
      if (inv) inv.created_at = plusMinutes(day(0, '11:40'), -k * 9)
    })
    db.touch()
  }

  // The hero's invoice follows the academy's instalment default (NULL), which
  // base switched on: the public page offers "pay in full" or "pay part".

  // -------------------------------------------------------------------------
  // The fourth beat: she pays the balance by FPX at 12:21 on 7 Oct.
  // -------------------------------------------------------------------------
  const PAID_OFF_AT = at('2026-10-07 12:21:30')
  if (now >= Date.parse(PAID_OFF_AT)) {
    const inv = db.get('invoices', ID.hero.invoice) as Row
    db.add('payments', {
      id: uid('payment', 'hero/balance'),
      invoice_id: inv.id,
      student_id: ID.hero.student,
      amount_sen: cast.money.heroInvoice.balance_sen,
      method: 'fpx',
      provider: 'toyyibpay',
      provider_ref: 'TP261007418822',
      status: 'succeeded',
      paid_at: PAID_OFF_AT,
      note: 'Maybank2u',
      created_at: PAID_OFF_AT,
      created_by: null,
    })
    Object.assign(inv, { amount_paid_sen: inv.total_sen, balance_sen: 0, status: 'paid', updated_at: PAID_OFF_AT })
    db.touch()
  }
  db.add('notifications', {
    id: uid('notif', 'aisyah/paid-off'),
    user_id: ID.user.aisyah,
    kind: 'payment_received',
    data: { invoice_id: ID.hero.invoice, invoice_no: cast.money.heroInvoice.number, amount_sen: cast.money.heroInvoice.balance_sen },
    created_at: PAID_OFF_AT, // dropped by the clock until it has happened
    read_at: null,
  })

  // The academy's own logo, as the Director uploaded it in Settings: the brand
  // lockup from brand/png. Only on the web harness, whose dev server can serve
  // a file from the repo (the path is taken from the harness's own boot script,
  // so nothing here names a machine).
  if (typeof document !== 'undefined') {
    const marker = '/video/tools/capture/web/boot.ts'
    const boot = document.querySelector?.(`script[src*="${marker}"]`)?.getAttribute('src') ?? ''
    const cut = boot.indexOf(marker)
    if (cut >= 0) {
      ;(db.get('academies', ACADEMY_ID) as Row).logo_url = boot.slice(0, cut) + '/brand/png/lockup-1600.png'
      db.touch()
    }
  }

  // /settings prints the last four characters of each stored key and the
  // ToyyibPay category. Nobody should have to wonder whether a real one leaked
  // into the film, so they say what they are.
  db.patch('academy_payment_settings', {}, { toyyibpay_secret_last4: 'demo', toyyibpay_category_code: 'hawary-demo', billplz_secret_last4: 'demo' })

  // =========================================================================
  // Reporting RPCs. All SECURITY INVOKER in production: RLS decides what the
  // caller can see, so a trainer gets zeroes and a student only her own rows.
  // =========================================================================
  const seesInvoice = (i: Row, c: Ctx) => c.isAdmin || (!!c.studentId && i.student_id === c.studentId)
  const issuedDay = (i: Row) => mytDate(i.issued_at ?? i.created_at)
  const paidDay = (p: Row) => mytDate(p.paid_at ?? p.created_at)

  const invoicesIn = (args: Row, c: Ctx): Row[] =>
    (db.rows('invoices') as Row[]).filter(
      (i) =>
        seesInvoice(i, c) &&
        !NOT_RECEIVABLE.has(i.status) &&
        (args._no_course ? i.course_id == null : args._course ? i.course_id === args._course : true) &&
        (!args._from || issuedDay(i) >= args._from) &&
        (!args._to || issuedDay(i) <= args._to) &&
        (!args._student || i.student_id === args._student),
    )

  db.rpc('invoice_totals', (args, c) => {
    const rows = invoicesIn(args, c)
    const t = c.now.getTime()
    let invoiced = 0
    let collected = 0
    let outstanding = 0
    let overdue = 0
    for (const i of rows) {
      const bal = balanceOf(i)
      invoiced += i.total_sen
      collected += i.amount_paid_sen
      outstanding += bal
      if (bal > 0 && (i.status === 'overdue' || (i.due_at && Date.parse(i.due_at) < t))) overdue += bal
    }
    return [{ invoice_count: rows.length, invoiced_sen: invoiced, collected_sen: collected, outstanding_sen: outstanding, overdue_sen: overdue }]
  })

  /** A payment with everything the ledger joins onto it. */
  const joined = (p: Row) => {
    const inv = db.byId('invoices', p.invoice_id) as Row | null
    const course = inv?.course_id ? (db.byId('courses', inv.course_id) as Row | null) : null
    const s = p.student_id ? (db.byId('students', p.student_id) as Row | null) : null
    const by = p.created_by ? (db.byId('profiles', p.created_by) as Row | null) : null
    return { p, inv, course, s, by }
  }
  type Joined = ReturnType<typeof joined>

  const paymentsIn = (args: Row, c: Ctx): Joined[] => {
    const needle = String(args._search ?? '').trim().toLowerCase()
    const out: Joined[] = []
    for (const p of db.rows('payments') as Row[]) {
      if (!(c.isAdmin || (!!c.studentId && p.student_id === c.studentId))) continue
      if (args._status && p.status !== args._status) continue
      if (args._student && p.student_id !== args._student) continue
      const d = paidDay(p)
      if (args._from && d < args._from) continue
      if (args._to && d > args._to) continue
      const j = joined(p)
      if (args._no_course ? j.inv?.course_id != null : args._course ? j.inv?.course_id !== args._course : false) continue
      if (needle) {
        const hay = [j.s?.full_name, j.s?.student_no, j.inv?.invoice_no, j.course?.title, p.provider_ref, j.by?.full_name, p.note].filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(needle)) continue
      }
      out.push(j)
    }
    return out
  }

  db.rpc('payment_log_page', (args, c) => {
    const rows = paymentsIn(args, c)
    const ts = (v: string | null) => (v ? Date.parse(v) : -Infinity)
    if (args._sort === 'paid') rows.sort((a, b) => ts(b.p.paid_at) - ts(a.p.paid_at) || ts(b.p.created_at) - ts(a.p.created_at) || (a.p.id < b.p.id ? 1 : -1))
    else rows.sort((a, b) => ts(b.p.created_at) - ts(a.p.created_at) || (a.p.id < b.p.id ? 1 : -1))
    const limit = Math.max(1, Math.min(Number(args._limit ?? 50), 200))
    const offset = Math.max(0, Number(args._offset ?? 0))
    return rows.slice(offset, offset + limit).map(({ p, inv, course, s, by }) => ({
      id: p.id,
      amount_sen: p.amount_sen,
      method: p.method,
      provider: p.provider,
      provider_ref: p.provider_ref,
      status: p.status,
      paid_at: p.paid_at,
      created_at: p.created_at,
      note: p.note,
      invoice_id: p.invoice_id,
      invoice_no: inv?.invoice_no ?? null,
      course_id: course?.id ?? null,
      course_title: course?.title ?? null,
      student_id: p.student_id,
      student_full_name: s?.full_name ?? null,
      student_no: s?.student_no ?? null,
      recorded_by_name: by?.full_name ?? null,
    }))
  })

  db.rpc('payment_log_totals', (args, c) => {
    const rows = paymentsIn(args, c)
    return [{ total_count: rows.length, received_sen: rows.reduce((s, j) => s + (j.p.status === 'succeeded' ? j.p.amount_sen : 0), 0) }]
  })

  /** Group rows the way payment_report / invoice_report do: month | course | student. */
  function grouped<T extends Row>(dim: string, rows: Row[], keyOf: (r: Row) => { key: string; label: string; sublabel: string | null }, fold: (acc: T | undefined, r: Row) => T): (T & { key: string; label: string; sublabel: string | null })[] {
    const map = new Map<string, T & { key: string; label: string; sublabel: string | null }>()
    for (const r of rows) {
      const k = keyOf(r)
      const prev = map.get(k.key)
      map.set(k.key, { ...fold(prev, r), ...k })
    }
    void dim
    return [...map.values()]
  }

  db.rpc('payment_report', (args, c) => {
    const dim = args._dim ?? 'month'
    const rows = paymentsIn({ ...args, _status: 'succeeded', _search: null }, c)
    const keyOf = (j: Row) => {
      if (dim === 'month') {
        const ym = paidDay(j.p).slice(0, 7)
        return { key: ym, label: ym, sublabel: null }
      }
      if (dim === 'course') return { key: j.inv?.course_id ?? '__none__', label: j.course?.title ?? '', sublabel: null }
      return { key: j.p.student_id ?? '__none__', label: j.s?.full_name ?? '', sublabel: j.s?.student_no ?? null }
    }
    const groups = grouped<{ payment_count: number; amount_sen: number }>(dim, rows as unknown as Row[], keyOf, (acc, j) => ({
      payment_count: (acc?.payment_count ?? 0) + 1,
      amount_sen: (acc?.amount_sen ?? 0) + j.p.amount_sen,
    }))
    groups.sort((a, b) => (dim === 'month' ? b.key.localeCompare(a.key) : 0) || b.amount_sen - a.amount_sen || a.label.localeCompare(b.label) || a.key.localeCompare(b.key))
    return groups.slice(0, 500).map((g) => ({ key: g.key, label: g.label, sublabel: g.sublabel, payment_count: g.payment_count, amount_sen: g.amount_sen, group_count: groups.length }))
  })

  db.rpc('invoice_report', (args, c) => {
    const dim = args._dim ?? 'month'
    const rows = invoicesIn(args, c)
    const keyOf = (i: Row) => {
      if (dim === 'month') {
        const ym = issuedDay(i).slice(0, 7)
        return { key: ym, label: ym, sublabel: null }
      }
      if (dim === 'course') return { key: i.course_id ?? '__none__', label: i.course_id ? ((db.byId('courses', i.course_id) as Row | null)?.title ?? '') : '', sublabel: null }
      const s = db.byId('students', i.student_id) as Row | null
      return { key: i.student_id ?? '__none__', label: s?.full_name ?? '', sublabel: s?.student_no ?? null }
    }
    const groups = grouped<{ invoice_count: number; billed_sen: number; paid_sen: number; outstanding_sen: number }>(dim, rows, keyOf, (acc, i) => ({
      invoice_count: (acc?.invoice_count ?? 0) + 1,
      billed_sen: (acc?.billed_sen ?? 0) + i.total_sen,
      paid_sen: (acc?.paid_sen ?? 0) + i.amount_paid_sen,
      outstanding_sen: (acc?.outstanding_sen ?? 0) + balanceOf(i),
    }))
    groups.sort(
      (a, b) =>
        (dim === 'month' ? b.key.localeCompare(a.key) : 0) || b.outstanding_sen - a.outstanding_sen || b.billed_sen - a.billed_sen || a.label.localeCompare(b.label) || a.key.localeCompare(b.key),
    )
    return groups.slice(0, 500).map((g) => ({
      key: g.key,
      label: g.label,
      sublabel: g.sublabel,
      invoice_count: g.invoice_count,
      billed_sen: g.billed_sen,
      paid_sen: g.paid_sen,
      outstanding_sen: g.outstanding_sen,
      group_count: groups.length,
    }))
  })

  db.rpc('invoice_report_page', (args, c) => {
    const rows = invoicesIn(args, c)
    const t = (v: string | null, missing: number) => (v ? Date.parse(v) : missing)
    rows.sort(
      (a, b) =>
        Number(balanceOf(b) > 0) - Number(balanceOf(a) > 0) ||
        t(a.due_at, Infinity) - t(b.due_at, Infinity) ||
        t(b.issued_at ?? b.created_at, 0) - t(a.issued_at ?? a.created_at, 0) ||
        (a.id < b.id ? 1 : -1),
    )
    const limit = Math.max(1, Math.min(Number(args._limit ?? 50), 200))
    const offset = Math.max(0, Number(args._offset ?? 0))
    return rows.slice(offset, offset + limit).map((i) => {
      const s = db.byId('students', i.student_id) as Row | null
      const course = i.course_id ? (db.byId('courses', i.course_id) as Row | null) : null
      return {
        id: i.id,
        invoice_no: i.invoice_no,
        status: i.status,
        issued_at: i.issued_at,
        due_at: i.due_at,
        total_sen: i.total_sen,
        amount_paid_sen: i.amount_paid_sen,
        balance_sen: balanceOf(i),
        student_id: i.student_id,
        student_full_name: s?.full_name ?? null,
        student_no: s?.student_no ?? null,
        course_id: i.course_id,
        course_title: course?.title ?? null,
      }
    })
  })

  // --- /courses/:id/billing: starts from the ROSTER, not from the invoice book.
  type RosterRow = {
    student_id: string
    full_name: string | null
    student_no: string
    email: string | null
    phone: string | null
    enrollment_status: string
    enrolled_at: string
    invoice_count: number
    billed_sen: number
    paid_sen: number
    outstanding_sen: number
    pay_status: 'uninvoiced' | 'unpaid' | 'partial' | 'paid'
    last_invoice_id: string | null
    last_invoice_no: string | null
    due_at: string | null
  }
  const rosterOf = (courseId: string, c: Ctx): RosterRow[] => {
    if (!c.isAdmin) return []
    const seen = new Set<string>()
    const out: RosterRow[] = []
    for (const e of db.lookup('enrollments', 'course_id', courseId)) {
      if ((e.status !== 'active' && e.status !== 'completed') || seen.has(e.student_id)) continue
      seen.add(e.student_id)
      const s = db.byId('students', e.student_id) as Row | null
      if (!s) continue
      const mine = db.lookup('invoices', 'student_id', s.id).filter((i) => i.course_id === courseId && !NOT_RECEIVABLE.has(i.status))
      mine.sort(
        (a, b) =>
          Number(balanceOf(b) > 0) - Number(balanceOf(a) > 0) ||
          (a.due_at ? Date.parse(a.due_at) : Infinity) - (b.due_at ? Date.parse(b.due_at) : Infinity) ||
          Date.parse(b.issued_at ?? b.created_at) - Date.parse(a.issued_at ?? a.created_at),
      )
      const billed = mine.reduce((n, i) => n + i.total_sen, 0)
      const paid = mine.reduce((n, i) => n + i.amount_paid_sen, 0)
      const owing = mine.reduce((n, i) => n + balanceOf(i), 0)
      out.push({
        student_id: s.id,
        full_name: s.full_name,
        student_no: s.student_no,
        email: s.email,
        phone: s.phone,
        enrollment_status: e.status,
        enrolled_at: e.enrolled_at,
        invoice_count: mine.length,
        billed_sen: billed,
        paid_sen: paid,
        outstanding_sen: owing,
        pay_status: mine.length === 0 ? 'uninvoiced' : owing === 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid',
        last_invoice_id: mine[0]?.id ?? null,
        last_invoice_no: mine[0]?.invoice_no ?? null,
        due_at: mine[0]?.due_at ?? null,
      })
    }
    return out
  }

  db.rpc('course_billing_summary', (args, c) => {
    const courses = (db.rows('courses') as Row[]).filter((k) => !args._course || k.id === args._course)
    const out: Row[] = []
    for (const k of courses) {
      const r = rosterOf(k.id, c)
      if (r.length === 0) continue
      const n = (s: RosterRow['pay_status']) => r.filter((x) => x.pay_status === s).length
      out.push({
        course_id: k.id,
        course_title: k.title,
        course_code: k.code,
        course_status: k.status,
        student_count: r.length,
        uninvoiced_count: n('uninvoiced'),
        unpaid_count: n('unpaid'),
        partial_count: n('partial'),
        paid_count: n('paid'),
        billed_sen: r.reduce((s, x) => s + x.billed_sen, 0),
        paid_sen: r.reduce((s, x) => s + x.paid_sen, 0),
        outstanding_sen: r.reduce((s, x) => s + x.outstanding_sen, 0),
      })
    }
    out.sort((a, b) => b.uninvoiced_count - a.uninvoiced_count || b.outstanding_sen - a.outstanding_sen || String(a.course_title).localeCompare(String(b.course_title)))
    return out
  })

  db.rpc('course_billing_roster', (args, c) => {
    const needle = String(args._search ?? '').trim().toLowerCase()
    const rank = { uninvoiced: 0, unpaid: 1, partial: 2, paid: 3 } as const
    const rows = rosterOf(args._course, c)
      .filter((r) => !args._status || r.pay_status === args._status)
      .filter((r) => !needle || [r.full_name, r.student_no, r.email].some((v) => (v ?? '').toLowerCase().includes(needle)))
      .sort((a, b) => rank[a.pay_status] - rank[b.pay_status] || b.outstanding_sen - a.outstanding_sen || String(a.full_name ?? '￿').localeCompare(String(b.full_name ?? '￿')) || (a.student_id < b.student_id ? -1 : 1))
    const limit = Math.max(1, Math.min(Number(args._limit ?? 50), 500))
    const offset = Math.max(0, Number(args._offset ?? 0))
    return rows.slice(offset, offset + limit).map((r) => ({ ...r, total_count: rows.length }))
  })

  // =========================================================================
  // The pay link
  // =========================================================================
  db.rpc('ensure_pay_token', (args) => {
    const inv = db.byId('invoices', args._invoice) as Row | null
    if (!inv) throw db.fail('Invoice not found', { code: 'P0002' })
    return inv.pay_token ?? `hawary-demo-pay-${String(inv.invoice_no).slice(-4)}`
  })

  const byToken = (token: string) => db.find('invoices', { pay_token: token }) as Row | undefined

  // Granted to anon in production; returns nothing but the amounts.
  db.rpc('get_public_invoice', (args) => {
    const i = byToken(args._token)
    if (!i || !['issued', 'partially_paid', 'overdue'].includes(i.status)) return []
    const a = db.get('academies', ACADEMY_ID) as Row
    const s = (db.rows('academy_payment_settings') as Row[])[0] ?? {}
    const due = balanceOf(i)
    return [
      {
        invoice_no: i.invoice_no,
        academy_name: a.name,
        academy_logo_url: a.logo_url ?? null,
        currency: i.currency,
        total_sen: i.total_sen,
        amount_paid_sen: i.amount_paid_sen,
        due_sen: due,
        status: i.status,
        gateway_enabled: s.toyyibpay_enabled ?? false,
        charge_to_payor: i.charge_to_payor ?? s.toyyibpay_charge_to_payor ?? false,
        allow_partial: i.allow_partial_payment ?? s.allow_partial_payment ?? false,
        min_pay_sen: Math.min(due, Math.max(i.min_partial_sen ?? s.min_partial_sen ?? 100, 100)),
      },
    ]
  })

  const payStatus = (token: string) => {
    const i = byToken(token)
    if (!i) return null
    return { invoice_status: i.status as string, intent_status: i.status === 'paid' ? 'succeeded' : null }
  }
  db.rpc('get_pay_status', (args) => {
    const s = payStatus(args._token)
    return s ? [s] : []
  })
  // ToyyibPay itself is unreachable from the set: the "bank" answers at once.
  db.fn('create-bill', (body) => ({ ok: true, url: `/pay/${body?.pay_token ?? HERO_TOKEN}/result`, reused: false }))
  db.fn('verify-payment', (body) => ({ ok: true, ...(payStatus(body?.pay_token) ?? { invoice_status: 'issued', intent_status: null }) }))

  // =========================================================================
  // Incentives — money OUT, through Billplz
  // =========================================================================
  //
  // Bank details first: a student can only be picked once she has an account
  // on file. Most do; a few have not filled it in, which is why the picker
  // greys rows out.
  const students = db.rows('students') as Row[]
  const always = new Set<string>()
  const spreadOver = (from: number, to: number, count: number, seed: string) => rng(seed).shuffle(Array.from({ length: to - from + 1 }, (_x, i) => from + i)).slice(0, count).sort((a, b) => a - b)
  const recipients = {
    // the cast's sixteen, the hero among them
    sep: Array.from({ length: 16 }, (_x, i) => 318 + i),
    aug: spreadOver(285, 634, 24, 'incentive-aug').filter((n) => n < 318 || n > 333),
    jul: spreadOver(1, 284, 18, 'incentive-jul'),
    jun: spreadOver(1, 284, 21, 'incentive-jun'),
    may: spreadOver(1, 284, 15, 'incentive-may'),
  }
  for (const list of Object.values(recipients)) for (const n of list) always.add(studentId(n))
  // The first screenful of the picker (alphabetical) is all payable, so the
  // camera sees accounts rather than a column of "no bank details".
  const firstAlphabetical = [...students].sort((a, b) => String(a.full_name).localeCompare(String(b.full_name)) || String(a.student_no).localeCompare(String(b.student_no))).slice(0, 14)
  for (const s of firstAlphabetical) always.add(s.id)

  for (const s of students) {
    const n = Number(String(s.student_no).slice(-4))
    const r = rng('bank' + n)
    const lucky = r.chance(0.86)
    const code = r.pick(SWIFT)
    const digits = String(r.int(1000, 9999)) + String(r.int(1000, 9999)) + String(r.int(1000, 9999))
    if (!(lucky || always.has(s.id) || n === ID.hero.studentNo)) continue
    db.add('student_bank_accounts', {
      student_id: s.id,
      bank_code: code,
      bank_account_number: digits,
      account_holder_name: String(s.full_name).toUpperCase(),
      account_holder_ic: s.ic_number ?? null,
      created_at: plusMinutes(s.created_at, 60 * 26),
      updated_by: s.user_id ?? ID.user.admin,
    })
  }
  const bankOf = (sid: string) => db.lookup('student_bank_accounts', 'student_id', sid)[0] as Row | undefined

  type BatchSeed = { key: keyof typeof BATCH; title: string; created: string; sent: string | null; status: 'draft' | 'sent' | 'sending'; who: number[]; inFlight?: number[] }
  const batches: BatchSeed[] = [
    { key: 'oct', title: 'October 2026', created: day(0, '09:40'), sent: null, status: 'draft', who: [] },
    { key: 'sep', title: cast.money.incentiveBatch.title, created: day(-1, '16:18'), sent: day(-1, '16:42'), status: 'sent', who: recipients.sep, inFlight: [333] },
    { key: 'aug', title: 'August 2026', created: at('2026-09-03 10:12'), sent: at('2026-09-03 10:30'), status: 'sent', who: recipients.aug },
    { key: 'jul', title: 'July 2026', created: at('2026-08-04 15:05'), sent: at('2026-08-04 15:21'), status: 'sent', who: recipients.jul },
    { key: 'jun', title: 'June 2026', created: at('2026-07-02 11:48'), sent: at('2026-07-02 12:03'), status: 'sent', who: recipients.jun },
    { key: 'may', title: 'May 2026', created: at('2026-06-03 09:26'), sent: at('2026-06-03 09:41'), status: 'sent', who: recipients.may },
  ]
  for (const b of batches) {
    if (Date.parse(b.created) > now) continue
    const sent = b.sent && Date.parse(b.sent) <= now ? b.sent : null
    db.add('incentive_batches', {
      id: BATCH[b.key],
      title: b.title,
      description: 'Geran pengasuhan dan pendidikan awal kanak-kanak, disalurkan terus ke akaun pelajar.',
      amount_sen: INCENTIVE_SEN,
      status: sent ? b.status : 'draft',
      is_sandbox: false,
      billplz_collection_id: sent ? `demo${b.key}${String(INCENTIVE_SEN).slice(0, 3)}x` : null,
      callback_nonce: uid('nonce', b.key),
      sent_at: sent,
      created_at: b.created,
      created_by: ID.user.director,
    })
    if (!sent) continue
    b.who.forEach((n, k) => {
      const s = db.get('students', studentId(n)) as Row
      const bank = bankOf(s.id)!
      const flying = b.inFlight?.includes(n) ?? false
      const sentAt = plusMinutes(sent, k)
      db.add('incentive_payouts', {
        id: uid('payout', `${b.key}/${n}`),
        batch_id: BATCH[b.key],
        student_id: s.id,
        amount_sen: INCENTIVE_SEN,
        status: flying ? 'processing' : 'completed',
        provider_status: flying ? 'processing' : 'completed',
        failure_reason: null,
        bank_code: bank.bank_code,
        bank_account_number: bank.bank_account_number,
        bank_account_last4: String(bank.bank_account_number).slice(-4),
        account_holder_name: bank.account_holder_name,
        billplz_payment_order_id: `demo-po-${b.key}-${k + 1}`,
        sent_at: sentAt,
        completed_at: flying ? null : plusMinutes(sentAt, 2 + k),
        created_at: plusMinutes(b.created, 3 + k),
      })
    })
  }

  db.rpc('incentive_candidates', (args, c) => {
    if (!c.isAdmin) throw db.fail('Only an academy admin can list incentive candidates', { code: 'P0001' })
    const onCourse = args._course ? new Set(db.lookup('enrollments', 'course_id', args._course).filter((e) => e.status === 'active').map((e) => e.student_id)) : null
    return students
      .filter((s) => !s.archived_at && (!onCourse || onCourse.has(s.id)))
      .sort((a, b) => String(a.full_name ?? '￿').localeCompare(String(b.full_name ?? '￿')) || String(a.student_no).localeCompare(String(b.student_no)))
      .map((s) => {
        const bank = bankOf(s.id)
        return {
          student_id: s.id,
          full_name: s.full_name,
          student_no: s.student_no,
          email: s.email,
          status: s.status,
          has_bank: !!bank,
          bank_code: bank?.bank_code ?? null,
          masked_account: bank ? '••••' + String(bank.bank_account_number).slice(-4) : null,
        }
      })
  })

  db.rpc('create_incentive_batch', (args, c) => {
    const id = uid('incentive-batch', `live/${db.rows('incentive_batches').length + 1}`)
    if (db.applyWrites) db.add('incentive_batches', { id, title: args._title, description: args._description ?? null, amount_sen: args._amount_sen, status: 'draft', created_at: c.now.toISOString(), created_by: c.userId })
    return id
  })
  db.rpc('set_incentive_recipients', (args) => {
    const ids: string[] = args._student_ids ?? []
    const payable = ids.filter((sid) => !!bankOf(sid))
    const batch = db.byId('incentive_batches', args._batch) as Row | null
    if (batch) {
      // The list is what the page reads back, so it is kept even when writes are not.
      db.remove('incentive_payouts', (p) => p.batch_id === batch.id)
      payable.forEach((sid, k) => {
        const bank = bankOf(sid)!
        db.add('incentive_payouts', {
          id: uid('payout', `live/${batch.id}/${k}`),
          batch_id: batch.id,
          student_id: sid,
          amount_sen: batch.amount_sen,
          status: 'pending',
          bank_code: bank.bank_code,
          bank_account_number: bank.bank_account_number,
          bank_account_last4: String(bank.bank_account_number).slice(-4),
          account_holder_name: bank.account_holder_name,
          created_at: plusMinutes(db.now().toISOString(), 0),
        })
      })
    }
    return { recipients: payable.length, skipped: ids.length - payable.length }
  })
  db.rpc('delete_incentive_batch', () => null)
  // Billplz is not on the set either: a send completes at once.
  db.fn('billplz-disburse', (body) => {
    const batch = db.byId('incentive_batches', body?.batch_id) as Row | null
    const rows = batch ? (db.where('incentive_payouts', (p) => p.batch_id === batch.id && p.status === 'pending') as Row[]) : []
    const t = db.now().toISOString()
    for (const p of rows) Object.assign(p, { status: 'processing', provider_status: 'processing', billplz_payment_order_id: `demo-po-live-${p.id.slice(-4)}`, sent_at: t })
    if (batch) Object.assign(batch, { status: 'sent', sent_at: t })
    db.touch()
    return { ok: true, processed: rows.length, failed: 0, remaining: 0, batch_status: 'sent' }
  })
  db.fn('billplz-payout-status', (body) => {
    const rows = db.where('incentive_payouts', (p) => p.batch_id === body?.batch_id && p.status === 'processing') as Row[]
    return { ok: true, checked: rows.length, updated: 0, remaining_open: rows.length }
  })
  db.fn('billplz-connect', () => ({ ok: true, last4: 'demo', is_sandbox: false, enabled: true, limit_sen: rm(25_000) }))
  db.fn('toyyibpay-connect', () => ({ ok: true, has_secret: true, last4: 'demo', category_code: 'hawary-demo', is_sandbox: false, enabled: true }))

  // A student may read the batch she was paid from (the recovery migration).
  db.policy('incentive_batches', (b, c) => c.isAdmin || (!!c.studentId && db.rows('incentive_payouts').some((p) => p.batch_id === b.id && p.student_id === c.studentId)), { replace: true })

  // =========================================================================
  // The learner — Nur Aisyah Razak
  // =========================================================================

  // --- A longer first note. base's text, word for word, then two more sections.
  {
    const note = db.byId('notes', ID.content.siri3.week1.notes[0]) as Row | null
    if (note && !String(note.content).includes('Peranan pengasuh')) {
      note.content =
        String(note.content) +
        '<h3>Peranan pengasuh</h3>' +
        '<p>Pengasuh bukan sekadar menjaga keselamatan kanak-kanak. Setiap rutin harian — menyusu, menukar lampin, waktu makan dan waktu bermain — ialah peluang untuk merangsang perkembangan. Bercakap dengan bayi semasa menguruskannya membina perbendaharaan kata; memberi masa untuk kanak-kanak mencuba sendiri membina keyakinan.</p>' +
        '<ol><li><strong>Perhati</strong> — catat apa yang kanak-kanak boleh lakukan hari ini, bukan apa yang sepatutnya.</li>' +
        '<li><strong>Rancang</strong> — pilih aktiviti yang sedikit lebih mencabar daripada kebolehan semasa.</li>' +
        '<li><strong>Rekod</strong> — simpan nota pemerhatian dan gambar sebagai bukti untuk portfolio.</li></ol>' +
        '<h3>Bila perlu merujuk</h3>' +
        '<p>Maklumkan ibu bapa dan penyelia jika kanak-kanak belum mencapai beberapa peringkat penting dalam domain yang sama, atau kehilangan kemahiran yang pernah dikuasai. Rujukan awal kepada klinik kesihatan memberi peluang intervensi yang lebih berkesan.</p>' +
        '<blockquote><p>“Kanak-kanak tidak perlu dipaksa untuk berkembang — mereka perlu diberi ruang, masa dan perhatian.”</p></blockquote>'
      db.touch()
    }
  }

  // --- Kuiz 1, attempt 1. base's bell already says how it ended: 18 / 20,
  // marked yesterday at 16:32. Before 16:31 she is still inside it.
  {
    const kuiz = db.get('assessments', ID.content.siri3.week1.assessment) as Row
    const questions = (db.where('assessment_questions', { assessment_id: kuiz.id }) as Row[]).sort((a, b) => a.sort_order - b.sort_order)
    const started = at('2026-10-06 16:13:40')
    const submitted = at('2026-10-06 16:31:12')
    const WRONG = 6 // "Refleks genggaman…" — the one she missed
    const answerTo = (q: Row, qi: number) => {
      if (q.question_type === 'true_false') return q.correct_answer as boolean
      const choices: { id: string }[] = q.options?.choices ?? []
      if (qi === WRONG) return [choices.find((ch) => ch.id !== q.correct_answer[0])!.id]
      return [...(q.correct_answer as string[])]
    }
    if (now >= Date.parse(started)) {
      const done = now >= Date.parse(submitted)
      // One answer roughly every 100 seconds while the attempt is open.
      const answered = done ? questions.length : Math.min(questions.length, Math.max(1, Math.floor((now - Date.parse(started)) / 100_000) - 3))
      const answers: Row = {}
      questions.slice(0, answered).forEach((q, qi) => (answers[q.id] = answerTo(q, qi)))
      db.add('assessment_attempts', {
        id: HERO_ATTEMPT,
        assessment_id: kuiz.id,
        student_id: ID.hero.student,
        attempt_no: 1,
        status: done ? 'graded' : 'in_progress',
        answers,
        started_at: started,
        submitted_at: done ? submitted : null,
        score: done ? 18 : null,
        max_score: done ? 20 : null,
        graded_at: done ? plusMinutes(submitted, 1) : null,
        created_at: started,
      })
    }
  }

  // --- Tugasan 1: opened this morning after the reminder, saved as a draft.
  if (now >= Date.parse(day(0, '08:24'))) {
    db.add('assignment_submissions', {
      id: uid('submission', 'aisyah/tugasan1'),
      assignment_id: ID.content.siri3.week1.assignment,
      student_id: ID.hero.student,
      status: 'draft',
      content: 'Rancangan aktiviti harian — kumpulan 3–4 tahun, TASKA Permata Kasih.\n\nSlot 1 (8.30 pagi): Senaman pagi dan lagu pergerakan. Objektif: kemahiran motor kasar dan mengikut arahan dua langkah.',
      created_at: day(0, '08:24'),
    })
  }

  // --- attempts are RPC-only on the learner side; correct_answer never leaves.
  const attemptPayload = (a: Row) => {
    const asm = db.get('assessments', a.assessment_id) as Row
    const qs = (db.where('assessment_questions', { assessment_id: asm.id }) as Row[]).sort((x, y) => x.sort_order - y.sort_order)
    return {
      attempt: {
        id: a.id,
        assessment_id: a.assessment_id,
        attempt_no: a.attempt_no,
        status: a.status,
        answers: a.answers ?? {},
        started_at: a.started_at,
        submitted_at: a.submitted_at,
        score: a.score,
        max_score: a.max_score,
        expires_at: asm.duration_minutes ? plusMinutes(a.started_at, asm.duration_minutes) : null,
      },
      assessment: {
        id: asm.id,
        title: asm.title,
        instructions: asm.instructions,
        total_points: asm.total_points,
        duration_minutes: asm.duration_minutes,
        max_attempts: asm.max_attempts,
        course_id: asm.course_id,
      },
      questions: qs.map((q) => ({ id: q.id, question_type: q.question_type, prompt: q.prompt, points: q.points, sort_order: q.sort_order, options: q.options })),
    }
  }
  const myAttempt = (id: string, c: Ctx) => {
    const a = db.byId('assessment_attempts', id) as Row | null
    if (!a || !(c.isStaff || a.student_id === c.studentId)) throw db.fail('Attempt not found', { code: 'P0002', status: 404 })
    return a
  }
  db.rpc('get_attempt', (args, c) => attemptPayload(myAttempt(args._attempt_id, c)))
  db.rpc('start_attempt', (args, c) => {
    if (!c.studentId) throw db.fail('Only a student can start an attempt', { code: '42501' })
    const mine = db.where('assessment_attempts', { assessment_id: args._assessment_id, student_id: c.studentId }) as Row[]
    const open = mine.find((a) => a.status === 'in_progress')
    if (open) return attemptPayload(open)
    const t = c.now.toISOString()
    const [row] = db.add('assessment_attempts', {
      id: uid('attempt', `live/${c.studentId}/${args._assessment_id}/${mine.length + 1}`),
      assessment_id: args._assessment_id,
      student_id: c.studentId,
      attempt_no: mine.length + 1,
      status: 'in_progress',
      answers: {},
      started_at: t,
      created_at: t,
    })
    return attemptPayload(row as Row)
  })
  db.rpc('save_attempt_answers', (args, c) => {
    const a = myAttempt(args._attempt_id, c)
    if (a.status !== 'in_progress') throw db.fail('This attempt has already been submitted')
    a.answers = args._answers ?? {}
    db.touch()
    return attemptPayload(a)
  })
  db.rpc('submit_attempt', (args, c) => {
    const a = myAttempt(args._attempt_id, c)
    const qs = db.where('assessment_questions', { assessment_id: a.assessment_id }) as Row[]
    let score = 0
    let max = 0
    for (const q of qs) {
      max += q.points
      if (JSON.stringify((a.answers ?? {})[q.id]) === JSON.stringify(q.correct_answer)) score += q.points
    }
    Object.assign(a, { status: 'graded', submitted_at: c.now.toISOString(), score, max_score: max, graded_at: c.now.toISOString() })
    db.touch()
    return attemptPayload(a)
  })

  // --- Sessions. The bell says she booked hers at 20:15 last night; before
  // that the appointment does not exist and the week of 12 Oct is still open
  // to her (the academy allows one session a week).
  const heroAppt = uid('appointment', '6/10:00/hajar')
  {
    const booked = day(-1, '20:14')
    const row = db.byId('appointments', heroAppt) as Row | null
    if (row) {
      row.created_at = booked
      if (now < Date.parse(booked)) db.remove('appointments', heroAppt)
      db.touch()
    }
  }

  const bookableStudent = (c: Ctx) => {
    if (!c.studentId) throw db.fail('You do not have a student record in this academy', { code: 'P0001' })
    return c.studentId
  }

  db.rpc('get_my_appointments', (_args, c) => {
    if (!c.studentId) return []
    return (db.lookup('appointments', 'student_id', c.studentId) as Row[])
      .sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at))
      .map((a) => {
        const i = db.byId('instructors', a.instructor_id) as Row | null
        return {
          id: a.id,
          starts_at: a.starts_at,
          ends_at: a.ends_at,
          status: a.status,
          note: a.note,
          cancel_reason: a.cancel_reason,
          instructor: { id: i?.id ?? a.instructor_id, full_name: i?.full_name ?? null, avatar_url: i?.avatar_url ?? null, specialization: i?.specialization ?? null },
        }
      })
  })

  /** Monday of the Malaysian week an instant falls in, as 'YYYY-MM-DD'. */
  const weekOf = (isoInstant: string) => {
    const local = new Date(Date.parse(isoInstant) + MYT)
    const dow = (local.getUTCDay() + 6) % 7
    return iso(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - dow)).slice(0, 10)
  }

  // app.booking_slots + get_booking_options, in the same order the SQL does it.
  db.rpc('get_booking_options', (args, c) => {
    const me = bookableStudent(c)
    const cfg = (db.rows('academy_booking_settings') as Row[])[0]
    if (!cfg || !cfg.is_open) return { is_open: false, slots: [] }
    const t = c.now.getTime()
    const len = cfg.slot_minutes * 60_000
    const lo = t + cfg.min_notice_hours * 3_600_000
    const hi = t + cfg.horizon_days * MS_DAY
    const from = Date.parse(`${args._from}T00:00:00+08:00`)
    const days = Math.min(62, Math.round((Date.parse(`${args._to}T00:00:00+08:00`) - from) / MS_DAY))
    const teachers = (db.rows('instructors') as Row[]).filter((i) => i.is_bookable && i.status === 'active' && !i.archived_at)
    const hours = db.rows('booking_hours') as Row[]
    const off = db.rows('booking_time_off') as Row[]
    const taken = (db.rows('appointments') as Row[]).filter((a) => a.status === 'booked' || a.status === 'completed')
    const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) => aStart < bEnd && bStart < aEnd
    const mins = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))

    const free = new Map<number, Set<string>>()
    for (let n = 0; n <= days; n++) {
      const dayStart = from + n * MS_DAY
      const weekday = new Date(dayStart + MYT).getUTCDay()
      for (const h of hours) {
        if (h.weekday !== weekday) continue
        for (let s = dayStart + mins(h.start_time) * 60_000; s + len <= dayStart + mins(h.end_time) * 60_000; s += len) {
          if (s < lo || s >= hi) continue
          for (const teacher of teachers) {
            if (off.some((o) => (!o.instructor_id || o.instructor_id === teacher.id) && overlaps(Date.parse(o.starts_at), Date.parse(o.ends_at), s, s + len))) continue
            if (taken.some((a) => a.instructor_id === teacher.id && overlaps(Date.parse(a.starts_at), Date.parse(a.ends_at), s, s + len))) continue
            const set = free.get(s) ?? new Set<string>()
            set.add(teacher.id)
            free.set(s, set)
          }
        }
      }
    }

    // Weeks she has already used, over every session she holds.
    const used = new Map<string, number>()
    for (const a of taken) if (a.student_id === me) used.set(weekOf(a.starts_at), (used.get(weekOf(a.starts_at)) ?? 0) + 1)
    const cap: number | null = cfg.max_per_week_per_student ?? null

    const slots = [...free.entries()]
      .sort((a, b) => a[0] - b[0])
      .filter(([s]) => cap === null || (used.get(weekOf(iso(s))) ?? 0) < cap)
      .map(([s, ids]) => ({
        starts_at: iso(s),
        ends_at: iso(s + len),
        capacity: ids.size,
        instructors:
          cfg.assignment_mode === 'student_choice'
            ? teachers
                .filter((i) => ids.has(i.id))
                .sort((a, b) => String(a.full_name).localeCompare(String(b.full_name)))
                .map((i) => ({ id: i.id, full_name: i.full_name, avatar_url: i.avatar_url ?? null }))
            : null,
      }))

    return {
      is_open: true,
      assignment_mode: cfg.assignment_mode,
      slot_minutes: cfg.slot_minutes,
      max_open_per_student: cfg.max_open_per_student,
      max_per_week_per_student: cfg.max_per_week_per_student,
      open_count: taken.filter((a) => a.student_id === me && a.status === 'booked' && Date.parse(a.starts_at) > t).length,
      slots,
    }
  })

  db.rpc('book_appointment', (args, c) => {
    const me: string = c.isStaff && args._student_id ? args._student_id : bookableStudent(c)
    const cfg = (db.rows('academy_booking_settings') as Row[])[0]
    const starts = new Date(args._starts_at).toISOString()
    const ends = plusMinutes(starts, cfg?.slot_minutes ?? 60)
    const pool = (db.rows('instructors') as Row[]).filter((i) => i.is_bookable && i.status === 'active')
    const who = (args._instructor_id ? pool.find((i) => i.id === args._instructor_id) : pool[0]) ?? pool[0]
    const id = uid('appointment', `live/${me}/${starts}`)
    if (db.applyWrites) {
      db.add('appointments', { id, instructor_id: who.id, student_id: me, starts_at: starts, ends_at: ends, status: 'booked', note: args._note ?? null, auto_assigned: !args._instructor_id, created_at: c.now.toISOString(), created_by: c.userId })
    }
    return { id, starts_at: starts, ends_at: ends, auto_assigned: !args._instructor_id, instructor: { id: who.id, full_name: who.full_name, avatar_url: who.avatar_url ?? null } }
  })
  db.rpc('cancel_appointment', (args) => {
    const a = db.byId('appointments', args._appointment_id ?? args._id) as Row | null
    if (a && db.applyWrites) {
      a.status = 'cancelled'
      db.touch()
    }
    return { id: a?.id ?? null, status: 'cancelled', reassigned: false }
  })

  void studentUserId
}
