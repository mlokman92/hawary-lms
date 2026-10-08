# capture — a film set for the real UI

The real Hawary LMS screens, rendered by the product's own code, against a
fake backend that never leaves this machine. Nothing here ships.

```
tools/capture/
  shoot.mjs            the shared screenshot tool (do not edit)
  fake/                the fake backend — no dependencies, runs in Vite, Metro and Node
    index.ts           import everything from here
    install.ts         installFake(client, …): swaps auth / from / rpc / functions / storage / channel
    db.ts query.ts     the in-memory database and the PostgREST-like query builder
    ids.js kit.ts world.ts clock.ts     ids, dates, money, invented people, the film's clock
    schema.gen.ts      columns + foreign keys, generated from packages/shared (gen-schema.mjs)
    db/base.ts         PARTITION base — always loaded (+ base.content.ts, base.reports.ts)
    db/<name>.ts       your partition — loaded only when a URL asks for it
  web/
    serve.mjs run.mjs  start the harness · shoot a shots file
    check.mjs          load the fake in Node and print what is in it
    shots.base.mjs     the proving shots (copy its shape)   shots.smoke.mjs  every route, low-res
```

All commands run from `video/`. Use pnpm, never npm; nothing needs installing.

## Run it

```bash
# shoot, starting a harness for the run and stopping it afterwards (simplest, leaves nothing behind)
node tools/capture/web/run.mjs tools/capture/web/shots.base.mjs --port 5311 --serve
node tools/capture/web/run.mjs <your-shots.mjs> [id id …] --port <N> --serve [--trace] [--out DIR]

# or keep a server up while you iterate (stop it with Ctrl-C / kill its pid when you finish)
node tools/capture/web/serve.mjs --port <N>
node tools/capture/web/run.mjs <your-shots.mjs> --port <N>
```

- **`--serve` always brings its own server** and stops it when the run ends. If the port you
  name is taken — by another agent's harness or by anything else — it walks up to the next free
  one and says so. Nobody else's server is reused, and nobody can pull yours away mid-run.
- Without `--serve` you are aiming at a server you started: `run.mjs` asks
  `http://127.0.0.1:<N>/__harness` who is answering and **refuses to shoot** if it is not this
  harness. `curl http://127.0.0.1:<N>/__harness` shows the pid to stop when you finish.
- 5173, 5199, 8081, 8191, 8192 are refused outright. Each port has its own Vite cache
  (`video/.cache/capture-web-<N>`), so two harnesses side by side do not collide; the first
  start on a new port takes ~15 s (dependency bundling).
- `--trace` prints every backend call each page made (table, select, filters, rows returned) —
  the fastest way to learn what a screen needs.
- Exit code 1 = at least one shot logged a console error. Anything starting `[fake]` is ours:
  `unhandled rpc(...)`, `unhandled functions.invoke(...)`, `unhandled table`, `partition … failed`.

## URL params (read before the app boots, then removed from the URL)

| param | values | default |
| --- | --- | --- |
| `as` | a persona key (below) | `director` |
| `lang` | `en` \| `ms` | `en` |
| `theme` | `light` \| `dark` | `light` |
| `db` | extra partitions, comma-separated, applied in this order after base: `db=teaching,money` | none |
| `now` | the film's clock, Malaysian wall time: `2026-10-07T12:06` | `2026-10-07T11:55` |
| `writes` | `apply` = insert/update/delete/upsert change the in-memory tables | accepted, not stored |
| `trace` | `1` = console.debug every call | off |
| `ls.<key>` / `ss.<key>` | preset a localStorage / sessionStorage entry | — |

They are remembered per tab (sessionStorage), so client-side navigation and reloads keep the
persona. In a shots file, set them as fields on a shot (`{ id, url: '/lpkc', as: 'trainer', db:
'teaching', now: '2026-10-07T12:06' }`) or once for the file in `export const defaults`.
A deep link works as written: `/courses/<id>?as=director`.

## Personas

| key | who |
| --- | --- |
| `director` | Hakim Zulkifli — admin + Director, sees everything |
| `admin` | Nadia Syazana Rahman — admin, not a Director (no Settings) |
| `trainer` (= `hajar`) | Siti Hajar Ismail — the hero trainer. Also `farah`, `amirul`, `izzah` |
| `student` | Nur Aisyah Razak — HA-2026-0318, DKM Prasekolah Siri 3/2026 |
| `newcomer` | signed in, no membership — lands on `/onboarding` |
| `anon` | signed out — `/signin`, `/enroll/hawary-academy`, `/pay/hawary-demo-pay-0412` |

Add one from a partition: `db.persona({ key: 'aina', userId: s.user_id, email: s.email, fullName: s.full_name })`.
What a persona *is* (role, own student / instructor record) is read from the tables:
`academy_members.user_id`, `students.user_id`, `instructors.user_id`. Typing a persona's email
into the real sign-in form (any password) signs in as them.

## The world base builds (do not contradict it)

`node tools/capture/web/check.mjs` prints all of this live.

- **People**: 805 students `HA-2026-0001…0805`. 0001–0284 Siri 1 · 0285–0317 + 0334–0634 Siri 2 ·
  **0318–0333 (the cast's sixteen) + 0635–0796 Siri 3** · 0797–0800 no course · 0801–0805 pending
  enrolment requests for Siri 3. Four trainers, all bookable and all LPKC checkers.
- **Courses**: the three real titles, each with the cast's Week 1 / Week 2 (2 notes, 1 slide deck,
  1 quiz with 10 real questions, 1 tugasan). Only Siri 3's "Tugasan 2" is a draft.
- **Money**: one RM 1,800.00 invoice per enrolled student (796) = RM 1,432,800.00; 883 payments =
  RM 1,184,500.00; outstanding RM 248,300.00 — cast.money.tiles to the sen. 630 paid, 60
  part-paid, 106 unpaid, 16 overdue (RM 19,600.00). Hero invoice `INV-2026-0412`.
- **Appointments**: 35 sessions around 7 Oct, 22 still to come; the hero booking is 13 Oct 10:00.
- **LPKC**: the eight threads of cast.lpkc.queue with full timelines; see "The clock".
- **Sidebar badges** come from base rows: Enrolments 5 · LPKC 4 (2 for Siti Hajar) · Appointments
  22 (7) · bell 3 for Siti Hajar and for Nur Aisyah, none for the Director. Inserting into
  `enrollments(pending)`, `report_submissions`, `appointments(booked)` or `notifications` in your
  partition changes those numbers on your shots only — patch base rows instead, or accept it knowingly.

Ids are derived, never random — import them:

```js
import { ID, uid, studentId, invoiceId, enrollmentId, reportId } from '../fake/ids.js'   // also fine in .mjs shots files
ID.course.siri3            ID.content.siri3.week1.{module, notes[0..1], material, assessment, assignment}
ID.user.{director,admin,hajar,farah,amirul,izzah,aisyah}      ID.instructor.{hajar,farah,amirul,izzah}
ID.hero.{student,user,enrollment,invoice,report}              studentId(319)  invoiceId(412)  reportId(319)
uid('submission', 1)       // your own rows: any (kind, number | string) -> a stable uuid
```

## Writing a partition — `fake/db/<name>.ts`

```ts
import type { FakeDb } from '..'
import { ID, uid, studentId, student, instructor, invoiceOf, roster, at, day, rm, rng, cast } from '..'

export default function teaching(db: FakeDb): void {
  const aina = student(db, 'Aina Sofea Rosli')            // or student(db, 319); throws on a typo
  db.add('assignment_submissions', [{                     // typed against the generated DB types
    id: uid('submission', 1),
    assignment_id: ID.content.siri3.week1.assignment,
    student_id: aina.id,
    status: 'submitted',
    submitted_at: day(-1, '21:40'),                       // yesterday 21:40, Malaysian time
  }])
  db.patch('assignments', ID.content.siri3.week2.assignment, { is_published: true })
  db.rpc('invoice_totals', (args, ctx) => { /* return the data; throw db.fail('msg') for an error */ })
  db.fn('create-bill', (body, ctx) => ({ ok: true, url: '/pay/hawary-demo-pay-0412/result' }))
}
```

Loaded by `?db=<name>` through a dynamic import, so a file that does not compile is reported
(`[fake] partition "x" failed to load`) and skipped — it cannot break anyone else's page. Check
yours without a browser: `node tools/capture/web/check.mjs --db <name>`.

**`db` (FakeDb)**

| call | does |
| --- | --- |
| `db.add(table, row \| rows)` | append; fills `id`, `academy_id`, `created_at`, DB defaults, nulls for the rest. Returns the stored rows |
| `db.rows(table)` | the live array (no policies) |
| `db.find / db.where / db.get(table, id \| {col: v} \| fn)` | look up; `get` throws on a miss |
| `db.byId(table, id)` · `db.lookup(table, col, v)` | indexed look-ups |
| `db.patch(table, where, patch)` · `db.remove(table, where)` | change / delete in place |
| `db.from(table).select('…').eq(…).rows()` / `.first()` | the full query builder, synchronous, bypassing policies — for handlers |
| `db.rpc(name, (args, ctx) => data)` | answer `supabase.rpc`. A later partition overrides an earlier one |
| `db.fn(name, (body, ctx, options) => data)` | answer `supabase.functions.invoke` |
| `db.policy(table, (row, ctx) => boolean, { replace? })` | RLS-like read filter (AND of all on the table) |
| `db.view(name, (ctx) => rows)` | a computed table |
| `db.persona({...})` · `db.defaults(table, {...})` · `db.declare(table, { cols, rels })` | personas, table defaults, schema the types do not know |
| `db.storageUrl((bucket, path, kind) => url)` | where `storage.getPublicUrl / createSignedUrl` point |
| `db.afterLoad(fn)` | run once after every partition is in |
| `db.fail(message, { code, status })` | throw it from a handler to return `{ error }` |
| `db.now()` | the film's clock · `db.applyWrites` true under `?writes=apply` |

`ctx` = `{ db, persona, userId, email, role: 'admin'|'trainer'|'student'|null, isStaff, isAdmin,
isDirector, studentId, instructorId, member, now }`.

**Kit** — `at('2026-10-07 09:12')` MYT → ISO · `day(-3, '14:00')` relative to the cast's today ·
`ymd(6)` · `plusMinutes / plusDays(iso, n)` · `rm(1800)` → sen · `COURSE_FEE_SEN` ·
`rng(seed)` (`.int .pick .chance .shuffle`, deterministic) · `inventNames(n, seed, taken)` ·
`emailFor phoneFor icFor studentNo invoiceNo` · `cast` (cast.json) · `TODAY`.
**World** — `student(db, name|no)` `instructor(db, name)` `invoiceOf(db, who)` `enrollmentOf`
`roster('siri3')` `courseOfStudent(n)` `invoiceSeqOfStudent(n)` `TRAINERS` `CAST_STUDENT_NUMBERS` `HERO`.

## What the query builder honours

`select` with `*`, columns, `alias:col`, `col::text`, json paths, **embedded relations resolved
through the real foreign keys** (`students(full_name)`, `course:courses(id,title)`, nested,
`!inner`, `!fk_or_column` hints, `...spread`), `x(count)` aggregates, `{ count: 'exact', head }`;
filters `eq neq gt gte lt lte like ilike is in not contains containedBy overlaps match filter`
and `or('a.eq.1,b.ilike.*x*', { referencedTable })`; a filter on `alias.col` narrows that embed
(and drops the parent when the embed is `!inner`); `order` (multi-key, `nullsFirst`,
`referencedTable`), `limit`, `range`, `single`, `maybeSingle`; `insert / update / delete / upsert`
with `.select()`. Timestamps compare as instants, so `+08:00` and `Z` mix freely. `rpc()` returns
the same builder, so filters and `.single()` work on a handler's rows.

Not there: many-to-many embeds through a junction (embed the junction explicitly, as the app
does), ordering parents by an embedded column, aggregates other than count, `.csv()`. **No
triggers**: under `?writes=apply` a new payment does not move `invoices.amount_paid_sen` — a
handler that wants the consequence must write it. Policies are the shape of the real RLS, not a
copy: students see their own rows and published content of courses they are on; trainers see no
money and only their own reports and sessions; signed out sees nothing through `from()`.

## The clock, and the LPKC story

`Date` is shifted to the cast's day and ticks from there. `?now=` moves it. After all
partitions load, rows dated **after** "now" in `report_events`, `report_files`, `notifications`
and `announcements` are dropped, and every report with a timeline has its status / version /
dates recomputed from what is left (`settleReports`). So one param walks the changed feature:

| `now=` | Nur Aisyah's thread (`/lpkc/${ID.hero.report}`, `/learn/reports/${ID.hero.report}`) |
| --- | --- |
| `2026-10-07T09:10` | not submitted — the learner list offers "Submit" |
| `2026-10-07T09:12:20` | v1 uploaded, AI still checking → `submitted` |
| `2026-10-07T09:30` | Hawary AI: 3 points to fix → `changes_requested` |
| `2026-10-07T11:47:15` | v2 uploaded → `submitted` |
| default (11:55) | Hawary AI: all 12 met → `in_review` — the state of cast.lpkc.queue |
| `2026-10-07T12:06` | Siti Hajar approved → `approved` |

The AI is an event with `actor_name: 'Hawary AI'`, `actor_role: 'system'`, `actor_id: null`; the
real timeline renders it. `get_report`, `my_reports`, `report_counts`, `submit_report`,
`comment_on_report`, `reassign_report` are answered by base (the writes take effect under
`?writes=apply`). To script another thread in the same voice use `aiFixBody(points)` /
`aiPassBody(fromVersion, n)`. A report row you add **without** events is left exactly as seeded.

## Shooting

A shot is `{ id, url, viewport, fullPage, waitFor, steps, tag, clip, settle }` (see `shoot.mjs`),
plus the harness fields above. Output: `<id>.png` + `<id>.json` in `outDir`
(`video/public/shots/web` by default). **Look at every PNG.**

- Name what the eye should go to under `tag`. `{ text, within, closest }` finds the deepest
  element containing the text, then climbs: cards are `[data-slot="card"]`, list rows `li`,
  modules `[data-slot="accordion-item"]`, the sidebar `[data-slot="sidebar-container"]`.
- `innerText` follows CSS `text-transform`: an uppercase section heading is matched in
  uppercase (`'PENDING INVITATIONS'`).
- Charts animate in: `waitFor: '.recharts-wrapper', settle: 2400`.
- Prefer a storage preset to a click for remembered UI state — both course modules open:
  `?ss.hawary.course.<courseId>.open=["<module1>","<module2>"]` (see `shots.base.mjs`).
- `fullPage: true` captures the scroll height, but the sidebar is fixed and stops at the
  viewport's 900 px. For an unbroken sidebar shoot a tall viewport instead
  (`viewport: { w: 1440, h: <pageH from the json>, dpr: 2 }` — `course-tall`).
- The browser runs in `Asia/Kuala_Lumpur` with DNS off for everything but this machine, and the
  page carries a CSP that refuses any other origin. External images, YouTube blocks and gateway
  redirects will not load: use `data:` URLs or a local file as `/@fs/C:/…/file.png`.

## Tools

```bash
node tools/capture/web/check.mjs --db teaching,money            # loads? counts, ledger, what each persona sees
node tools/capture/web/check.mjs --as trainer --q "report_submissions?select=status,students(full_name)&status=eq.in_review"
node tools/capture/web/check.mjs --as student --rpc my_reports --args "{}" [--now 2026-10-07T12:06]
SMOKE_DB=teaching node tools/capture/web/run.mjs tools/capture/web/shots.smoke.mjs --port <N> --serve --trace
node_modules/.bin/tsc -p tools/capture                          # type-check fake/ (and your partition)
node tools/capture/fake/gen-schema.mjs                          # after the shared DB types change
```

`shots.smoke.mjs` is 57 low-res frames of every route as each persona, into `video/.cache/smoke`.
With base alone all 57 render and the only errors are the thirteen RPCs no partition answers yet:
`invoice_totals`, `payment_log_page`, `payment_log_totals`, `payment_report`,
`course_billing_roster`, `course_billing_summary` (money) · `get_my_appointments`,
`get_booking_options` (appointments) · `get_academy_enrollment` (the public join page) ·
`get_public_invoice` (the public pay page) · `list_academy_staff` (Members) · `login_analytics`,
`list_user_logins` (Analytics). More sit behind clicks and tabs the smoke set does not reach
(`invoice_report`, `get_academy_availability`, `get_attempt`, `start_attempt`, `incentive_candidates`, …):
shoot with `--trace` and the page tells you.

## Using the fake outside the web harness (the mobile apps)

```ts
import { installClock, installFake } from '<repo>/video/tools/capture/fake'
installClock(null)                                   // or '2026-10-07T12:06'; call before the app renders
const fake = installFake(supabase, {
  persona: 'student',
  partitions: [{ name: 'mobile', load: () => import('<repo>/video/tools/capture/fake/db/mobile') }],
})
```

`installFake` replaces `auth`, `from`, `rpc`, `functions`, `storage`, `channel` on the client it
is given; every call waits for `fake.ready`. base is imported statically. Metro bundles
`import()` targets eagerly, so there a broken partition breaks the bundle — list only the
partitions that shot needs. Reuse `teaching` for LPKC rather than seeding it twice.

## Gotchas

- Never write a helper with a bash heredoc: it eats backticks and `${}`. Use the Write tool.
- A partition file added while a server is running is picked up (runtime import); edits are
  re-read on the next page load. HMR is off on purpose — nothing reloads under the camera.
- `db.get` throws inside a partition → that partition is skipped from that line on. Run `check.mjs`.
- `cast.money.incentiveBatch` names the four trainers, but `incentive_payouts` pays **students**
  (`student_id`, with `students(full_name, student_no)` embedded). The money partition decides.
- The dashboard's y-axis prints "RM 300.0k" on two lines and "Sept" for September — that is the
  product, not the harness.
- `apps/web/.env.local` (the real project) is never read: `envDir` is off and the client is built
  on `http://127.0.0.1:9`.
