# ToyyibPay payments — design & implementation spec

Per-academy ToyyibPay collection: each academy pastes **its own ToyyibPay
`userSecretKey`**; its students pay via **FPX** directly into that academy's
ToyyibPay account. Money stays in **sen** end-to-end (ToyyibPay `billAmount` is in
cents — a 1:1 match, no conversion).

Status: **implemented (all phases) — pending live sandbox verification.** This doc
is the build spec; the "Sandbox verification checklist" at the end lists the two
gateway-specific behaviours (H2/H3) to confirm before switching an academy to live.

### What shipped

- **Migrations** (`supabase/migrations/`): `20260726120000_toyyibpay_settings.sql`,
  `…120100_toyyibpay_paylinks.sql`, `…120200_toyyibpay_intents.sql`,
  `…120250_toyyibpay_settings_policy_split.sql`. Applied; advisors clean
  (`get_toyyibpay_secret` / `record_gateway_payment` are **not** anon/authenticated
  executable — H1 confirmed).
- **Edge functions** (`supabase/functions/`, deployed): `toyyibpay-connect`
  (jwt), `create-bill` (public), `toyyibpay-callback` (public), `verify-payment`
  (public — active reconciler), `send-pay-link` (jwt, reuses the `send-invitation`
  Resend setup).

### Settlement is reconciliation-driven, not callback-driven

ToyyibPay's callback is unsigned, sometimes omits `order_id`, and **does not fire
reliably in the sandbox**. So settlement does **not** depend on it. `verify-payment`
re-queries `getBillTransactions` (by `billCode` only — passing `userSecretKey` makes
the sandbox return `"No data found!"`) and settles idempotently. It is driven by:
the result page polling it every 4s, and a staff **"Check payment status"** button on
the invoice detail. `toyyibpay-callback` (now also identifies the intent by
`bill_code` when `order_id` is absent) is just a fast-path. Both settle through the
same idempotent `record_gateway_payment` RPC.
- **Frontend**: `/settings` (admin) with the ToyyibPay card; public `/pay/:token`
  + `/pay/:token/result`; "Online payment" card on the invoice detail (share +
  email the link); sidebar Settings entry (admin only).
- **Config**: no new secrets required — `SUPABASE_SERVICE_ROLE_KEY` is
  auto-injected; email reuses the existing `RESEND_API_KEY`. Optionally set
  `APP_URL` on the functions so pay/return links use your real domain instead of
  the request origin.

To go live end-to-end you still need: an academy to paste a ToyyibPay key in
Settings, and the two sandbox checks below (H2 secret-scoping, H3 amount unit).

## Locked decisions

| Decision | Choice | Notes |
|---|---|---|
| Student reach | **Public tokenized pay link** `/pay/<token>` (no login) | No student portal exists yet; clones the `academy_invitations` token pattern. An authed branch can be added later without changing the edge functions. |
| Payment channel v1 | **FPX only** | `billPaymentChannel='0'`, `method='fpx'`. |
| Gateway fee | **Academy absorbs** (~RM1/FPX) | Student pays exactly the invoice total. Do **not** set `billChargeToCustomer`. |
| Category onboarding | **Auto-provision** via `createCategory` | Admin pastes only the secret key; a `toyyibpay-connect` edge fn creates the category server-side and stores the returned `categoryCode`. |
| Secret at rest | **Supabase Vault** (`supabase_vault` 0.3.1, installed) | Not a plaintext column. Root key lives outside the DB. |
| Secret readback | Impossible for any client | Only `service_role` edge fns decrypt it via a getter RPC. |
| Bill ↔ invoice bridge | Dedicated **`payment_intents`** table | `payments` stays the *settled-money* ledger. |
| Idempotency anchor | `payments UNIQUE(academy_id, provider, provider_ref)` | `provider_ref = ToyyibPay transaction id` (**not** bill_code — see M1). |
| Callback trust | Never trusted | Re-query `getBillTransactions` with the stored secret before settling. |
| Who edits the key | **Admin only** (`app.is_admin`) | Trainers/students have no access. |
| Sandbox | Per-academy `is_sandbox` flag | Pinned per intent so re-verification hits the same host. |

## Why this fits the existing schema

The billing schema was pre-built for a gateway:

- `payment_provider` enum already includes `'toyyibpay'`; `payment_method` already
  includes `'fpx'`.
- `payments` already has `provider_ref` and
  `UNIQUE(academy_id, provider, provider_ref) WHERE provider_ref IS NOT NULL` —
  the idempotency index for webhooks.
- Money is integer **sen**; ToyyibPay `billAmount`/callback `amount` are in
  **cents** → pass `total_sen` (outstanding) straight through.

So `payments` and all enums are **unchanged**. We add credential storage, an intent
bridge, a public token, some RPCs, and edge functions.

## End-to-end flow

```
Admin (Settings) ──paste userSecretKey──▶ toyyibpay-connect fn
                                             ├─ createCategory (server-side)
                                             └─ Vault.create_secret + settings(last4, category, enabled)
Admin (Invoice)  ──"Share pay link"────▶ ensure_pay_token ─▶ /pay/<token>  (WhatsApp/email)
Student opens /pay/<token> ─▶ [Pay with FPX] ─▶ create-bill fn
   create-bill: resolve invoice+academy from token (service role)
                get_toyyibpay_secret() ─▶ ToyyibPay createBill(billAmount=due_sen, extRef=intent.id)
                insert payment_intents(status=created, bill_code, host pinned)
                return https://<host>/<BillCode>
Student pays on ToyyibPay's hosted FPX page
ToyyibPay ──(unsigned POST)──▶ toyyibpay-callback fn (verify_jwt=false, service role)
   callback: lookup intent by order_id  → academy, invoice, intent.bill_code, intent.amount_sen
             IGNORE posted status/amount
             getBillTransactions(secret, intent.bill_code)   ← server-stored bill_code, not posted
             if a row has billpaymentStatus==1 AND amount==intent.amount_sen:
                rpc record_gateway_payment(intent_id, amount_sen, provider_ref=txn_id)
             else: mark intent failed, no invoice change
             always return 200 OK
Student's /pay/<token>/result page polls get_pay_status(token)  ← DB is source of truth
```

## Security model (hardened — from an adversarial review)

These are ship-blocking rules, not nice-to-haves.

### H1 — Revoke the secret getter from `public`
Postgres grants `EXECUTE` to `PUBLIC` by default; `anon`/`authenticated` inherit it.
"Revoke from authenticated" alone still lets **anon read every academy's secret**.

```sql
revoke execute on function public.get_toyyibpay_secret(uuid)      from public, anon, authenticated;
grant  execute on function public.get_toyyibpay_secret(uuid)      to   service_role;
revoke execute on function public.record_gateway_payment(uuid,int,text) from public, anon, authenticated;
grant  execute on function public.record_gateway_payment(uuid,int,text) to   service_role;
```

**Verify with an actual anon-key call test**, not only `get_advisors`: call the RPC
with the publishable key and assert it errors. (Mirror the existing
`create_invitation` migration, which correctly revokes from `public, anon`.)

### H2 — Re-verify against the server-stored bill_code (secret-scoping is void)
The callback is unsigned and public. Rules (as implemented):

1. Re-query with **`intent.bill_code`** (never the posted `billcode`).
2. Assert `posted billcode == intent.bill_code`; reject on mismatch.
3. **Sandbox finding:** ToyyibPay's `getBillTransactions` does **not** accept a
   `userSecretKey` — passing one makes the sandbox return the plain string
   `"No data found!"`. So secret-scoping is not usable here. The callback re-queries
   by **billCode only** and compensates with **mandatory** controls:
   - the per-bill `?k=<nonce>` must equal `intent.nonce` (unguessable), **and**
   - the returned transaction's `billExternalReferenceNo` must equal `intent.id`.
   Because we re-query **our own** stored bill_code (which belongs to the academy's
   ToyyibPay account), only a real payment on it yields `billpaymentStatus=1` — a
   forger cannot fabricate that.

### H3 — Lock the amount unit + assert exact match
`createBill.billAmount` / callback `amount` are cents; `getBillTransactions.billpaymentAmount`
is (per most deployments) an **RM-decimal string**. Lock this empirically in sandbox
and record it here. Because `billPriceSetting='1'` is fixed-price, the paid amount
must equal `intent.amount_sen` **exactly** — `record_gateway_payment` rejects/flags
any mismatch rather than trusting the number.

> **Confirmed in sandbox:** `getBillTransactions.billpaymentAmount` is an
> **RM-decimal string** (e.g. `"1.00"` for RM1.00). The callback normalizes it to
> sen and the RPC asserts an exact match against the fixed bill.

### H4 — A paid callback on a voided invoice must not un-void
If an invoice is voided/cancelled after a bill was minted, the bill stays payable.
On settlement, `record_gateway_payment` branches under `FOR UPDATE`:

- Persist the `payments` row (the money is real).
- If invoice is `void`/`cancelled`: **do not** change invoice status; mark intent
  `succeeded` + set a `needs_reconciliation` flag for manual refund.
- Else recompute `amount_paid_sen = SUM(succeeded)` and set `paid`/`partially_paid`.

### M1 — Idempotency on the transaction id, not bill_code
A bill can receive more than one successful transaction. Key idempotency on the
ToyyibPay **transaction id** (`billpaymentInvoiceNo`/`refno`) as `provider_ref` — one
`payments` row per real transaction. Keep `bill_code` on the intent for correlation.

### M2 — Overpayment guard
`amount_paid_sen = SUM(succeeded)` can exceed `total_sen` (manual + online, or two
partial bills). Detect `sum > total_sen`, cap status at `paid`, record the surplus
(credit/refund-due flag) rather than swallowing it.

### M3 — Token is a bearer credential
`/pay/<token>` is login-less. Mitigations:

- `Referrer-Policy: no-referrer` (meta + header) on all `/pay/*` pages so the token
  URL doesn't leak to ToyyibPay via `Referer`.
- `get_public_invoice` returns **minimal display fields only** (academy name/logo,
  invoice_no, amount due) — **no student PII** (name/email/phone), no line-item
  notes; rejects `draft`/`void`/`cancelled`. (The `billTo/billEmail/billPhone`
  prefill happens **only** inside the service-role `create-bill` fn.)
- Support expiry + revocation (clear `pay_token`). See open item on lifetime.

### M4 — Rate-limit the public create-bill
`create-bill` is anon and hits ToyyibPay's paid API. Rate-limit per token/IP, and make
intent reuse atomic (unique partial index on `(invoice_id) WHERE status IN
('created','pending')`, or `SELECT … FOR UPDATE` on the invoice before minting) so
concurrent calls can't mint two bills.

### L-tier (verify during build)
- **L1** Vault key replacement: `create_secret` collides on a fixed name → "Replace
  key" must call `vault.update_secret`. Handle both in `set_toyyibpay_credentials`.
- **L4** Pin sandbox/prod **host per intent**; if an admin flips `is_sandbox` after a
  bill exists, re-verification must still hit the original host.
- **L5** Short-circuit the callback once an intent is `succeeded`/`failed` (avoid
  quota drain from repeated POSTs).

## Data model changes (one migration `<ts>_toyyibpay.sql`)

```sql
-- (a) Per-tenant gateway settings. Secret is in Vault; only metadata here.
create table public.academy_payment_settings (
  academy_id              uuid primary key references public.academies(id) on delete cascade,
  provider                public.payment_provider not null default 'toyyibpay',
  toyyibpay_category_code text,
  toyyibpay_is_sandbox    boolean not null default true,
  toyyibpay_enabled       boolean not null default false,   -- gates the Pay button
  toyyibpay_has_secret    boolean not null default false,
  toyyibpay_secret_last4  text,
  toyyibpay_secret_set_at timestamptz,
  toyyibpay_secret_set_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.academy_payment_settings enable row level security;
create trigger set_updated_at before update on public.academy_payment_settings
  for each row execute function app.set_updated_at();
-- secret column does NOT exist here -> `select *` is always safe
create policy "aps staff read"  on public.academy_payment_settings for select to authenticated
  using (app.is_staff(academy_id));
create policy "aps admin write" on public.academy_payment_settings for all to authenticated
  using (app.is_admin(academy_id)) with check (app.is_admin(academy_id));

-- (b) Bill / payment intent: callback<->invoice bridge, attempt history, dedupe.
create table public.payment_intents (
  id           uuid primary key default gen_random_uuid(),  -- == billExternalReferenceNo / order_id
  academy_id   uuid not null references public.academies(id) on delete cascade,
  invoice_id   uuid not null,
  provider     public.payment_provider not null default 'toyyibpay',
  bill_code    text unique,
  host         text not null,                               -- 'https://toyyibpay.com' | 'https://dev.toyyibpay.com' (L4)
  amount_sen   integer not null,
  status       text not null default 'created'
               check (status in ('created','pending','succeeded','failed','expired')),
  provider_ref text,                                        -- ToyyibPay txn no (billpaymentInvoiceNo)
  nonce        text,                                        -- callback nonce (H2)
  needs_reconciliation boolean not null default false,      -- H4
  expires_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  foreign key (academy_id, invoice_id)
    references public.invoices(academy_id, id) on delete cascade
);
alter table public.payment_intents enable row level security;
create index on public.payment_intents (academy_id, invoice_id);
-- atomic reuse guard (M4): at most one live intent per invoice
create unique index payment_intents_live_uidx
  on public.payment_intents (invoice_id) where status in ('created','pending');
create trigger set_updated_at before update on public.payment_intents
  for each row execute function app.set_updated_at();
create policy "pi staff read" on public.payment_intents for select to authenticated
  using (app.is_staff(academy_id));
-- NO authenticated write policy: all writes are service-role (bypasses RLS).

-- (c) Public pay link on invoices.
alter table public.invoices
  add column pay_token text unique,
  add column pay_token_created_at timestamptz;
```

### RPCs

| RPC (schema `public`) | Security | Grant | Does |
|---|---|---|---|
| `set_toyyibpay_credentials(academy, secret, category, is_sandbox, enabled)` | DEFINER, guards `app.is_admin` | `authenticated` | Vault upsert (create/update — L1) + metadata upsert; returns `has_secret/last4` only. *(Called by `toyyibpay-connect` after `createCategory`, or directly.)* |
| `get_toyyibpay_secret(academy) → text` | DEFINER, `search_path=''` | **`service_role` only** (H1) | Reads `vault.decrypted_secrets`. |
| `ensure_pay_token(invoice) → text` | DEFINER, guards `app.is_admin` | `authenticated` | Mints/returns `invoices.pay_token`. |
| `get_public_invoice(token)` | DEFINER, `search_path=''` | `anon` | Minimal display fields (M3); rejects draft/void/cancelled. |
| `get_pay_status(token) → text` | DEFINER | `anon` | Status only. |
| `record_gateway_payment(intent_id, amount_sen, provider_ref)` | DEFINER, `search_path=''` | **`service_role` only** (H1) | Lock invoice `FOR UPDATE`; assert amount == intent (H3); `INSERT payments … ON CONFLICT DO NOTHING` keyed on txn id (M1); void-branch (H4); recompute `SUM(succeeded)`, cap at paid (M2); set intent status. |

Post-DDL: `get_advisors` (security → no exposed-secret / mutable-`search_path`; perf →
FK indexes) then `generate_typescript_types` → overwrite
`packages/shared/src/db/database.types.ts`.

## Edge functions

All copy the `send-invitation` skeleton (CORS, `json()` helper, `Deno.serve`). Unlike
`send-invitation` (caller-scoped, anon key), the gateway functions build a
**service-role** client because they read Vault secrets and write with no caller
identity. Secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_URL`.

### `toyyibpay-connect` — save key + auto-provision category (Phase 0)
- **Auth:** `verify_jwt=true`, caller-scoped read to prove `app.is_admin` on the
  academy (like `send-invitation`), then service-role for Vault write.
- **Input:** `{ academy_id, secret_key, is_sandbox }`.
- **Logic:** `POST {host}/index.php/api/createCategory` with `userSecretKey`,
  `catname="Hawary LMS <academy>"`, `catdescription`. On success store the returned
  `CategoryCode` + secret via `set_toyyibpay_credentials`. Surface ToyyibPay `msg` on
  error (invalid/draft key). Never returns the secret.
- **Output:** `{ ok, has_secret, last4, category_code }` or `{ ok:false, msg }`.

### `create-bill` — mint a bill, return the pay URL (Phase 2)
- **Auth:** `verify_jwt=false`. Boundary = the unguessable `pay_token`.
- **Input:** `{ pay_token }`.
- **Logic:** resolve invoice via `pay_token` (service role). Reject unless status ∈
  `{issued, partially_paid, overdue}` and `due = total_sen − amount_paid_sen ≥ 100`
  (RM1 min). Reuse a live intent (atomic, M4) → return cached URL. Load settings; if
  `!enabled`/no category → `{ok:false, code:'not_configured'}`. `get_toyyibpay_secret`.
  `POST {host}/index.php/api/createBill`: `billAmount=String(due)`,
  `billPriceSetting='1'`, `billPayorInfo='1'`, `billPaymentChannel='0'`,
  `billName=sanitize(invoice_no)` (`[A-Za-z0-9 _]`, ≤30 chars),
  `billExternalReferenceNo=intent.id`,
  `billReturnUrl=${APP_URL}/pay/${pay_token}/result`,
  `billCallbackUrl=${SUPABASE_URL}/functions/v1/toyyibpay-callback?k=${nonce}`,
  prefill `billTo/billEmail/billPhone` from the student record. Insert intent
  (`status=created`, `host` pinned, `bill_code`, `nonce`).
- **Output:** `{ ok:true, url: "${host}/<BillCode>" }`; gateway error → `502` + `msg`.

### `toyyibpay-callback` — confirm → ledger (Phase 3)
- **Auth:** `verify_jwt=false` (external caller has no JWT). Service role; own tenant
  lookup. **This is the deliberate exception to the `send-invitation` no-service-role
  rule** — document it in the function README.
- **Input:** form-urlencoded POST `billcode, order_id, status, amount, refno,
  transaction_id` + `?k=nonce`.
- **Logic:** look up intent by `order_id` (+ nonce match, H2). Unknown → `200` silently.
  Short-circuit if already `succeeded`/`failed` (L5). `get_toyyibpay_secret`; use
  `intent.host` (L4). `POST getBillTransactions {userSecretKey, billCode:intent.bill_code}`
  (H2). Find `billpaymentStatus==='1'`; normalize amount to sen (H3). If success and
  amount matches → `rpc record_gateway_payment(intent.id, amount_sen, provider_ref=txn_id)`.
  Non-success → intent `failed`. Always `200 "OK"` fast.

Deploy via `deploy_edge_function`; `create-bill` + `toyyibpay-callback` with
`verify_jwt=false`. Set `SUPABASE_SERVICE_ROLE_KEY`, `APP_URL` via `supabase secrets set`.

## Frontend changes

**New files**

| File | Purpose |
|---|---|
| `apps/web/src/pages/SettingsPage.tsx` | Admin-only shell; hosts the Payments card (role gate `active?.role==='admin'`). |
| `apps/web/src/features/settings/ToyyibPaySettingsCard.tsx` | Secret key (password input; shows `••••<last4>` + *Replace key* when connected), sandbox toggle, enabled toggle. On save → `toyyibpay-connect` (auto-creates category). shadcn `Input/Label/Switch/Button/Card`. |
| `apps/web/src/features/settings/api.ts` | `useGetPaymentSettings` (masked cols), `useSavePaymentSettings` → invoke `toyyibpay-connect`. |
| `apps/web/src/pages/PublicPayPage.tsx` | Reads `:token`; `usePublicInvoice`; academy name/logo + amount due (`formatMYR`); *Pay with FPX* → `useCreateBill` then `window.location.href=url`. No-sidebar layout like `AcceptInvitePage`. Sets `Referrer-Policy: no-referrer` (M3). |
| `apps/web/src/pages/PayResultPage.tsx` | Polls `usePayStatus(token)` (DB authoritative); renders paid / confirming… / failed. |

**Edited files**

| File | Change |
|---|---|
| `apps/web/src/App.tsx` | In `AppShell`: `<Route path="/settings" …/>`. **Outside `ProtectedRoute`** (next to `/accept-invite`): `/pay/:token` and `/pay/:token/result`. |
| `apps/web/src/components/AppSidebar.tsx` | Add `{ title:'Settings', to:'/settings', icon: Settings }`; hide for non-admins. |
| `apps/web/src/pages/InvoiceDetailPage.tsx` | Beside *Record payment*/*Void*: **Share pay link** → `useEnsurePayToken` then reuse `features/students/InviteLink.tsx` with `url=${origin}/pay/${pay_token}`; show *"Online payments not set up — go to Settings"* when `!enabled`. |
| `apps/web/src/features/payments/api.ts` | Add `useEnsurePayToken`, `useCreateBill` (invoke `create-bill`), `usePublicInvoice`, `usePayStatus`. |
| `packages/shared/src/db/database.types.ts` | Regenerated. |

**Reused unchanged:** `features/students/InviteLink.tsx`,
`packages/shared/src/domain/money.ts` (`formatMYR`/`ringgitToSen`), `send-invitation`
skeleton as copy source.

## Phased implementation plan

Each phase is independently shippable and ends with **verify**: `pnpm --filter web
build` + `pnpm --filter web lint`, plus `get_advisors` (security+perf) after any DDL
and `generate_typescript_types` → wire.

- **Phase 0 — Credential storage + Settings UI.** Migration (a) +
  `set_toyyibpay_credentials`/`get_toyyibpay_secret` (Vault, with H1 revokes) +
  `toyyibpay-connect` edge fn (auto-provisions category). `SettingsPage`,
  `ToyyibPaySettingsCard`, `/settings` route + sidebar. **Verify:** build+lint;
  `get_advisors` security clean; **anon-key call test proves `get_toyyibpay_secret`
  errors for anon (H1).**
- **Phase 1 — Public invoice + pay link.** Migration (c) + `ensure_pay_token` +
  `get_public_invoice` (grant `anon`, minimal fields). *Share pay link* on invoice;
  `PublicPayPage` renders invoice; `/pay/*` routes outside `ProtectedRoute`.
  **Verify:** anon RPC returns only safe fields, no PII (M3).
- **Phase 2 — `create-bill` + redirect.** Migration (b) `payment_intents`. `create-bill`
  fn + `useCreateBill`. **Verify (sandbox `dev.toyyibpay.com`):** bill creates, hosted
  FPX page loads, intent row written; rate-limit + atomic reuse (M4).
- **Phase 3 — `toyyibpay-callback` + settlement + result page.** `record_gateway_payment`,
  `get_pay_status`, `toyyibpay-callback` fn, `PayResultPage`. **Verify (sandbox
  simulator):** drive success **and** failure; **prove H2 secret-scoping**; **lock the
  H3 amount unit** and record it above; confirm idempotency (replay callback → no
  double credit); confirm void-branch (H4). Record the unit decision in this doc.
- **Phase 4 — Polish (optional).** Email the pay link (`send-pay-link`, best-effort like
  `send-invitation`); bill-expiry policy + late-payment reconciliation; overpayment
  surfacing (M2); `payment_intents` attempt history on the invoice page.

## Open items still to decide

1. **Pay-link lifetime & late payments** — default: non-expiring, revocable by clearing
   `pay_token`. A non-expiring bill can be paid after a void (H4 handles the ledger,
   but decide whether to auto-expire, e.g. `billExpiryDays=14`, + a "regenerate link" UX).
2. **Overpayment policy (M2)** — reject / cap / credit. Default: cap status at `paid`,
   flag surplus.

## Sandbox verification checklist (must pass before production)

- [x] `get_toyyibpay_secret` not anon/authenticated-executable — confirmed by
      advisors (H1).
- [x] `getBillTransactions` takes **billCode only** (a `userSecretKey` breaks it →
      `"No data found!"`); callback compensates with nonce + `billExternalReferenceNo`
      match (H2). **Verified end-to-end in sandbox.**
- [x] `billpaymentAmount` unit = **RM-decimal string** (`"1.00"`); normalized to sen +
      exact-match assertion (H3). **Verified: RM1 bill settled correctly.**
- [x] Callback `order_id` == `billExternalReferenceNo` (`intent.id`) — confirmed.
- [ ] Replayed/duplicate callback produces no double credit (M1) — covered by the
      `provider_ref` unique index; spot-check when convenient.
- [ ] Paid callback on a voided invoice persists money but does not un-void (H4).

## Sources

Research compiled from the ToyyibPay unofficial docs (fajarhac), the fakhrullah
OpenAPI spec, community SDKs (`Akim95/toyyibpay-js-sdk`, `pub.dev/packages/toyyibpay`),
and real integrations (WooCommerce `Bomstart/woo-toyyibpay`, `xputerax/toyyibpay`,
`khirulnizam/newsystem`). Amount-unit and param names cross-confirmed by ≥3 sources;
items marked "verify in sandbox" above are single/medium-confidence.
