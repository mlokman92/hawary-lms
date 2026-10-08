// The fake database: tables in memory, plus everything a partition can hang
// on them — defaults, RLS-like policies, views, RPC and Edge Function handlers,
// personas. No dependencies; runs in the browser bundle, in Metro and in Node.

import type { Database } from '../../../../packages/shared/src/db/database.types'
import { ENUMS, FUNCTIONS, TABLES, VIEWS, type Rel, type TableSchema } from './schema.gen'
import { ACADEMY_ID, uid } from './ids.js'
import { at } from './kit'
import { Query } from './query'

export type Row = Record<string, any>

type PublicTables = Database['public']['Tables']
export type TableName = keyof PublicTables & string
/** The generated row type of a table: RowOf<'students'>. */
export type RowOf<T extends string> = T extends TableName ? PublicTables[T]['Row'] : Row
/** What `db.add` accepts: any subset of the row; the rest is filled in. */
export type Seed<T extends string> = Partial<RowOf<T>> & Row

export type PersonaDef = {
  /** What goes in `?as=` */
  key: string
  /** null = signed out */
  userId: string | null
  email?: string
  fullName?: string
  /** A one-line description for the README and the harness console. */
  label?: string
}

/** Who is asking. Handed to every policy, view, RPC and Edge Function handler. */
export type Ctx = {
  db: FakeDb
  persona: PersonaDef | null
  userId: string | null
  email: string | null
  academyId: string
  /** The caller's active membership in the academy, if any. */
  member: Row | null
  role: 'admin' | 'trainer' | 'student' | null
  isStaff: boolean
  isAdmin: boolean
  isDirector: boolean
  /** students.id of the caller's own student record (student persona). */
  studentId: string | null
  /** instructors.id of the caller's own instructor record (trainer persona). */
  instructorId: string | null
  /** The film's clock. */
  now: Date
}

export type Policy = (row: Row, ctx: Ctx) => boolean
export type RpcHandler = (args: Row, ctx: Ctx) => unknown
export type FnHandler = (body: any, ctx: Ctx, options: Row) => unknown
export type ViewFn = (ctx: Ctx) => Row[]
export type StorageUrlFn = (bucket: string, path: string, kind: 'public' | 'signed') => string
export type Relation = {
  /** true = the embed is an array (one-to-many) */
  many: boolean
  /** the table the embedded rows come from */
  table: string
  /** [column on the parent row, column on the embedded row] */
  pairs: [string, string][]
}

/** Throw from a handler (or `db.fail()`) to answer with a PostgREST-style error. */
export class FakeError extends Error {
  code: string
  details: string | null
  hint: string | null
  status: number
  constructor(message: string, extra: { code?: string; details?: string; hint?: string; status?: number } = {}) {
    super(message)
    this.name = 'FakeError'
    this.code = extra.code ?? 'P0001'
    this.details = extra.details ?? null
    this.hint = extra.hint ?? null
    this.status = extra.status ?? 400
  }
}

/** Database column defaults worth having when a seed row leaves them out. */
const DB_DEFAULTS: Record<string, Row> = {
  academies: { country: 'MY', currency: 'MYR', timezone: 'Asia/Kuala_Lumpur', status: 'active', sst_registered: false },
  academy_members: { status: 'active', role: 'student', is_director: false },
  academy_invitations: { status: 'pending', role: 'student' },
  academy_booking_settings: { assignment_mode: 'student_choice', horizon_days: 30, is_open: true, min_notice_hours: 24, slot_minutes: 60 },
  academy_enrollment_settings: { is_open: true },
  academy_payment_settings: { provider: 'toyyibpay', allow_partial_payment: true },
  appointments: { status: 'booked', auto_assigned: false },
  assessment_attempts: { status: 'submitted', attempt_no: 1 },
  assessment_questions: { question_type: 'single_choice', points: 1 },
  assessments: { instructions: [], max_attempts: 1, type: 'quiz', is_published: false },
  assignment_submissions: { status: 'submitted' },
  assignments: { instructions: [], total_points: 100, allow_late: false, is_published: false },
  course_enrollment_settings: { is_open: true },
  course_materials: { is_published: true },
  course_modules: { is_published: true },
  courses: { currency: 'MYR', status: 'draft' },
  enrollments: { status: 'active' },
  incentive_batches: { status: 'draft', is_sandbox: false, callback_nonce: '' },
  incentive_payouts: { status: 'pending' },
  instructors: { status: 'active', is_bookable: false, is_report_checker: false },
  invoices: { currency: 'MYR', status: 'issued', tax_sen: 0 },
  invoice_items: { quantity: 1 },
  notes: { body: [], content: '', is_published: false },
  notifications: { data: {} },
  payment_intents: { provider: 'toyyibpay', status: 'pending', needs_reconciliation: false, charge_to_payor: false, fee_sen: 0 },
  payments: { currency: 'MYR', status: 'succeeded', provider: 'manual', method: 'fpx' },
  report_events: { kind: 'comment', actor_role: 'student' },
  report_submissions: { status: 'submitted', version: 1, auto_assigned: true },
  students: { status: 'active' },
}

const DEFAULT_CREATED_AT = at('2026-04-01 09:00')

export class FakeDb {
  readonly academyId = ACADEMY_ID
  /** Names of the partitions that have been applied, in order. */
  readonly loaded: string[] = []
  /** false (default): writes answer successfully and change nothing. true: they change the in-memory tables. */
  applyWrites = false
  /** true: every call is console.debug'ed and kept in `calls`. */
  trace = false
  readonly calls: Row[] = []
  /** Resolves when every requested partition has been applied. The harness sets it. */
  ready: Promise<void> = Promise.resolve()

  private tables = new Map<string, Row[]>()
  private extraSchema = new Map<string, TableSchema>()
  private tableDefaults = new Map<string, (Row | ((row: Row, db: FakeDb) => Row))[]>()
  private policies = new Map<string, Policy[]>()
  private views = new Map<string, ViewFn>()
  private rpcs = new Map<string, RpcHandler>()
  private fns = new Map<string, FnHandler>()
  private personaMap = new Map<string, PersonaDef>()
  private storageUrlFn: StorageUrlFn = (bucket, path) => `about:blank#${bucket}/${path}`
  private seq = new Map<string, number>()
  private version = 0
  private indexes = new Map<string, { version: number; size: number; map: Map<string, Row[]> }>()
  private relCache = new Map<string, Relation | null>()
  private warned = new Set<string>()
  private afterLoadFns: (() => void)[] = []

  // -------------------------------------------------------------------------
  // Schema
  // -------------------------------------------------------------------------

  schemaOf(table: string): TableSchema | null {
    return this.extraSchema.get(table) ?? TABLES[table] ?? VIEWS[table] ?? null
  }

  /** Declare a table (or extra relationships) the generated types do not know. */
  declare(table: string, schema: Partial<TableSchema>): void {
    const base = this.schemaOf(table) ?? { cols: {}, rels: [] }
    this.extraSchema.set(table, {
      cols: { ...base.cols, ...(schema.cols ?? {}) },
      rels: [...base.rels, ...(schema.rels ?? [])],
    })
    this.relCache.clear()
  }

  isKnown(table: string): boolean {
    return !!this.schemaOf(table) || this.tables.has(table) || this.views.has(table)
  }

  isKnownFunction(name: string): boolean {
    return FUNCTIONS.includes(name)
  }

  // -------------------------------------------------------------------------
  // Rows
  // -------------------------------------------------------------------------

  /** The live array behind a table. Push to it if you must; `add` is safer. */
  rows<T extends string>(table: T): RowOf<T>[] {
    let list = this.tables.get(table)
    if (!list) {
      list = []
      this.tables.set(table, list)
    }
    return list as RowOf<T>[]
  }

  /**
   * Table defaults, applied by `add` before the built-in ones. A function gets
   * the half-built row, for a default that depends on another column.
   */
  defaults(table: string, value: Row | ((row: Row, db: FakeDb) => Row)): void {
    const list = this.tableDefaults.get(table) ?? []
    list.push(value)
    this.tableDefaults.set(table, list)
  }

  private nextSeq(table: string): number {
    const n = (this.seq.get(table) ?? 0) + 1
    this.seq.set(table, n)
    return n
  }

  /** A complete row: the seed, then table defaults, then nulls / zeroes per the schema. */
  fill<T extends string>(table: T, seed: Seed<T>): RowOf<T> {
    const schema = this.schemaOf(table)
    const row: Row = {}
    for (const [k, v] of Object.entries(seed)) if (v !== undefined) row[k] = v
    for (const d of this.tableDefaults.get(table) ?? []) {
      const obj = typeof d === 'function' ? d(row, this) : d
      for (const [k, v] of Object.entries(obj)) if (row[k] === undefined) row[k] = v
    }
    for (const [k, v] of Object.entries(DB_DEFAULTS[table] ?? {})) {
      if (row[k] === undefined) row[k] = Array.isArray(v) ? [...v] : v
    }
    if (!schema) return row as RowOf<T>
    for (const [col, kind] of Object.entries(schema.cols)) {
      if (row[col] !== undefined) continue
      if (col === 'id' && kind === 'string') row[col] = uid('auto:' + table, this.nextSeq(table))
      else if (col === 'id') row[col] = this.nextSeq(table)
      else if (col === 'academy_id') row[col] = ACADEMY_ID
      else if (col === 'created_at') row[col] = DEFAULT_CREATED_AT
      else if (col === 'updated_at') row[col] = row.created_at ?? DEFAULT_CREATED_AT
      else if (kind.startsWith('?')) row[col] = null
      else if (kind === 'boolean') row[col] = false
      else if (kind === 'number') row[col] = 0
      else if (kind === 'string') row[col] = ''
      else if (kind === 'array') row[col] = []
      else if (kind.startsWith('enum:')) row[col] = ENUMS[kind.slice(5)]?.[0] ?? null
      else row[col] = null
    }
    // created_at may have been defaulted after updated_at was visited.
    if (schema.cols.updated_at && seed.updated_at === undefined && seed.created_at !== undefined) {
      row.updated_at = seed.created_at
    }
    return row as RowOf<T>
  }

  /** Append rows (filled in) and return them as stored. */
  add<T extends string>(table: T, seeds: Seed<T> | Seed<T>[]): RowOf<T>[] {
    const list = this.rows(table) as Row[]
    const out: RowOf<T>[] = []
    for (const seed of Array.isArray(seeds) ? seeds : [seeds]) {
      const row = this.fill(table, seed)
      list.push(row as Row)
      out.push(row)
    }
    this.touch()
    return out
  }

  private matcher(where: Row | ((row: Row) => boolean) | string): (row: Row) => boolean {
    if (typeof where === 'function') return where as (row: Row) => boolean
    if (typeof where === 'string') return (r) => r.id === where
    const entries = Object.entries(where)
    return (r) => entries.every(([k, v]) => r[k] === v)
  }

  /** Rows matching an id, a `{col: value}` object or a predicate. No policies. */
  where<T extends string>(table: T, where: Seed<T> | ((row: RowOf<T>) => boolean) | string): RowOf<T>[] {
    return (this.rows(table) as Row[]).filter(this.matcher(where as Row)) as RowOf<T>[]
  }

  find<T extends string>(table: T, where: Seed<T> | ((row: RowOf<T>) => boolean) | string): RowOf<T> | undefined {
    return (this.rows(table) as Row[]).find(this.matcher(where as Row)) as RowOf<T> | undefined
  }

  /** Like `find`, but a miss is a loud error — a typo in a seed should not become an empty screen. */
  get<T extends string>(table: T, where: Seed<T> | ((row: RowOf<T>) => boolean) | string): RowOf<T> {
    const row = this.find(table, where)
    if (!row) throw new Error(`[fake] ${table}: no row for ${typeof where === 'function' ? 'predicate' : JSON.stringify(where)}`)
    return row
  }

  /** Change rows in place. Returns how many matched. */
  patch<T extends string>(table: T, where: Seed<T> | ((row: RowOf<T>) => boolean) | string, patch: Seed<T>): number {
    const rows = this.where(table, where) as Row[]
    for (const r of rows) Object.assign(r, patch)
    this.touch()
    return rows.length
  }

  /** Delete rows. Returns how many went. */
  remove<T extends string>(table: T, where: Seed<T> | ((row: RowOf<T>) => boolean) | string): number {
    const list = this.rows(table) as Row[]
    const match = this.matcher(where as Row)
    let n = 0
    for (let i = list.length - 1; i >= 0; i--) {
      if (match(list[i])) {
        list.splice(i, 1)
        n++
      }
    }
    this.touch()
    return n
  }

  /** Rows by one column, through a cached index. `byId` is the common case. */
  lookup(table: string, col: string, value: unknown): Row[] {
    if (value === null || value === undefined) return []
    if (this.views.has(table)) return []
    const list = this.rows(table) as Row[]
    const key = `${table}.${col}`
    let idx = this.indexes.get(key)
    if (!idx || idx.version !== this.version || idx.size !== list.length) {
      const map = new Map<string, Row[]>()
      for (const r of list) {
        const v = r[col]
        if (v === null || v === undefined) continue
        const k = String(v)
        const bucket = map.get(k)
        if (bucket) bucket.push(r)
        else map.set(k, [r])
      }
      idx = { version: this.version, size: list.length, map }
      this.indexes.set(key, idx)
    }
    return idx.map.get(String(value)) ?? []
  }

  byId<T extends string>(table: T, id: string | null | undefined): RowOf<T> | null {
    return (this.lookup(table, 'id', id)[0] as RowOf<T> | undefined) ?? null
  }

  /** Call after mutating rows behind the API's back (pushing to `rows()`, editing in place). */
  touch(): void {
    this.version++
  }

  /**
   * A query that bypasses the policies — the service role. For handlers:
   *   const rows = db.from('invoices').select('*, student:students(full_name)').eq('status', 'paid').rows()
   */
  from<T extends string>(table: T): Query {
    return new Query(this, table, () => this.ctx(null), { bypass: true })
  }

  // -------------------------------------------------------------------------
  // Views, policies, handlers
  // -------------------------------------------------------------------------

  /** A computed table. Read like any other; rebuilt on each query. */
  view(name: string, fn: ViewFn): void {
    this.views.set(name, fn)
  }

  viewRows(name: string, ctx: Ctx): Row[] | null {
    const fn = this.views.get(name)
    return fn ? fn(ctx) : null
  }

  /**
   * Row-level security, roughly: a row is readable when every policy on its
   * table says yes. `{ replace: true }` drops the earlier ones first.
   * Signed-out callers see nothing through `supabase.from()` regardless.
   */
  policy(table: string, fn: Policy, opts: { replace?: boolean } = {}): void {
    const list = opts.replace ? [] : (this.policies.get(table) ?? [])
    list.push(fn)
    this.policies.set(table, list)
  }

  visible(table: string, rows: Row[], ctx: Ctx): Row[] {
    if (!ctx.userId) return []
    const list = this.policies.get(table)
    if (!list || list.length === 0) return rows
    return rows.filter((r) => list.every((p) => p(r, ctx)))
  }

  /** Answer `supabase.rpc(name, args)`. Return the data; throw `db.fail()` for an error. A later partition overrides an earlier one. */
  rpc(name: string, handler: RpcHandler): void {
    this.rpcs.set(name, handler)
  }

  rpcHandler(name: string): RpcHandler | undefined {
    return this.rpcs.get(name)
  }

  /** Answer `supabase.functions.invoke(name, { body })`. */
  fn(name: string, handler: FnHandler): void {
    this.fns.set(name, handler)
  }

  fnHandler(name: string): FnHandler | undefined {
    return this.fns.get(name)
  }

  /** Where `storage.from(bucket).getPublicUrl / createSignedUrl` point. */
  storageUrl(fn: StorageUrlFn): void {
    this.storageUrlFn = fn
  }

  urlFor(bucket: string, path: string, kind: 'public' | 'signed'): string {
    return this.storageUrlFn(bucket, path, kind)
  }

  /** `throw db.fail('Not allowed', { code: '42501' })` inside a handler. */
  fail(message: string, extra: { code?: string; details?: string; hint?: string; status?: number } = {}): FakeError {
    return new FakeError(message, extra)
  }

  /** Run once after every partition has been applied — for things derived from the whole world. */
  afterLoad(fn: () => void): void {
    this.afterLoadFns.push(fn)
  }

  runAfterLoad(): void {
    for (const fn of this.afterLoadFns.splice(0)) {
      try {
        fn()
      } catch (e) {
        console.error('[fake] afterLoad failed', e)
      }
    }
    this.touch()
  }

  // -------------------------------------------------------------------------
  // Personas
  // -------------------------------------------------------------------------

  /** Register (or replace) somebody who can be signed in with `?as=<key>`. */
  persona(def: PersonaDef): void {
    this.personaMap.set(def.key, def)
  }

  personaOf(key: string | null | undefined): PersonaDef | null {
    if (!key) return null
    return this.personaMap.get(key) ?? null
  }

  get personas(): PersonaDef[] {
    return [...this.personaMap.values()]
  }

  /** The film's clock (the harness shifts `Date`, so this is simply now). */
  now(): Date {
    return new Date()
  }

  /** Who a persona is, in the terms policies and handlers ask about. */
  ctx(persona: PersonaDef | null): Ctx {
    const userId = persona?.userId ?? null
    let member: Row | null = null
    let studentId: string | null = null
    let instructorId: string | null = null
    if (userId) {
      const mine = (this.rows('academy_members') as Row[]).filter(
        (m) => m.user_id === userId && m.academy_id === ACADEMY_ID && m.status === 'active',
      )
      member = mine.find((m) => m.role !== 'student') ?? mine[0] ?? null
      studentId = (this.lookup('students', 'user_id', userId)[0]?.id as string | undefined) ?? null
      instructorId = (this.lookup('instructors', 'user_id', userId)[0]?.id as string | undefined) ?? null
    }
    const role = (member?.role as Ctx['role']) ?? null
    return {
      db: this,
      persona,
      userId,
      email: persona?.email ?? null,
      academyId: ACADEMY_ID,
      member,
      role,
      isStaff: role === 'admin' || role === 'trainer',
      isAdmin: role === 'admin',
      isDirector: role === 'admin' && member?.is_director === true,
      studentId,
      instructorId,
      now: this.now(),
    }
  }

  // -------------------------------------------------------------------------
  // Relationships (for embedded selects)
  // -------------------------------------------------------------------------

  /**
   * How `child` embeds into `parent`, from the generated foreign keys.
   * `hints` are the `!name` parts of the select (`students!invoices_student_id_fkey`
   * or `profiles!created_by`): a constraint name or a column name.
   */
  relation(parent: string, child: string, hints: string[] = []): Relation | null {
    const key = `${parent}>${child}>${hints.join(',')}`
    if (this.relCache.has(key)) return this.relCache.get(key) ?? null
    const matches = (r: Rel) => hints.length === 0 || hints.some((h) => r.fk === h || r.cols.includes(h))
    const forward = (this.schemaOf(parent)?.rels ?? []).filter((r) => r.to === child && matches(r))
    const reverse = (this.schemaOf(child)?.rels ?? []).filter((r) => r.to === parent && matches(r))
    let rel: Relation | null = null
    if (forward.length > 0) {
      // Prefer the constraint that is not just the tenant column.
      const pick = forward.find((r) => r.cols.some((c) => c !== 'academy_id')) ?? forward[0]
      rel = { many: false, table: child, pairs: pick.cols.map((c, i) => [c, pick.toCols[i]] as [string, string]) }
      if (forward.length > 1 && hints.length === 0) this.warnOnce(`ambiguous embed ${parent} -> ${child}: using ${pick.fk}; add a !hint to choose`)
    } else if (reverse.length > 0) {
      const pick = reverse.find((r) => r.cols.some((c) => c !== 'academy_id')) ?? reverse[0]
      rel = { many: !pick.one, table: child, pairs: pick.cols.map((c, i) => [pick.toCols[i], c] as [string, string]) }
      if (reverse.length > 1 && hints.length === 0) this.warnOnce(`ambiguous embed ${parent} <- ${child}: using ${pick.fk}; add a !hint to choose`)
    }
    this.relCache.set(key, rel)
    return rel
  }

  /** The rows of `rel.table` that belong to one parent row. No policies. */
  related(rel: Relation, parentRow: Row, ctx: Ctx): Row[] {
    // Join on the most selective column: anything but the tenant id.
    const lead = rel.pairs.find(([, c]) => c !== 'academy_id') ?? rel.pairs[0]
    const v = parentRow[lead[0]]
    if (v === null || v === undefined) return []
    const view = this.viewRows(rel.table, ctx)
    const candidates = view ? view.filter((r) => String(r[lead[1]]) === String(v)) : this.lookup(rel.table, lead[1], v)
    if (rel.pairs.length === 1) return candidates
    return candidates.filter((r) => rel.pairs.every(([p, c]) => r[c] !== null && r[c] !== undefined && String(r[c]) === String(parentRow[p])))
  }

  warnOnce(message: string): void {
    if (this.warned.has(message)) return
    this.warned.add(message)
    console.error(`[fake] ${message}`)
  }

  record(entry: Row): void {
    if (!this.trace) return
    this.calls.push(entry)
    console.debug(`[fake] ${entry.kind} ${entry.name}${entry.detail ? ' ' + entry.detail : ''} -> ${entry.result}`)
  }

  /** `{ students: 805, invoices: 796, … }` — handy in the console: `__fake.db.counts()`. */
  counts(): Record<string, number> {
    const out: Record<string, number> = {}
    for (const [name, rows] of this.tables) if (rows.length) out[name] = rows.length
    return out
  }
}

/** The shape of a partition file's default export. */
export type Partition = (db: FakeDb) => void | Promise<void>
