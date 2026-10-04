# toyyibpay-connect

Saves a branch's ToyyibPay `userSecretKey` and auto-provisions a billing
category (`createCategory`) so connecting needs only the secret.

**`verify_jwt = true`** — caller must be a signed-in **Director** of the academy:
an active admin membership with `academy_members.is_director`, checked with a
caller-scoped client **before** any ToyyibPay call (so an ordinary admin cannot
create a category on the branch's account), and re-checked by the
`set_toyyibpay_credentials` RPC (`app.is_director`, migration
`20261004100000_director_grants_staff`).

The secret is sent once from the Director's browser over HTTPS, used server-side to
call ToyyibPay, then stored via `set_toyyibpay_credentials` (SECURITY DEFINER →
**Supabase Vault**). It is never written to a client-readable column and never
returned to the browser — the response carries only `has_secret`, `last4`,
`category_code`.

Body: `{ academy_id, secret_key, is_sandbox, category_code? }`. If `category_code`
is omitted, one is created automatically.

Secrets: `SUPABASE_URL`, `SUPABASE_ANON_KEY` (auto-injected). No service-role key.
