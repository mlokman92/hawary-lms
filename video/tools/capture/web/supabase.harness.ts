// Stands in for apps/web/src/lib/supabase.ts. The client is a real one, made by
// the same factory, pointed at the discard port — then every part of it that
// talks is replaced by the fake backend.

import { createHawaryClient } from '../../../../packages/shared/src/supabase/client'
import { installFake, type PartitionLoader } from '../fake'
import { clock, config } from './boot'

// Lazy on purpose: a partition is fetched and compiled only when a URL asks for
// it, so one agent's half-written file cannot break another agent's page.
// A runtime URL rather than import.meta.glob: a glob is frozen when this module
// is first compiled, and a partition file created after the server started
// would not be in it.
const partitions: PartitionLoader[] = config.db.map((name) => ({
  name,
  load: () => {
    if (!/^[\w.-]+$/.test(name)) return Promise.reject(new Error(`bad partition name "${name}"`))
    const url = new URL(`../fake/db/${name}.ts`, import.meta.url).href
    return import(/* @vite-ignore */ url).catch((e) => {
      throw new Error(`fake/db/${name}.ts did not load (no such file, or it does not compile): ${e?.message ?? e}`)
    })
  },
}))

/** Never the production project: port 9 is the discard port, nothing listens there. */
export const supabase = createHawaryClient('http://127.0.0.1:9', 'sb_publishable_capture_harness_not_a_key', {
  persistSession: false,
  autoRefreshToken: false,
  detectSessionInUrl: false,
})

const fake = installFake(supabase, {
  persona: config.as,
  partitions,
  writes: config.writes,
  trace: config.trace,
})

// For poking at from the console, and for shots: `__fake.db.counts()`.
;(window as any).__fake = { ...fake, config, clock }

void fake.ready.then(() => {
  document.documentElement.dataset.fake = 'ready'
  document.documentElement.dataset.fakeAs = fake.current()?.key ?? 'anon'
  console.info(`[fake] ready — as=${fake.current()?.key ?? 'anon'} db=${fake.db.loaded.join(',')} now=${clock} lang=${config.lang} theme=${config.theme}`)
})
