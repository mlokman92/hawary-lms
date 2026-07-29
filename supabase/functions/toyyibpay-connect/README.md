# toyyibpay-connect

Saves an academy's ToyyibPay `userSecretKey` and auto-provisions a billing
category (`createCategory`) so onboarding needs only the secret.

**`verify_jwt = true`** — caller must be a signed-in **admin** of the academy
(checked with a caller-scoped client against `academy_members`, and re-checked by
the `set_toyyibpay_credentials` RPC).

The secret is sent once from the admin's browser over HTTPS, used server-side to
call ToyyibPay, then stored via `set_toyyibpay_credentials` (SECURITY DEFINER →
**Supabase Vault**). It is never written to a client-readable column and never
returned to the browser — the response carries only `has_secret`, `last4`,
`category_code`.

Body: `{ academy_id, secret_key, is_sandbox, category_code? }`. If `category_code`
is omitted, one is created automatically.

Secrets: `SUPABASE_URL`, `SUPABASE_ANON_KEY` (auto-injected). No service-role key.
