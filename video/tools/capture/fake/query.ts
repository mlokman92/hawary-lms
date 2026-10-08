// A stand-in for supabase-js's PostgREST builder: chainable, thenable, and
// honest about the parts of PostgREST the app really uses — embedded selects
// resolved through the real foreign keys, count/head, the filter operators,
// or(), order/limit/range, single/maybeSingle, and writes.

import { FakeError, type Ctx, type FakeDb, type Row } from './db'

// ---------------------------------------------------------------------------
// select=… parsing
// ---------------------------------------------------------------------------

type SelNode =
  | { kind: 'star' }
  | { kind: 'col'; key: string; path: string; cast: string | null }
  | { kind: 'count'; key: string }
  | {
      kind: 'embed'
      table: string
      alias: string
      hints: string[]
      inner: boolean
      spread: boolean
      children: SelNode[]
    }

function splitTop(s: string, sep = ','): string[] {
  const out: string[] = []
  let depth = 0
  let quote = false
  let cur = ''
  for (const ch of s) {
    if (ch === '"') quote = !quote
    if (!quote) {
      if (ch === '(') depth++
      else if (ch === ')') depth--
      else if (ch === sep && depth === 0) {
        out.push(cur)
        cur = ''
        continue
      }
    }
    cur += ch
  }
  if (cur.trim() !== '') out.push(cur)
  return out
}

const selectCache = new Map<string, SelNode[]>()

export function parseSelect(input: string): SelNode[] {
  const cached = selectCache.get(input)
  if (cached) return cached
  const s = input.replace(/\s+/g, '')
  const nodes: SelNode[] = []
  for (const item of splitTop(s)) {
    if (item === '') continue
    if (item === '*') {
      nodes.push({ kind: 'star' })
      continue
    }
    const open = item.indexOf('(')
    if (open > 0 && item.endsWith(')')) {
      const head = item.slice(0, open)
      const inner = item.slice(open + 1, -1)
      // count() / alias:count()
      const cm = /^(?:(\w+):)?count$/.exec(head)
      if (cm && inner === '') {
        nodes.push({ kind: 'count', key: cm[1] ?? 'count' })
        continue
      }
      const m = /^(?:(\w+):)?(\.\.\.)?(\w+)((?:!\w+)*)$/.exec(head)
      if (m) {
        const hints = m[4] ? m[4].split('!').filter(Boolean) : []
        nodes.push({
          kind: 'embed',
          table: m[3],
          alias: m[1] ?? m[3],
          hints: hints.filter((h) => h !== 'inner' && h !== 'left'),
          inner: hints.includes('inner'),
          spread: !!m[2],
          children: parseSelect(inner === '' ? '*' : inner),
        })
        continue
      }
    }
    if (item === 'count') {
      nodes.push({ kind: 'count', key: 'count' })
      continue
    }
    // alias:column::cast, where column may be a json path (data->>key)
    let rest = item
    let cast: string | null = null
    const ci = rest.lastIndexOf('::')
    if (ci > 0) {
      cast = rest.slice(ci + 2)
      rest = rest.slice(0, ci)
    }
    let alias: string | null = null
    const am = /^(\w+):(.+)$/.exec(rest)
    if (am) {
      alias = am[1]
      rest = am[2]
    }
    const last = rest.split(/->>?/).pop() ?? rest
    nodes.push({ kind: 'col', key: alias ?? last.replace(/^"|"$/g, ''), path: rest, cast })
  }
  selectCache.set(input, nodes)
  return nodes
}

// ---------------------------------------------------------------------------
// Values and operators
// ---------------------------------------------------------------------------

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}|$)/

/** Read `col` or `col->a->>b` off a row. */
export function readPath(row: Row, path: string): unknown {
  if (!path.includes('->')) return row[path]
  const parts = path.split(/->>?/).map((p) => p.replace(/^['"]|['"]$/g, ''))
  let v: any = row[parts[0]]
  for (let i = 1; i < parts.length; i++) {
    if (v === null || v === undefined) return null
    v = v[parts[i]]
  }
  if (path.includes('->>') && v !== null && v !== undefined && typeof v !== 'string') {
    return typeof v === 'object' ? JSON.stringify(v) : String(v)
  }
  return v ?? null
}

/** -1 / 0 / 1, or null when either side is null (SQL: unknown). */
function compare(a: unknown, b: unknown): number | null {
  if (a === null || a === undefined || b === null || b === undefined) return null
  if (typeof a === 'boolean' || typeof b === 'boolean') {
    const x = String(a) === 'true'
    const y = String(b) === 'true'
    return x === y ? 0 : x ? 1 : -1
  }
  if (typeof a === 'number' || typeof b === 'number') {
    const x = Number(a)
    const y = Number(b)
    if (!Number.isNaN(x) && !Number.isNaN(y)) return x === y ? 0 : x < y ? -1 : 1
  }
  const sa = String(a)
  const sb = String(b)
  if (ISO_DATE.test(sa) && ISO_DATE.test(sb)) {
    const x = Date.parse(sa)
    const y = Date.parse(sb)
    if (!Number.isNaN(x) && !Number.isNaN(y)) return x === y ? 0 : x < y ? -1 : 1
  }
  return sa === sb ? 0 : sa < sb ? -1 : 1
}

function likeRegex(pattern: string, insensitive: boolean): RegExp {
  let re = ''
  for (const ch of pattern) {
    if (ch === '%' || ch === '*') re += '[\\s\\S]*'
    else if (ch === '_') re += '[\\s\\S]'
    else re += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${re}$`, insensitive ? 'i' : '')
}

function asList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    const s = value.trim().replace(/^[({]/, '').replace(/[)}]$/, '')
    return splitTop(s).map((x) => x.trim().replace(/^"|"$/g, ''))
  }
  return [value]
}

function literal(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw
  if (raw === 'null') return null
  if (raw === 'true') return true
  if (raw === 'false') return false
  return raw.replace(/^"|"$/g, '')
}

/** One PostgREST operator applied to one value. */
function test(op: string, actual: unknown, expected: unknown): boolean {
  switch (op) {
    case 'eq':
      return compare(actual, expected) === 0
    case 'neq':
      return (compare(actual, expected) ?? 0) !== 0
    case 'gt':
      return (compare(actual, expected) ?? 0) > 0
    case 'gte': {
      const c = compare(actual, expected)
      return c !== null && c >= 0
    }
    case 'lt':
      return (compare(actual, expected) ?? 0) < 0
    case 'lte': {
      const c = compare(actual, expected)
      return c !== null && c <= 0
    }
    case 'like':
    case 'ilike':
      return actual !== null && actual !== undefined && likeRegex(String(expected), op === 'ilike').test(String(actual))
    case 'match':
    case 'imatch':
      return actual !== null && actual !== undefined && new RegExp(String(expected), op === 'imatch' ? 'i' : '').test(String(actual))
    case 'is': {
      const want = literal(expected)
      if (want === null) return actual === null || actual === undefined
      return actual === want
    }
    case 'in':
      return asList(expected).some((v) => compare(actual, literal(v)) === 0)
    case 'cs': {
      if (Array.isArray(actual)) return asList(expected).every((v) => actual.some((a) => compare(a, v) === 0))
      if (actual && typeof actual === 'object' && expected && typeof expected === 'object') {
        return Object.entries(expected as Row).every(([k, v]) => JSON.stringify((actual as Row)[k]) === JSON.stringify(v))
      }
      return false
    }
    case 'cd':
      return Array.isArray(actual) && actual.every((a) => asList(expected).some((v) => compare(a, v) === 0))
    case 'ov':
      return Array.isArray(actual) && actual.some((a) => asList(expected).some((v) => compare(a, v) === 0))
    case 'fts':
    case 'plfts':
    case 'phfts':
    case 'wfts':
      return String(actual ?? '').toLowerCase().includes(String(expected).toLowerCase())
    default:
      console.error(`[fake] unhandled filter operator "${op}"`)
      return true
  }
}

type Cond = (row: Row) => boolean

/** `full_name.ilike.*ali*,email.eq.x,and(a.gt.1,b.is.null)` */
function parseLogic(input: string, mode: 'or' | 'and'): Cond {
  const parts = splitTop(input).map((p) => p.trim()).filter(Boolean)
  const conds: Cond[] = parts.map((part) => {
    const group = /^(not\.)?(and|or)\((.*)\)$/s.exec(part)
    if (group) {
      const inner = parseLogic(group[3], group[2] as 'or' | 'and')
      return group[1] ? (r) => !inner(r) : inner
    }
    const m = /^(.+?)\.(not\.)?(eq|neq|gt|gte|lt|lte|like|ilike|match|imatch|is|in|cs|cd|ov|fts|plfts|phfts|wfts)\.(.*)$/s.exec(part)
    if (!m) {
      console.error(`[fake] unparsed or() term "${part}"`)
      return () => true
    }
    const [, col, neg, op, raw] = m
    const value = op === 'in' || op === 'cs' || op === 'cd' || op === 'ov' ? raw : literal(raw)
    return (r) => test(op, readPath(r, col), value) !== !!neg
  })
  return mode === 'or' ? (r) => conds.some((c) => c(r)) : (r) => conds.every((c) => c(r))
}

function sortRows(rows: Row[], orders: { col: string; asc: boolean; nullsFirst: boolean | undefined }[]): Row[] {
  if (orders.length === 0) return rows
  return [...rows].sort((a, b) => {
    for (const o of orders) {
      const x = readPath(a, o.col)
      const y = readPath(b, o.col)
      const xn = x === null || x === undefined
      const yn = y === null || y === undefined
      if (xn || yn) {
        if (xn && yn) continue
        // Postgres: NULLS LAST ascending, NULLS FIRST descending, unless told.
        const first = o.nullsFirst ?? !o.asc
        return xn === first ? -1 : 1
      }
      const c = compare(x, y) ?? 0
      if (c !== 0) return o.asc ? c : -c
    }
    return 0
  })
}

// ---------------------------------------------------------------------------
// The builder
// ---------------------------------------------------------------------------

export type Result = {
  data: any
  error: { message: string; code: string; details: string | null; hint: string | null } | null
  count: number | null
  status: number
  statusText: string
}

const DROP = Symbol('drop')

type Scoped<T> = { path: string; value: T }

export class Query implements PromiseLike<Result> {
  private op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' | 'rpc' = 'select'
  private sel: string | null = null
  private conds: Scoped<Cond>[] = []
  private orders: Scoped<{ col: string; asc: boolean; nullsFirst: boolean | undefined }>[] = []
  private limits: Scoped<number>[] = []
  private offset: number | null = null
  private span: number | null = null
  private countMode: string | null = null
  private head = false
  private mode: 'many' | 'single' | 'maybe' = 'many'
  private payload: any = null
  private writeOpts: Row = {}
  private shouldThrow = false
  private notes: string[] = []

  constructor(
    private db: FakeDb,
    private table: string,
    private ctxOf: () => Ctx,
    private opts: { bypass?: boolean; rpc?: { name: string; args: Row } } = {},
  ) {
    if (opts.rpc) this.op = 'rpc'
  }

  // --- what to read / write -------------------------------------------------

  select(columns = '*', options: { count?: string | null; head?: boolean } = {}): this {
    this.sel = columns || '*'
    if (options.count) this.countMode = options.count
    if (options.head) this.head = true
    return this
  }

  insert(values: Row | Row[], options: Row = {}): this {
    this.op = 'insert'
    this.payload = values
    this.writeOpts = options
    return this
  }

  upsert(values: Row | Row[], options: Row = {}): this {
    this.op = 'upsert'
    this.payload = values
    this.writeOpts = options
    return this
  }

  update(values: Row, options: Row = {}): this {
    this.op = 'update'
    this.payload = values
    this.writeOpts = options
    return this
  }

  delete(options: Row = {}): this {
    this.op = 'delete'
    this.writeOpts = options
    return this
  }

  // --- filters --------------------------------------------------------------

  private scope(column: string): { path: string; col: string } {
    // 'students.full_name' filters the embedded `students`; a json path has no dot before '->'.
    const arrow = column.indexOf('->')
    const head = arrow >= 0 ? column.slice(0, arrow) : column
    const dot = head.lastIndexOf('.')
    if (dot < 0) return { path: '', col: column }
    return { path: column.slice(0, dot), col: column.slice(dot + 1) }
  }

  private where(column: string, op: string, value: unknown, negate = false): this {
    const { path, col } = this.scope(column)
    this.conds.push({ path, value: (r) => test(op, readPath(r, col), value) !== negate })
    this.notes.push(`${column}.${negate ? 'not.' : ''}${op}.${Array.isArray(value) ? `(${value.length})` : String(value).slice(0, 40)}`)
    return this
  }

  eq(column: string, value: unknown): this { return this.where(column, 'eq', value) }
  neq(column: string, value: unknown): this { return this.where(column, 'neq', value) }
  gt(column: string, value: unknown): this { return this.where(column, 'gt', value) }
  gte(column: string, value: unknown): this { return this.where(column, 'gte', value) }
  lt(column: string, value: unknown): this { return this.where(column, 'lt', value) }
  lte(column: string, value: unknown): this { return this.where(column, 'lte', value) }
  like(column: string, pattern: string): this { return this.where(column, 'like', pattern) }
  ilike(column: string, pattern: string): this { return this.where(column, 'ilike', pattern) }
  likeAllOf(column: string, patterns: string[]): this { for (const p of patterns) this.where(column, 'like', p); return this }
  ilikeAllOf(column: string, patterns: string[]): this { for (const p of patterns) this.where(column, 'ilike', p); return this }
  is(column: string, value: unknown): this { return this.where(column, 'is', value) }
  in(column: string, values: unknown[]): this { return this.where(column, 'in', values) }
  contains(column: string, value: unknown): this { return this.where(column, 'cs', value) }
  containedBy(column: string, value: unknown): this { return this.where(column, 'cd', value) }
  overlaps(column: string, value: unknown): this { return this.where(column, 'ov', value) }
  textSearch(column: string, query: string): this { return this.where(column, 'fts', query) }
  not(column: string, op: string, value: unknown): this { return this.where(column, op, value, true) }

  filter(column: string, op: string, value: unknown): this {
    const neg = op.startsWith('not.')
    return this.where(column, neg ? op.slice(4) : op, value, neg)
  }

  match(query: Row): this {
    for (const [k, v] of Object.entries(query)) this.where(k, 'eq', v)
    return this
  }

  or(filters: string, options: { referencedTable?: string; foreignTable?: string } = {}): this {
    this.conds.push({ path: options.referencedTable ?? options.foreignTable ?? '', value: parseLogic(filters, 'or') })
    this.notes.push(`or(${filters.slice(0, 60)})`)
    return this
  }

  // --- shape ----------------------------------------------------------------

  order(column: string, options: { ascending?: boolean; nullsFirst?: boolean; referencedTable?: string; foreignTable?: string } = {}): this {
    this.orders.push({
      path: options.referencedTable ?? options.foreignTable ?? '',
      value: { col: column, asc: options.ascending ?? true, nullsFirst: options.nullsFirst },
    })
    return this
  }

  limit(count: number, options: { referencedTable?: string; foreignTable?: string } = {}): this {
    this.limits.push({ path: options.referencedTable ?? options.foreignTable ?? '', value: count })
    return this
  }

  range(from: number, to: number): this {
    this.offset = from
    this.span = to - from + 1
    return this
  }

  single(): this { this.mode = 'single'; return this }
  maybeSingle(): this { this.mode = 'maybe'; return this }
  throwOnError(): this { this.shouldThrow = true; return this }
  abortSignal(): this { return this }
  returns(): this { return this }
  overrideTypes(): this { return this }
  setHeader(): this { return this }
  csv(): this { console.error(`[fake] unhandled .csv() on ${this.table}`); return this }
  explain(): this { console.error(`[fake] unhandled .explain() on ${this.table}`); return this }

  // --- execution ------------------------------------------------------------

  private source(ctx: Ctx): Row[] {
    const view = this.db.viewRows(this.table, ctx)
    if (view) return view
    if (!this.db.isKnown(this.table)) {
      console.error(`[fake] unhandled table "${this.table}" — nothing has added rows to it and it is not in the generated schema`)
      return []
    }
    return this.db.rows(this.table) as Row[]
  }

  private see(table: string, rows: Row[], ctx: Ctx): Row[] {
    return this.opts.bypass ? rows : this.db.visible(table, rows, ctx)
  }

  private applyScoped(path: string, rows: Row[]): Row[] {
    let out = rows
    for (const c of this.conds) if (c.path === path) out = out.filter(c.value)
    const orders = this.orders.filter((o) => o.path === path).map((o) => o.value)
    out = sortRows(out, orders)
    return out
  }

  private project(table: string, row: Row, nodes: SelNode[], path: string, ctx: Ctx): Row | typeof DROP {
    const out: Row = {}
    for (const n of nodes) {
      if (n.kind === 'star') Object.assign(out, row)
      else if (n.kind === 'col') {
        let v = readPath(row, n.path)
        if (n.cast === 'text' && v !== null && v !== undefined) v = String(v)
        out[n.key] = v === undefined ? null : v
      } else if (n.kind === 'count') out[n.key] = 1
      else {
        const res = this.embed(table, row, n, path ? `${path}.${n.alias}` : n.alias, ctx)
        if (res === DROP) return DROP
        if (n.spread && res && !Array.isArray(res)) Object.assign(out, res)
        else out[n.alias] = res
      }
    }
    return out
  }

  private embed(parentTable: string, parentRow: Row, n: Extract<SelNode, { kind: 'embed' }>, path: string, ctx: Ctx): unknown {
    const rel = this.db.relation(parentTable, n.table, n.hints)
    if (!rel) {
      this.db.warnOnce(`unhandled embed: no foreign key between "${parentTable}" and "${n.table}" (select ${n.alias}:${n.table}(…)). Declare it with db.declare().`)
      return n.inner ? DROP : null
    }
    let rows = this.see(n.table, this.db.related(rel, parentRow, ctx), ctx)
    rows = this.applyScoped(path, rows)
    const lim = this.limits.find((l) => l.path === path)
    if (lim) rows = rows.slice(0, lim.value)

    const counting = n.children.length > 0 && n.children.every((c) => c.kind === 'count')
    if (counting) {
      if (n.inner && rows.length === 0) return DROP
      const o: Row = {}
      for (const c of n.children) if (c.kind === 'count') o[c.key] = rows.length
      return rel.many ? [o] : o
    }
    const projected: Row[] = []
    for (const r of rows) {
      const p = this.project(n.table, r, n.children, path, ctx)
      if (p !== DROP) projected.push(p as Row)
    }
    if (n.inner && projected.length === 0) return DROP
    return rel.many ? projected : (projected[0] ?? null)
  }

  private keyColumns(): string[] {
    const conflict = this.writeOpts.onConflict as string | undefined
    if (conflict) return conflict.split(',').map((s) => s.trim())
    const cols = this.db.schemaOf(this.table)?.cols ?? {}
    if (cols.id) return ['id']
    const natural = ['course_id', 'student_id', 'user_id'].filter((c) => cols[c])
    return natural.length ? natural : ['academy_id']
  }

  /** Synchronous execution. The awaited form adds `db.ready` in front. */
  run(): Result {
    const ctx = this.ctxOf()
    const ok = (data: any, count: number | null = null, status = 200): Result => ({
      data,
      error: null,
      count,
      status,
      statusText: status === 201 ? 'Created' : status === 204 ? 'No Content' : 'OK',
    })

    let rows: Row[]
    let project = true

    if (this.op === 'rpc') {
      const { name, args } = this.opts.rpc!
      const handler = this.db.rpcHandler(name)
      if (!handler) {
        console.error(
          `[fake] unhandled rpc("${name}", ${JSON.stringify(args)}) — ${this.db.isKnownFunction(name) ? 'no partition has registered a handler: db.rpc(name, (args, ctx) => …)' : 'not a function in the generated types either'}`,
        )
        this.db.record({ kind: 'rpc', name, detail: JSON.stringify(args), result: 'UNHANDLED' })
        return ok(null)
      }
      const value = handler(args ?? {}, ctx)
      const scalar = !Array.isArray(value) || value.some((v) => v === null || typeof v !== 'object')
      const touched = this.conds.length || this.orders.length || this.limits.length || this.offset !== null || this.mode !== 'many'
      this.db.record({ kind: 'rpc', name, detail: JSON.stringify(args), result: Array.isArray(value) ? `${value.length} rows` : typeof value })
      if (scalar || !touched) {
        if (this.mode !== 'many' && Array.isArray(value)) return ok(value[0] ?? null)
        return ok(value === undefined ? null : value)
      }
      rows = value as Row[]
      project = this.sel !== null
    } else if (this.op === 'insert' || this.op === 'upsert') {
      const list: Row[] = Array.isArray(this.payload) ? this.payload : [this.payload]
      const stored = this.db.rows(this.table) as Row[]
      const keys = this.keyColumns()
      rows = list.map((v) => {
        const existing =
          this.op === 'upsert'
            ? stored.find((r) => keys.every((k) => v[k] !== undefined && r[k] === v[k]))
            : undefined
        if (existing) {
          const merged = { ...existing, ...v, updated_at: ctx.now.toISOString() }
          if (this.db.applyWrites) Object.assign(existing, merged)
          return this.db.applyWrites ? existing : merged
        }
        const seed: Row = { created_at: ctx.now.toISOString(), ...v }
        if (seed.id === undefined && this.db.schemaOf(this.table)?.cols.id === 'string') {
          seed.id = cryptoId()
        }
        const row = this.db.fill(this.table, seed) as Row
        if (this.db.applyWrites) stored.push(row)
        return row
      })
      if (this.db.applyWrites) this.db.touch()
      this.db.record({ kind: this.op, name: this.table, detail: `${rows.length} row(s)`, result: this.db.applyWrites ? 'applied' : 'accepted, not stored' })
      if (this.sel === null) return ok(null, null, 201)
    } else {
      rows = this.see(this.table, this.source(ctx), ctx)
      rows = this.applyScoped('', rows)

      if (this.op === 'update') {
        const patch = { ...this.payload }
        const cols = this.db.schemaOf(this.table)?.cols ?? {}
        if (cols.updated_at && patch.updated_at === undefined) patch.updated_at = ctx.now.toISOString()
        if (this.db.applyWrites) {
          for (const r of rows) Object.assign(r, patch)
          this.db.touch()
        } else rows = rows.map((r) => ({ ...r, ...patch }))
        this.db.record({ kind: 'update', name: this.table, detail: this.notes.join(' & '), result: `${rows.length} row(s) ${this.db.applyWrites ? 'applied' : 'accepted, not stored'}` })
        if (this.sel === null) return ok(null, this.writeOpts.count ? rows.length : null, 204)
      } else if (this.op === 'delete') {
        if (this.db.applyWrites) {
          const gone = new Set(rows)
          const stored = this.db.rows(this.table) as Row[]
          for (let i = stored.length - 1; i >= 0; i--) if (gone.has(stored[i])) stored.splice(i, 1)
          this.db.touch()
        }
        this.db.record({ kind: 'delete', name: this.table, detail: this.notes.join(' & '), result: `${rows.length} row(s) ${this.db.applyWrites ? 'applied' : 'accepted, not stored'}` })
        if (this.sel === null) return ok(null, this.writeOpts.count ? rows.length : null, 204)
      }
    }

    // Projection (and the inner-join drops that come with it).
    let out: Row[] = rows
    if (project) {
      const nodes = parseSelect(this.sel ?? '*')
      // A bare `count` at the top level is an aggregate over the filtered set.
      if (nodes.length > 0 && nodes.every((n) => n.kind === 'count')) {
        const o: Row = {}
        for (const n of nodes) if (n.kind === 'count') o[n.key] = rows.length
        out = [o]
      } else {
        const next: Row[] = []
        for (const r of rows) {
          const p = this.project(this.table, r, nodes, '', ctx)
          if (p !== DROP) next.push(p as Row)
        }
        out = next
      }
    }

    const total = out.length
    const count = this.countMode || this.writeOpts.count ? total : null
    if (this.offset !== null) out = out.slice(this.offset, this.offset + (this.span ?? out.length))
    const top = this.limits.find((l) => l.path === '')
    if (top) out = out.slice(0, top.value)

    if (this.op === 'select') {
      this.db.record({
        kind: 'from',
        name: this.table,
        detail: `select(${(this.sel ?? '*').replace(/\s+/g, ' ').slice(0, 90)})${this.notes.length ? ' ' + this.notes.join(' & ') : ''}`,
        result: this.head ? `count ${total}` : `${out.length} row(s)${count !== null ? ` of ${total}` : ''}`,
      })
    }

    if (this.head) return ok(null, count)
    if (this.mode === 'single' || this.mode === 'maybe') {
      if (out.length === 1) return ok(out[0], count)
      if (out.length === 0 && this.mode === 'maybe') return ok(null, count)
      return {
        data: null,
        error: {
          message: 'JSON object requested, multiple (or no) rows returned',
          code: 'PGRST116',
          details: `The result contains ${out.length} rows`,
          hint: null,
        },
        count,
        status: 406,
        statusText: 'Not Acceptable',
      }
    }
    return ok(out, count, this.op === 'insert' || this.op === 'upsert' ? 201 : 200)
  }

  /** `run()` that turns a thrown FakeError into `{ error }`, like the wire would. */
  private settle(): Result {
    try {
      return this.run()
    } catch (e) {
      if (e instanceof FakeError) {
        return {
          data: null,
          error: { message: e.message, code: e.code, details: e.details, hint: e.hint },
          count: null,
          status: e.status,
          statusText: 'Bad Request',
        }
      }
      const what = this.op === 'rpc' ? `rpc("${this.opts.rpc!.name}")` : `from("${this.table}")`
      console.error(`[fake] ${what} threw`, e)
      return {
        data: null,
        error: { message: e instanceof Error ? e.message : String(e), code: 'FAKE500', details: null, hint: null },
        count: null,
        status: 500,
        statusText: 'Fake Handler Error',
      }
    }
  }

  /** Rows, synchronously, for handlers: `db.from('x').select('…').eq(…).rows()`. Throws on error. */
  rows(): Row[] {
    const res = this.run()
    if (res.error) throw new FakeError(res.error.message, { code: res.error.code })
    return (res.data ?? []) as Row[]
  }

  /** The first row or null, synchronously. */
  first(): Row | null {
    return this.rows()[0] ?? null
  }

  then<A = Result, B = never>(
    onfulfilled?: ((value: Result) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): Promise<A | B> {
    const p = this.db.ready.then(() => {
      const res = this.settle()
      if (res.error && this.shouldThrow) throw Object.assign(new Error(res.error.message), res.error)
      return res
    })
    return p.then(onfulfilled, onrejected)
  }
}

function cryptoId(): string {
  const c = (globalThis as any).crypto
  if (c?.randomUUID) return c.randomUUID()
  const h = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0')
  return `${h()}${h()}-${h()}-4${h().slice(1)}-8${h().slice(1)}-${h()}${h()}${h()}`
}
