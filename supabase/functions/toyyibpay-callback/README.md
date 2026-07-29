# toyyibpay-callback

Server-to-server payment notification from ToyyibPay → settles the invoice.

**`verify_jwt = false`** — ToyyibPay's server has no Supabase JWT. This is the
deliberate exception to the `send-invitation` "no service role" rule: the function
uses the **service role** and does its own tenant lookup.

## Why it's safe even though it's public + unsigned

The callback is unsigned, so its posted `status`/`amount` are treated only as a
"go check" trigger. Before crediting anything the function:

1. resolves **our own** `payment_intents` row by `order_id` (== `intent.id`),
2. requires the URL nonce `?k` to equal `intent.nonce`,
3. requires the posted `billcode` to equal the **stored** `intent.bill_code`,
4. re-queries `getBillTransactions` with the **academy's own secret** and the
   **stored** bill code — a forger can't fabricate a real ToyyibPay transaction,
5. records the payment via `record_gateway_payment` (service-role RPC), which is
   idempotent on the ToyyibPay transaction id and asserts the amount matches the
   fixed bill.

Always returns HTTP 200 quickly so ToyyibPay doesn't retry-storm.

Secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (both auto-injected).

> **Sandbox to lock before production** (see `docs/toyyibpay-payments.md`):
> confirm `getBillTransactions` rejects a wrong secret (H2), and the unit of
> `billpaymentAmount` (H3).

Deploy: `deploy_edge_function` with `verify_jwt=false`.
