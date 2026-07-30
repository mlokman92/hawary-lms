# create-bill

Mints a ToyyibPay bill for an invoice and returns the hosted FPX payment URL.

**`verify_jwt = false`** — called from the login-less public pay page
(`/pay/<token>`). The security boundary is the unguessable `pay_token`; tenancy is
derived from data (`pay_token → invoice → academy`), never from the request body.

Uses the **service role** to resolve the invoice, read the academy's secret
(`get_toyyibpay_secret` is service-role only), and write `payment_intents`. The
secret never leaves the function. A per-bill nonce is embedded in the callback URL
and stored on the intent so `toyyibpay-callback` can authenticate itself.

Amount is passed as **cents = sen** (no conversion). FPX only
(`billPaymentChannel='0'`). Reuses a live intent so a repeated click can't mint
duplicate bills (backed by a partial unique index).

Secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (auto-injected), plus
`APP_URL` — the canonical base for `billReturnUrl`, e.g. `https://app.hawary.my`.
Optional `ALLOWED_ORIGINS` (comma-separated) lists origins a client may request
via `origin` instead, e.g. for local dev. A client `origin` that isn't
allowlisted is **ignored**: because `verify_jwt=false`, anyone can call this
function, so an unvalidated origin would let a stranger choose where ToyyibPay
sends the payer after paying. With neither secret set the link falls back to
`https://app.hawary.my`.

Deploy: `deploy_edge_function` with `verify_jwt=false`.
