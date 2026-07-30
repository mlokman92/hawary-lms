# send-pay-link

Emails an invoice's public pay link (`/pay/<token>`) to the student. Reuses the
**same Resend setup as `send-invitation`** (`RESEND_API_KEY`, optional
`INVITE_FROM_EMAIL`).

**`verify_jwt = true`** — the invoice + student email are read with a
caller-scoped client, so RLS decides whether this staff member may send. The
recipient is **always** the student's stored email, never a request value. No
service-role key.

The pay-link base is **never** taken from arbitrary client input: it comes from
`APP_URL`, and a client-supplied `origin` is honoured only when it exactly
matches `ALLOWED_ORIGINS` (same `resolveBase` rule as `send-invitation`).
Otherwise any staff caller could have Hawary send a branded "Pay now" email
pointing at their own host. Falls back to `https://app.hawary.my`.

Email delivery is best-effort: without `RESEND_API_KEY` it returns
`{ ok: false, code: 'email_not_configured' }` and the web app falls back to the
copy-link flow — nothing breaks.

Body: `{ invoice_id, origin? }`. Mirrors `send-invitation`'s response shape.
