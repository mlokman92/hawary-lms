// Takes a real Supabase client and replaces its talking parts — auth, from(),
// rpc(), functions, storage, realtime — so every data hook in the app runs for
// real against the fake database. Nothing here opens a socket.

import { FakeDb, FakeError, type Partition, type PersonaDef, type Row } from './db'
import { Query } from './query'
import base from './db/base'

export type PartitionLoader = { name: string; load: () => Promise<{ default: Partition } | Partition> }

export type InstallOptions = {
  /** `?as=` — a persona key registered by a partition. 'anon' (or unknown) is signed out. */
  persona: string
  /** Extra partitions, applied after `base` in this order. A loader that throws is reported and skipped. */
  partitions?: PartitionLoader[]
  /** 'apply' makes insert/update/delete/upsert change the in-memory tables. Default: accept and change nothing. */
  writes?: 'noop' | 'apply'
  /** console.debug every call (also kept in db.calls). */
  trace?: boolean
}

export type Fake = {
  db: FakeDb
  /** Resolves when base and every requested partition are in. Every call on the client waits for it. */
  ready: Promise<void>
  /** The signed-in persona right now (null = signed out). */
  current(): PersonaDef | null
  /** Switch persona without a reload, as if they had signed in. */
  signInAs(key: string): void
}

function authUser(p: PersonaDef, db: FakeDb): Row {
  const profile = db.byId('profiles', p.userId) as Row | null
  const created = profile?.created_at ?? '2026-01-05T01:00:00.000Z'
  return {
    id: p.userId,
    aud: 'authenticated',
    role: 'authenticated',
    email: p.email ?? null,
    email_confirmed_at: created,
    confirmed_at: created,
    last_sign_in_at: db.now().toISOString(),
    phone: '',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { full_name: p.fullName ?? profile?.full_name ?? '', email: p.email ?? null },
    identities: [],
    created_at: created,
    updated_at: created,
    is_anonymous: false,
  }
}

function sessionFor(p: PersonaDef | null, db: FakeDb): Row | null {
  if (!p || !p.userId) return null
  const nowSec = Math.floor(db.now().getTime() / 1000)
  return {
    access_token: `fake.${p.key}.token`,
    refresh_token: `fake.${p.key}.refresh`,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: nowSec + 3600,
    user: authUser(p, db),
  }
}

export function installFake(client: any, options: InstallOptions): Fake {
  const db = new FakeDb()
  db.applyWrites = options.writes === 'apply'
  db.trace = !!options.trace

  // base is part of the module graph on purpose: it is always there.
  try {
    base(db)
    db.loaded.push('base')
  } catch (e) {
    console.error('[fake] partition "base" failed', e)
  }

  let current: PersonaDef | null = null
  const listeners = new Map<string, (event: string, session: Row | null) => void>()
  const emit = (event: string) => {
    const session = sessionFor(current, db)
    for (const cb of listeners.values()) {
      try {
        cb(event, session)
      } catch (e) {
        console.error('[fake] auth listener threw', e)
      }
    }
  }

  const ready = (async () => {
    for (const p of options.partitions ?? []) {
      try {
        const mod = await p.load()
        const apply = typeof mod === 'function' ? mod : mod.default
        if (typeof apply !== 'function') throw new Error('the file has no default export function (db) => void')
        await apply(db)
        db.loaded.push(p.name)
      } catch (e) {
        console.error(`[fake] partition "${p.name}" failed to load — continuing without it.`, e)
      }
    }
    db.runAfterLoad()
    const want = options.persona
    current = want && want !== 'anon' ? db.personaOf(want) : null
    if (want && want !== 'anon' && !current) {
      console.error(`[fake] unknown persona "${want}" — signed out. Known: ${db.personas.map((p) => p.key).join(', ')}`)
    }
  })()
  db.ready = ready

  const ctxOf = () => db.ctx(current)

  // --- auth -------------------------------------------------------------------
  const authOk = async <T,>(make: () => T) => {
    await ready
    return { data: make(), error: null }
  }
  const auth: Row = {
    getSession: () => authOk(() => ({ session: sessionFor(current, db) })),
    getUser: () => authOk(() => ({ user: current?.userId ? authUser(current, db) : null })),
    getClaims: () => authOk(() => ({ claims: current?.userId ? { sub: current.userId, email: current.email, role: 'authenticated' } : null })),
    refreshSession: () => authOk(() => ({ session: sessionFor(current, db), user: current?.userId ? authUser(current, db) : null })),
    setSession: () => authOk(() => ({ session: sessionFor(current, db), user: current?.userId ? authUser(current, db) : null })),
    onAuthStateChange: (cb: (event: string, session: Row | null) => void) => {
      const id = `sub-${listeners.size + 1}-${Math.random().toString(36).slice(2, 8)}`
      listeners.set(id, cb)
      void ready.then(() => {
        if (listeners.has(id)) cb('INITIAL_SESSION', sessionFor(current, db))
      })
      return { data: { subscription: { id, callback: cb, unsubscribe: () => void listeners.delete(id) } } }
    },
    signOut: async () => {
      await ready
      current = null
      emit('SIGNED_OUT')
      return { error: null }
    },
    signInWithPassword: async (creds: Row) => {
      await ready
      const found = db.personas.find((p) => p.userId && p.email && p.email.toLowerCase() === String(creds?.email ?? '').toLowerCase())
      if (!found) {
        return { data: { user: null, session: null }, error: { message: 'Invalid login credentials', status: 400, code: 'invalid_credentials', name: 'AuthApiError' } }
      }
      current = found
      emit('SIGNED_IN')
      return { data: { user: authUser(found, db), session: sessionFor(found, db) }, error: null }
    },
    signUp: async (creds: Row) => {
      await ready
      const email = String(creds?.email ?? '')
      const p: PersonaDef = { key: `signup:${email}`, userId: null, email, fullName: creds?.options?.data?.full_name }
      // Confirmation by email, like production: a user, no session yet.
      return { data: { user: { id: 'fake-signup', email, user_metadata: { full_name: p.fullName ?? '' }, identities: [{}] }, session: null }, error: null }
    },
    updateUser: async (attrs: Row) => {
      await ready
      if (current && attrs?.data?.full_name !== undefined) current = { ...current, fullName: attrs.data.full_name }
      emit('USER_UPDATED')
      return { data: { user: current?.userId ? authUser(current, db) : null }, error: null }
    },
    resetPasswordForEmail: async () => ({ data: {}, error: null }),
    resend: async () => ({ data: { user: null, session: null }, error: null }),
    verifyOtp: () => authOk(() => ({ session: sessionFor(current, db), user: current?.userId ? authUser(current, db) : null })),
    exchangeCodeForSession: () => authOk(() => ({ session: sessionFor(current, db), user: current?.userId ? authUser(current, db) : null })),
    startAutoRefresh: async () => {},
    stopAutoRefresh: async () => {},
    initialize: async () => ({ error: null }),
  }
  const authProxy = new Proxy(auth, {
    get(target, prop: string) {
      if (prop in target) return target[prop]
      if (typeof prop !== 'string' || prop === 'then') return undefined
      return (...args: unknown[]) => {
        console.error(`[fake] unhandled auth.${prop}(${args.map((a) => JSON.stringify(a)).join(', ').slice(0, 200)})`)
        return Promise.resolve({ data: {}, error: null })
      }
    },
  })

  // --- data -------------------------------------------------------------------
  const from = (table: string) => new Query(db, table, ctxOf)
  const rpc = (name: string, args: Row = {}) => new Query(db, `rpc:${name}`, ctxOf, { rpc: { name, args } })

  const functions = {
    setAuth() {},
    invoke: async (name: string, opts: Row = {}) => {
      await ready
      const handler = db.fnHandler(name)
      if (!handler) {
        console.error(`[fake] unhandled functions.invoke("${name}", ${describeBody(opts.body)}) — register one with db.fn(name, (body, ctx) => …)`)
        db.record({ kind: 'fn', name, detail: describeBody(opts.body), result: 'UNHANDLED' })
        return { data: null, error: null }
      }
      try {
        const data = await handler(opts.body, ctxOf(), opts)
        db.record({ kind: 'fn', name, detail: describeBody(opts.body), result: 'ok' })
        return { data: data === undefined ? null : data, error: null }
      } catch (e) {
        const fe = e instanceof FakeError ? e : null
        if (!fe) console.error(`[fake] functions.invoke("${name}") threw`, e)
        const body = { error: fe?.message ?? String(e), code: fe?.code }
        // The shape the app reads: FunctionsHttpError keeps the JSON body on `context`.
        const error = Object.assign(new Error(body.error), {
          name: 'FunctionsHttpError',
          context: { status: fe?.status ?? 500, json: async () => body, text: async () => JSON.stringify(body) },
        })
        return { data: null, error }
      }
    },
  }

  const bucket = (name: string) => ({
    getPublicUrl: (path: string) => ({ data: { publicUrl: db.urlFor(name, path, 'public') } }),
    createSignedUrl: async (path: string) => ({ data: { signedUrl: db.urlFor(name, path, 'signed') }, error: null }),
    createSignedUrls: async (paths: string[]) => ({
      data: paths.map((path) => ({ path, signedUrl: db.urlFor(name, path, 'signed'), error: null })),
      error: null,
    }),
    upload: async (path: string) => ({ data: { path, id: path, fullPath: `${name}/${path}` }, error: null }),
    update: async (path: string) => ({ data: { path, id: path, fullPath: `${name}/${path}` }, error: null }),
    remove: async (paths: string[]) => ({ data: paths.map((p) => ({ name: p })), error: null }),
    list: async () => ({ data: [], error: null }),
    download: async (path: string) => {
      console.error(`[fake] unhandled storage.from("${name}").download("${path}")`)
      return { data: new Blob([]), error: null }
    },
  })
  const storage = { from: bucket }

  const channel = (name: string) => {
    const ch: Row = {
      topic: name,
      on: () => ch,
      subscribe: (cb?: (status: string) => void) => {
        cb?.('SUBSCRIBED')
        return ch
      },
      unsubscribe: async () => 'ok',
      send: async () => 'ok',
      track: async () => 'ok',
      untrack: async () => 'ok',
      presenceState: () => ({}),
    }
    return ch
  }

  const define = (key: string, value: unknown) =>
    Object.defineProperty(client, key, { value, configurable: true, writable: true, enumerable: true })
  define('auth', authProxy)
  define('from', from)
  define('rpc', rpc)
  define('schema', () => ({ from, rpc }))
  define('functions', functions)
  define('storage', storage)
  define('channel', channel)
  define('removeChannel', async () => 'ok')
  define('removeAllChannels', async () => [])
  define('getChannels', () => [])

  return {
    db,
    ready,
    current: () => current,
    signInAs(key: string) {
      current = key === 'anon' ? null : db.personaOf(key)
      emit(current ? 'SIGNED_IN' : 'SIGNED_OUT')
    },
  }
}

function describeBody(body: unknown): string {
  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    const keys: string[] = []
    body.forEach((_v, k) => keys.push(k))
    return `FormData{${keys.join(',')}}`
  }
  try {
    return JSON.stringify(body)?.slice(0, 200) ?? 'undefined'
  } catch {
    return '[body]'
  }
}
