# Production URLs — Supabase Auth + Edge Function config

Everything the deployed app (`https://app.hawary.my`) needs so that **links we put
in emails point at production**, not at a developer's laptop. None of this lives
in the repo: it is project configuration on Supabase and Netlify. This doc is the
record of what it must be set to and why.

---

## 1. Auth URL configuration (the confirm-email bug)

**Symptom.** Sign up on `https://app.hawary.my`, open the confirmation email,
click the link — the browser lands on `http://localhost:3000` and nothing loads.

**Cause.** Not the app. `SignUp.tsx` correctly passes

```ts
emailRedirectTo: `${window.location.origin}/auth/callback?next=${…}`
```

which on production evaluates to `https://app.hawary.my/auth/callback?next=%2F`.
But GoTrue only honours a `redirect_to` that matches its **allow list**. Anything
else is silently discarded and replaced with the project's **Site URL**. A fresh
Supabase project ships with Site URL = `http://localhost:3000`, and this project's
was never changed — so every confirmation link resolved to the default. The auth
logs show it plainly: `/verify` and `/signup` requests carrying
`"referer": "http://localhost:3000"`, a port this app has never run on (Vite dev
is `5173`).

**Fix.** Dashboard → **Authentication → URL Configuration**
([direct link](https://supabase.com/dashboard/project/vpklztxqkvqmmzsxfqgp/auth/url-configuration)):

| Field | Value |
|-------|-------|
| **Site URL** | `https://app.hawary.my` |
| **Redirect URLs** | `https://app.hawary.my/**` <br> `http://localhost:5173/**` |

Site URL is the fallback *and* what `{{ .SiteURL }}` expands to in email
templates, so it must be the production origin. The `/**` wildcard covers every
path plus query strings; without it, `…/auth/callback?next=%2F` is rejected on
the query string alone. Keep `localhost:5173` listed so `pnpm --filter web dev`
still works — that entry only widens where *a developer's own* browser may be
sent, and only for links they themselves triggered.

Equivalent Management API call (needs a personal access token from
[Account → Access Tokens](https://supabase.com/dashboard/account/tokens)):

```bash
curl -X PATCH "https://api.supabase.com/v1/projects/vpklztxqkvqmmzsxfqgp/config/auth" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "site_url": "https://app.hawary.my",
    "uri_allow_list": "https://app.hawary.my/**,http://localhost:5173/**"
  }'
```

`uri_allow_list` is a **comma-separated string**, and a PATCH **replaces** it
wholesale — send the full list every time, never just the new entry.

**Flows that depend on this** (all build their redirect from
`window.location.origin`, so all were breaking the same way):

- `SignUp.tsx` → `/auth/callback?next=…` — sign-up confirmation.
- `ForgotPassword.tsx` → `/reset-password` — password recovery.

Invitation and pay links are *not* affected: those are ordinary app URLs built by
the Edge Functions (§2), not GoTrue redirects.

**Verify after changing:** sign up with a fresh address, and check the link in the
email starts with `https://vpklztxqkvqmmzsxfqgp.supabase.co/auth/v1/verify?…` and
carries `redirect_to=https%3A%2F%2Fapp.hawary.my%2Fauth%2Fcallback…`.

> A confirmation link is **single-use**. If it 403s with *"Email link is invalid
> or has expired"* on the first click, something opened it first — usually a
> corporate mail scanner prefetching links, or a double click. That is a separate
> problem from the wrong host, and it will still happen after this fix.

---

## 2. Edge Function secrets

Three functions build a link that ends up in front of a human, so all three must
know the canonical origin. They resolve it identically (`resolveBase`): **server
config only**, with a client-supplied `origin` honoured *solely* when it is
explicitly allowlisted, falling back to a hardcoded `https://app.hawary.my`.

| Function | Builds | Why the allowlist matters |
|----------|--------|---------------------------|
| `send-invitation` | `/accept-invite?token=…` | Otherwise any staff caller could have Hawary send a branded invite pointing at their own host. |
| `send-pay-link` | `/pay/<token>` | Same, for a "Pay now" email — arguably worse, since it invites a payment. |
| `create-bill` | ToyyibPay `billReturnUrl` | `verify_jwt = false`, so an *unauthenticated* caller would otherwise pick where the payer is sent after paying. |
| `send-course-access` | `/learn/courses/<course_id>` | Same, for the "you're enrolled" email sent when staff approve a request. |

```bash
supabase secrets set APP_URL="https://app.hawary.my"
# Origins a client may request via `origin` instead of APP_URL — local dev only.
supabase secrets set ALLOWED_ORIGINS="http://localhost:5173,https://app.hawary.my"
```

`ALLOWED_ORIGINS` entries are compared by **exact string match** against the
`origin` the client sends, so they carry no trailing slash and no path.

Without `APP_URL` these functions still emit correct production links (the
built-in default). What breaks is *local* development: pay/invite links in test
emails point at `app.hawary.my` until `ALLOWED_ORIGINS` includes
`http://localhost:5173`.

The remaining functions build no app-facing URLs and need no origin config —
`toyyibpay-connect`, `toyyibpay-callback`, `verify-payment`, `upload-media`,
`material-url` and the four `billplz-*` functions.

---

## 3. Netlify

Site settings → Environment variables (not committed):

- `VITE_SUPABASE_URL` = `https://vpklztxqkvqmmzsxfqgp.supabase.co`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Only `VITE_`-prefixed vars reach the bundle; the publishable key is safe there
because RLS bounds it. Build config is in `netlify.toml`, including the SPA
fallback (`/* → /index.html`, 200) that `/auth/callback` and `/reset-password`
need to resolve at all.

**Deploy previews** get a random `*.netlify.app` origin, which is *not* in the
auth allow list — so email confirmation and password reset will fall back to
`https://app.hawary.my` on a preview build. Test those two flows on production or
locally, not on a preview URL.

---

## Related

- `docs/ci-cd.md` — how each target deploys.
- `supabase/functions/*/README.md` — per-function security model and secrets.
- Transactional email is still on Supabase's low-rate test mailer; see
  `CLAUDE.md` → *Deferred / next*.
