# verify-payment

Actively reconciles an invoice's payment by re-querying ToyyibPay's
`getBillTransactions` and settling server-side — so payment status updates **even
if the gateway callback never arrives** (the callback is unsigned, sometimes omits
`order_id`, and does not fire reliably in the sandbox).

**`verify_jwt = false`** — called from the public pay/result page; the boundary is
the unguessable `pay_token`. Uses the service role. No secret is needed:
`getBillTransactions` is queried by `billCode` only, and settlement requires the
returned `billExternalReferenceNo` to equal our intent id (the same H2 compensating
control as the callback).

Body: `{ pay_token }`. Returns `{ ok, invoice_status, intent_status }`.

Idempotent and cheap: short-circuits with no ToyyibPay call once the invoice is
`paid`; otherwise re-queries each non-terminal intent's bill and settles via
`record_gateway_payment`.

Callers:
- **Result page** (`/pay/:token/result`) polls it every 4s until settled (self-heals).
- **Staff** "Check payment status" button on the invoice detail triggers it on demand.
- **pg_cron** `payment-intent-sweep` calls it every 15 minutes for each invoice with
  a live intent from the last 14 days — so a payer who paid and never came back is
  still settled (`20261012140000_payment_intent_sweep.sql`).

This is the **authoritative reconciler**; `toyyibpay-callback` is just a fast-path.
