# Billplz incentives — paying a grant out

A Malaysian government childcare-education grant pays the academy a flat sum per
student — RM500 a head in the case this was built for — and the academy has to
pass it on to each student's own bank account. That is the whole feature, and
every shape below follows from one fact about it: **this is money going out, to
a person, and a duplicate transfer cannot be undone.**

Billplz **Payment Order** is the disbursement API. It is a different product
from the Billplz bill API and from ToyyibPay: nothing here touches `invoices`,
`payments` or `payment_intents`.

Status: **implemented — pending live sandbox verification.** The checklist at
the end is the list of things only a real Billplz sandbox account can settle.

### What shipped

- **Migration** `supabase/migrations/20260814120000_billplz_incentives.sql` —
  two enums, three tables, seven RPCs, and the Billplz columns on the existing
  `academy_payment_settings`.
- **Migration** `…20260814130000_incentive_payout_recovery.sql` — the three
  defects an adversarial review of the above turned up, all the same shape (a
  state reachable with no route out): the claim lease, a student's read path to
  the batch they were paid from, and `bank_account_last4`.
- **Edge functions** `billplz-connect` (jwt) · `billplz-disburse` (jwt) ·
  `billplz-payout-callback` (**no** jwt) · `billplz-payout-status` (jwt).
- **Web** — `/incentives` + `/incentives/:id` (admin only, `HandCoins` in the
  admin nav beside Members and Settings), `features/incentives/*`,
  `features/bank/BankAccountCard.tsx` on both `/students/:id` and
  `/learn/profile`, `features/settings/BillplzSettingsCard.tsx`, a **Payouts**
  section on `/learn/billing`, and `packages/shared/src/domain/banks.ts`.
- **Config** — no new secrets. `SUPABASE_SERVICE_ROLE_KEY` is auto-injected; the
  callback URL is built from `SUPABASE_URL`, not from `APP_URL`, because it
  points at a function and not at the app.

## The API, in the facts that shaped the code

Base URL is `https://www.billplz.com/api/v5`, sandbox
`https://www.billplz-sandbox.com/api/v5`.

**Two keys, not one.** The **API Secret Key** is HTTP Basic auth — username, with
an *empty* password, so the header is `Basic base64("<secret>:")`. The **X
Signature Key** signs every payment-order request. Both have to be right for any
call to work, which is why `billplz-connect` verifies them together rather than
storing what the admin pasted.

**Every payment-order request carries `epoch` and `checksum`.** `epoch` is UNIX
seconds; `checksum` is HMAC-**SHA512**, keyed by the X Signature Key, over the
listed parameter values **concatenated in the given order with no delimiter**,
lowercase hex. The order is per endpoint, and it is not the order of the request
body:

| Call | Ordered values |
|---|---|
| `POST /payment_order_collections` | `[ title, callback_url*, epoch ]` (omit `callback_url` from the string when not sent) |
| `GET /payment_order_collections/{id}` | `[ payment_order_collection_id, epoch ]` |
| `POST /payment_orders` | `[ payment_order_collection_id, bank_account_number, total, epoch ]` |
| `GET /payment_orders/{id}` | `[ payment_order_id, epoch ]` |
| `GET /payment_order_limit` | `[ epoch ]` |
| Callback (POST to your `callback_url`) | `[ id, bank_account_number, status, total, reference_id, epoch ]` |

Note what is *absent* from the `POST /payment_orders` list: `bank_code`, `name`,
`description` and `email` are sent but not signed. So `bank_code` can be
upper-cased at send time for free — it is case sensitive at Billplz and nothing
upstream guarantees the case of a stored SWIFT code — while `total` must be the
**identical string** in the body and in the hashed message.

**The Payment Order Limit is prefunded, and is not the Credit Balance.**
`GET /payment_order_limit` returns `{ total }` in sen: the pool the transfers
draw down. The Credit Balance is a separate wallet that pays the per-transaction
fee. Running out of the former is HTTP **422** with `"You do not have enough
payments"`, which is a *top up and resume*, not a failed batch — handled as its
own outcome, never as a row-level failure.

`billplz-connect` verifies with `GET /payment_order_limit` precisely because it
is the only call that exercises both keys at once (Basic auth for the secret, a
checksum for the signature) and **creates nothing**. A wrong key of either kind
surfaces on the settings card instead of halfway through a disbursement, and the
returned limit is the one number that decides whether a run can complete — so
the card shows it, once, after a successful connect. Nothing else reports it.

**Statuses**: `processing` · `enquiring` · `executing` · `reviewing` ·
`completed` · `refunded`. `refunded` means the money came back — a **failed**
payout, not a neutral one.

**`total` is in cents (= sen)**, 1:1 with how this repo stores money. No
conversion anywhere.

**Sandbox only settles `DUMMYBANKVERIFIED`.** Any real SWIFT code fails there.
`BILLPLZ_SANDBOX_BANK_CODE` in `packages/shared/src/domain/banks.ts` carries it,
and the batch page shows a **Sandbox** badge beside the title: which account a
batch ran against is what decides whether the transfers were money at all, and it
is readable nowhere else on that page.

**`description` is capped at 200 characters and rejects special characters.** It
is computed once per run and sent on every POST in the loop, so an apostrophe or
a hyphen in the academy's own batch title would fail the *entire chunk*
identically. `billplz-disburse` reduces it with the same `clean()` treatment
`create-bill` gives ToyyibPay's text fields — alphanumerics, spaces and
underscores, collapsed and sliced — plus a fallback for a title that cleans away
to nothing.

**`email` omitted defaults to the *sender's* address.** That would mail the
academy about its own transfer instead of the student, so it is sent when the
student has one that passes a basic check and omitted otherwise.
`recipient_notification` is **not sent at all**: it is a boolean that already
defaults to `true`, and posting the wrong literal is worse than the default.

**`reference_id` is unique per collection**, up to 255 chars. The payout row's
uuid satisfies that, so the row *is* the reference — there is no second column to
keep in step, and the callback arrives already knowing which row it belongs to.

## There is no bulk endpoint

This is the finding the whole disbursement design hangs off. A "bulk transfer" in
Billplz is a **loop** of `POST /payment_orders`, one request per recipient,
inside one collection. 582 recipients is 582 sequential HTTPS round trips to a
payments API.

An edge function has a wall clock. So sending is:

- **Chunked** — one invocation claims at most `limit` rows (default 25, hard cap
  50) and returns `remaining`.
- **Claimed atomically** — `app.claim_incentive_payouts(_batch, _limit)` is a
  single `UPDATE … WHERE status='pending' AND id IN (SELECT … FOR UPDATE SKIP
  LOCKED) RETURNING *`. Read-then-update would be a race, and the thing it races
  over is money leaving a bank account. Two invocations — the resume loop racing
  a retry, an admin double-clicking — get disjoint sets, and Billplz never sees
  the same payout twice.
- **Resumable** — the client (`useDisburse`) loops the function while
  `remaining > 0`, invalidating the payout query *between* passes so the table
  fills in live; a batch of hundreds is minutes of sequential calls, and a screen
  that shows nothing until it finishes reads as a hang. The loop is bounded at 40
  passes (~1000 recipients) so a server that keeps reporting work left cannot
  spin the browser forever, and whatever is left is still resumable by hand from
  the **Resume** button.
- **Sequential within a chunk.** 25 parallel transfers is not a thing to do to a
  payments API.

`app` is not in PostgREST's exposed schemas, so the migration also ships a
`public.claim_incentive_payouts` wrapper — revoked from `public, anon,
authenticated` and granted to **`service_role` only**. Claiming a payout *is* the
act of sending money; it is never a client's to perform.

### Every exit path leaves rows in a state somebody can act on

No path leaves a row stuck in `sending`:

- **2xx** → `processing` with the order id, `sent_at`, and the provider's own
  status string kept verbatim. A Billplz reply of `completed` maps straight to
  `completed`.
- **422 / insufficient funds** → this claim *and every claim behind it* go back to
  `pending`, and the run stops. Continuing would mint N identical rejections. The
  response is `{ ok:false, code:'insufficient_funds' }`, which the client turns
  into its own sentence — an empty payment limit will not fix itself on the next
  pass.
- **Any other error reply** → `failed`, with the trimmed provider message.
- **The request threw** → `failed`, *not* back to `pending`. Its fate is unknown:
  Billplz may or may not have accepted the order, and an automatic retry could
  pay the same person twice. A failed row is visible with its reason and can be
  re-sent deliberately; a duplicate transfer cannot be undone. If the order did
  land, its callback carries `reference_id` and settles the row anyway.
- **A claimed row that already carries an order id** is advanced to `processing`,
  never re-posted — that is a row an earlier run sent before it could record the
  answer.

`release()` and `markFailed()` both filter on `status = 'sending'` **and**
`billplz_payment_order_id IS NULL`. A row that has left `sending`, or acquired an
order id, has been dealt with and must never be handed back to a later run.

The collection is created once per batch, and only after checking the batch has
recipients: creating it flips the batch out of `draft`, and
`set_incentive_recipients` is draft-only, so an empty batch that reached `sent`
could never be given anybody to pay.

`is_sandbox` is **pinned onto the batch at creation** by `create_incentive_batch`,
and the batch row is the *only* thing that decides which host is posted to — the
academy's current sandbox switch is never consulted at send time. Two reasons,
and the second is the important one:

- A resume must not follow a switch flipped mid-run, or the rest of a live batch
  goes to the sandbox host and `billplz-payout-status` then looks for a live
  order on a sandbox server.
- `/incentives/:id` paints its **Sandbox** badge from that same column. If
  sending read the current setting instead, an academy that reconnected with
  live keys would send a batch the UI still labelled Sandbox. **The badge has to
  predict the endpoint.** The failure is asymmetric: a live-intended batch sent
  to the sandbox moves no money and is obvious, whereas a sandbox-labelled batch
  sent live is hundreds of thousands of ringgit that cannot be recalled. A draft
  created under the old environment is therefore sent under the old environment;
  to change it, delete the draft and start one.

### A claim is a lease, not a latch

`release()` and `markFailed()` cover the exits the function *takes*. The exit it
cannot take is being killed mid-chunk — the wall clock, an eviction, a redeploy.
That leaves rows at `sending` with no order id, and originally nothing on earth
moved them again: the claim took `pending` only, the reconciler skips rows with
no order id by design, `remaining` counted only `pending` so the batch flipped to
`sent`, and the Resume button disappeared. Those students were simply never paid,
and the UI said the run was finished.

So `app.claim_incentive_payouts` also takes a `sending` row **whose
`billplz_payment_order_id` is null and whose `updated_at` is older than 15
minutes**. Fifteen minutes is far beyond any edge function's wall clock, so a
live invocation can never have its rows stolen. `remaining` counts
`pending` + un-sent `sending` for the same reason, and `hasPending` on the batch
page derives the Resume button from `!billplz_payment_order_id`, not from
`status === 'pending'` — otherwise the button hides on exactly the batch that
needs it. The client's disburse loop stops early when a pass reports no progress:
rows still inside their lease are not work it can do yet.

## Settlement is reconciliation-driven; the callback is a fast path

The same lesson as `docs/toyyibpay-payments.md` → "Settlement is
reconciliation-driven, not callback-driven", reached from a different direction.

Billplz's payment-order callback fires **only on `completed`/`refunded`**, retries
**exactly once** (an hour later), and wants HTTP 200 inside 20 seconds. So a
deploy, a cold start or a 21-second blip loses the notification for good, and the
intermediate states (`enquiring`, `executing`, `reviewing`) are never announced at
all. Treating it as the settlement mechanism would leave money marked *sending*
forever.

**`billplz-payout-status` is the authoritative reconciler.** It re-queries
`GET /payment_orders/{id}` for every payout of a batch that is still open, and is
safe to call repeatedly — the **Refresh status** button on the batch page. The
two functions share a status mapping that is deliberately identical in both
files: if the callback and a reconciliation pass could disagree about the same
payout, one of them would be lying.

Three decisions inside the reconciler are worth keeping:

- **Only `sending`/`processing` are re-queried.** `completed`, `failed` and
  `cancelled` are terminal, so a pass can only ever advance a payout, never
  resurrect one. `remaining_open` counts the same set — a `sending` row with no
  order id is disburse's business, and counting it would make a client that loops
  on the number spin against nothing.
- **Ordered by `updated_at` ascending, not `created_at`.** The window is 50 and
  the stated scale is hundreds. Oldest-first re-checks the same head rows on
  every pass, so one row stuck in `reviewing` — or an order id that 404s —
  starves the entire tail of the batch of the only authoritative path it has.
- **The row is written even when nothing changed**, so `set_updated_at` rotates it
  to the back of that queue. Skipping the write is exactly what would pin the
  window to the same 50 rows forever. The write re-asserts the open-status filter,
  so a callback that landed between the read and the write wins instead of being
  rolled back to `processing`.

A non-2xx from Billplz is Billplz being unavailable, not a failed payout: the row
is left open for the next pass.

**The client loops it.** One invocation reconciles at most 50 payouts, so a
single click could never settle a batch of hundreds — `useRefreshPayoutStatus`
calls the function repeatedly, exactly the way `useDisburse` does. Its
termination condition is *not* `remaining_open === 0`, which would spin forever
whenever Billplz is simply still working: it records `checked + remaining_open`
on the first pass and stops once it has checked that many rows, i.e. walked the
open set once. It also stops if a pass checks nothing, which is what Billplz
being unreachable looks like.

### What makes the callback trustworthy

`billplz-payout-callback` runs with `verify_jwt = false` — Billplz's server has no
Supabase JWT — and derives tenancy **from data**: `reference_id` is our payout id
→ batch → academy. Nothing the request claims about itself is used to find the
tenant. Then two gates, both required:

1. The `?k=` query param must equal the batch's `callback_nonce`, which only ever
   existed inside the `callback_url` we handed Billplz.
2. The posted `checksum` must equal HMAC-SHA512 over
   `[id, bank_account_number, status, total, reference_id, epoch]` under **that
   academy's** X Signature Key.

Both comparisons are **constant time**. A `===` on a payout webhook leaks how many
leading bytes were right, and a forger walks that one byte at a time until the
money moves.

An unknown `reference_id` answers 200 exactly like a success, so an
unauthenticated caller learns nothing about which payouts exist. Every non-auth
path returns 200 immediately, because the single retry is not worth spending on a
slow answer.

`refunded` is the **one** status allowed to overturn a `completed` payout: Billplz
settles, the receiving bank bounces it, the money comes back. Nothing else ever
re-reads a completed row — the reconciler only looks at open ones — so discarding
that callback would leave the row permanently claiming the student was paid.
Every other duplicate callback is ignored on a settled row.

## Bank details are admin-or-self, and that is why they are a table

The product rule: an academy **admin** and the **student themselves** may read and
write a payout destination. A trainer may not. A trainer manages students, takes
attendance and grades work; they have no business reading account numbers.

`app.is_staff` is therefore deliberately absent from all four policies on
`student_bank_accounts`, which are each `app.is_admin(academy_id) OR
app.owns_student(student_id)`. Fifty-eight policies depend on `app.is_staff`, and
none of them may be narrowed to get this.

**That is also why the fields are a separate table rather than four columns on
`students`.** RLS is *row*-level. There is no column-level policy, so columns on
`students` would be readable by everyone who can read the student row — which is
every trainer, by design and by necessity. Moving the fields to their own row is
the only way to make them unreachable, and unreachable is what "a trainer must not
see this" means when the client is not the thing enforcing it.

One row per student (`student_id` is the primary key): a person has one place they
want the grant paid into, and a second row would only raise the question of which
one is real. The FK is **composite** — `(academy_id, student_id)` →
`students(academy_id, id)` — because the insert policy lets a student write their
own `student_id`, and this is what stops them filing it under someone else's
academy. `CHECK`s mirror what the client validates (`^[0-9]{5,20}$`, a plausible
SWIFT length, a non-empty holder name), and `features/bank/api.ts` checks the same
three before writing so the user gets a sentence instead of a Postgres 23514
naming a constraint.

`BankAccountCard` is one component for both surfaces, because they are the same
row under the same policy. On `/students/:id` it renders only for an admin: for a
trainer the policy returns nothing, so the card could only ever be an empty box.

`incentive_candidates` exists as an RPC rather than a select for the same reason
in miniature. The picker needs to know **whether** an account is on file, and to
show enough of it to recognise — so the RPC returns `has_bank`, `bank_code` and
`'••••' || right(number, 4)`. A full account number is never returned in bulk to
build a list. The learner's own payout query
(`features/incentives/learnApi.ts`) projects an explicit column list that omits
the bank snapshot entirely: the number is the student's own so RLS would return
it, but nothing on `/learn/billing` needs it, and a number that never reaches the
browser cannot leak from it.

## A payout snapshots the bank fields

`incentive_payouts` carries its own `bank_code`, `bank_account_number` and
`account_holder_name`, copied from `student_bank_accounts` at the moment
`set_incentive_recipients` runs — not a join.

Where the money actually went has to stay readable after the student edits their
account. Otherwise a transfer that failed six weeks ago cannot be traced back to
an account number that no longer exists anywhere, and the batch page would show
today's account against last month's transfer — which is worse than showing
nothing, because it reads as correct. `amount_sen` is snapshotted from the batch
for the same reason.

The student FK is `ON DELETE RESTRICT`, also composite: deleting a student must
not silently erase the record that they were paid.

The snapshot is also what the **confirm dialog is checked against**. The picker
computes its "N recipients · RM total" client-side, but who is actually payable
is decided server-side by `set_incentive_recipients`, which inner-joins
`student_bank_accounts` — a student who deleted their details since the list
loaded silently drops out. So the RPC's `{recipients, skipped}` is compared to
the confirmed count *before* disbursing, and a disagreement stops the run: the
admin consented to a count and a total, and that consent does not cover a
different set. The stale selection is dropped and re-seeded from the rows the
server did write, so the second confirm shows the real figures instead of failing
again.

`bank_account_last4` is a **generated column**, and it is what the batch page
selects. The full number exists to be *sent*, never to be displayed: listing
payouts with `select *` shipped every recipient's account number to the browser
in order to render four masked digits, which is precisely the bulk exposure
`incentive_candidates` was written as an RPC to prevent. The client projection
names its columns explicitly and `bank_account_number` is not among them.

## Clients cannot write a payout, and cannot reopen a sent batch

`incentive_payouts` has **SELECT only** for clients —
`app.is_admin(academy_id) OR app.owns_student(student_id)` — and **no DML policy
at all**. That is the `appointments` standing, and the `assessment_questions`
standing before it. "Who has been paid" is not a fact a browser may assert. Rows
are minted by `set_incentive_recipients` (SECURITY DEFINER) and moved only by the
edge functions under the service role.

`incentive_batches` is `app.is_admin` on all four commands, but **UPDATE and
DELETE additionally require `status = 'draft'`** — on both sides of the UPDATE.
Without that predicate an admin could PATCH a sent batch back to `draft` over
PostgREST, re-run the recipient picker — which *deletes every payout row*,
`billplz_payment_order_id` and all — and disburse the same money a second time.
The edge functions move a batch out of draft under the service role, which
bypasses RLS, so nothing legitimate needs the client write.

A **student may read a batch they were actually paid from** — SELECT only, via an
`EXISTS` over their own `incentive_payouts` rows. Without it the batch title on
`/learn/billing` was a join that could never return a row, because the only
other SELECT policy is `app.is_admin`: every payout would have read "Untitled"
forever. The grant's name is the one thing that says what the money was for.

The RPCs follow `20260726120000_toyyibpay_settings.sql` verbatim in style:
`security definer`, `set search_path = ''`, fully-qualified identifiers, and
`revoke execute … from public, anon` before granting to `authenticated`.
`get_billplz_credentials` is revoked from **`public, anon, authenticated`** and
granted to `service_role` alone — Postgres grants EXECUTE to PUBLIC by default and
anon inherits it, so revoking from `authenticated` only would leave every
academy's disbursement keys readable by an anonymous caller (the H1 rule in
`docs/toyyibpay-payments.md`).

Both keys live in Vault under `billplz_secret:<academy_id>` and
`billplz_xsign:<academy_id>`; `public` holds the masked last-4 and the flags.
`vault.create_secret` errors on a duplicate name, so `set_billplz_credentials`
updates in place when the name exists — the "Replace key" path.

## Tables

| table | holds |
|---|---|
| `student_bank_accounts` | one row per student: where they want money paid. Admin-or-self on all four commands. |
| `incentive_batches` | one disbursement run = one Billplz collection. Flat `amount_sen` per head, `callback_nonce`, pinned `is_sandbox`. |
| `incentive_payouts` | one transfer to one student. The row id **is** the Billplz `reference_id`. Read-only to clients. |

Plus the `billplz_*` columns on `academy_payment_settings`, beside the ToyyibPay
ones. The amount is a property of the **batch**, not of each recipient, because
the grant is a flat sum per student — an amount that varies per head is a
different product, and inventing a per-recipient editor for a fixed grant is
interface nobody asked for.

`incentive_batches.is_sandbox` defaults to **true**, and `create_incentive_batch`
coalesces a missing settings row to true as well: a batch created before any keys
are connected must not default to moving real money. The settings card is the
opposite — its form opens on **Live**, behind the same "Advanced" disclosure the
ToyyibPay card uses, because an admin pasting keys is normally pasting real ones.

## Screens

**`/incentives`** (admin) — the batch list, and **New incentive** is the one
obvious action, so it is the header button. The dialog asks for title, description
and amount per student, opening on `500.00` because that is the grant this was
built for; it is still a plain input, not a fixed amount.

**`/incentives/:id`** has two lives off `batch.status`, so there is no mode to
choose and no way to edit recipients after money has started moving:

- **draft** → the recipient picker. Search, a course filter, and a checkbox table
  where a student with no bank details is listed with the checkbox disabled and
  the bank cell saying so — who still has to fill theirs in is the thing the admin
  needs from this screen. The selection survives filter changes, and is seeded
  once from any payout rows the draft already carries (a send refused before it
  reached Billplz leaves the list saved and the batch in draft). A sticky footer
  states the count and the ringgit total; sending is behind an `AlertDialog` that
  repeats both, pluralised properly — "1 bank accounts" in a confirmation that
  spends money reads as a bug in the thing about to spend. **Delete** is
  draft-only and lives behind the `⋯` menu.
- **sending / sent** → the payout table: student, masked account, amount, status
  badge, failure reason. **Refresh status** always; **Resume** only while
  something is still `pending`.

**`/learn/billing`** gets a **Payouts** section, rendered only when there is at
least one row: a student whose academy runs no incentives should not be told the
feature exists. The date shown is `completed_at ?? sent_at ?? created_at` — the
date that matters is when the money moved, which only exists once it has.

## Deliberately not done

- **No invoice and no ledger entry.** A payout is money *out*; `payments` and
  `/payments` are the money-*in* ledger and stay untouched. Writing a negative
  invoice so the two could share a table would corrupt the one number the billing
  screens exist to report. The same call the enrolment and appointments work made.
- **No per-recipient amount.** `incentive_payouts.amount_sen` is a real column and
  would carry one, but nothing writes it except the batch. The grant is flat; a
  per-head editor is the UI for a product that does not exist yet.
- **No CSV import of bank details.** `features/import` is spec-driven and a
  `student_bank_accounts` spec would be small, but a spreadsheet of account
  numbers passing through a browser is a different risk conversation from a
  spreadsheet of names. Details are entered by the admin on the student page, or
  by the student on their own profile.
- **No cancel path**, though `cancelled` exists in both enums. Cancelling a
  *draft* is just deleting it, and cancelling anything else means recalling money
  Billplz has already accepted — a phone call to Billplz, not a button. The enum
  value is reserved, not wired: `billplz-disburse` refuses a cancelled batch, and
  nothing sets one.
- **`billplz_enabled` is stored but not read.** `set_billplz_credentials` writes
  it and `remove_billplz_credentials` clears it, but disbursement gates on
  `billplz_has_secret` alone. ToyyibPay's `enabled` gates a student-facing Pay
  button; the incentive equivalent would gate an admin-only screen against the
  same admin who set the flag, which is a switch for nobody. It stays as the hook
  for a future "connected but paused".
- **No scheduled reconciliation.** `billplz-payout-status` is driven by the button
  and by the client's own loop. A cron sweep is the obvious next step and belongs
  with the invitation-expiry sweep already listed in `CLAUDE.md`.
- **No email or receipt from us.** Billplz notifies the recipient itself
  (`recipient_notification` defaults to true), and transactional email here is
  still the unconfigured test mailer — see `docs/production-urls.md`.

## Sandbox verification checklist

Everything below is single-source or inferred from the API reference, and can only
be settled against a live Billplz sandbox account with Payment Order enabled.

- [ ] **Both keys verify through `GET /payment_order_limit`** with `checksum` over
      `[epoch]` alone, and `total` comes back in **sen**. A wrong X Signature Key
      must fail here rather than being accepted and only breaking at
      `POST /payment_orders`.
- [ ] **Collection checksum order** `[title, callback_url, epoch]` is accepted with
      `callback_url` present. (The omit-when-absent branch is never taken — the
      callback URL is always sent.)
- [ ] **Payment order checksum order**
      `[payment_order_collection_id, bank_account_number, total, epoch]` is
      accepted, and `bank_code` / `name` / `description` / `email` really are
      excluded from the hashed message.
- [ ] **`DUMMYBANKVERIFIED` settles and a real SWIFT code fails** in sandbox — the
      sandbox switch on the settings card and the bank Select otherwise disagree
      about what a valid `bank_code` is.
- [ ] **`clean()`'s output survives `description`.** Confirm spaces and underscores
      are actually accepted at 200 chars, and that a title reduced to empty is
      caught by the `'Incentive'` fallback.
- [ ] **Insufficient funds really is `422` + `"You do not have enough payments"`.**
      The `/enough payments/i` test on the response body is the only thing
      separating "top up and resume" from "these rows failed", and a reworded
      message would silently mark a whole chunk failed.
- [ ] **The callback fires at all**, carries `reference_id`, and verifies against
      `[id, bank_account_number, status, total, reference_id, epoch]` — with the
      posted values hashed exactly as posted, no trimming and no re-encoding.
- [ ] **Drive a `refunded`** and confirm it overturns a `completed` row to
      `failed`, and that a replayed `completed` callback changes nothing.
- [ ] **Does `POST /payment_orders` ever return `completed` immediately?** The code
      maps it if so; if it never does, that branch is dead and the row simply waits
      for the reconciler.
- [ ] **`reference_id` uniqueness is per collection.** Re-post the same payout id
      into the same collection and confirm Billplz refuses it — that is a second
      line of defence behind `claim_incentive_payouts` against a duplicate
      transfer.
- [ ] **`GET /payment_orders/{id}` status vocabulary** matches the six documented
      values. Anything else lands in `provider_status` verbatim and maps to
      `processing`, which is the safe default but would keep a batch open.
- [ ] **`email` omitted defaults to the sender**, and `recipient_notification`
      defaults to true. Both are the reason those fields are handled the way they
      are, and neither is observable from our side.
