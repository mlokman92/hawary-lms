// The fake backend. See ../README.md.
//
//   import { installFake } from '…/fake'
//   const fake = installFake(supabase, { persona: 'director', partitions: [...] })
//
// A partition file (fake/db/<name>.ts) imports what it needs from here:
//
//   import type { FakeDb } from '..'
//   import { ID, uid, studentId, at, day, rm, cast } from '..'
//   export default function teaching(db: FakeDb) { … }

export { installFake, type Fake, type InstallOptions, type PartitionLoader } from './install'
export { FakeDb, FakeError, type Ctx, type Partition, type PersonaDef, type Row, type RowOf, type Seed, type TableName } from './db'
export { Query, parseSelect } from './query'
export { installClock, clockSetTo } from './clock'
export * from './ids.js'
export * from './kit'
export * from './world'
export { AI_NAME, aiFixBody, aiPassBody, settleReports } from './db/base.reports'
