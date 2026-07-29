# send-pay-link

Emails an invoice's public pay link (`/pay/<token>`) to the student. Reuses the
**same Resend setup as `send-invitation`** (`RESEND_API_KEY`, optional
`INVITE_FROM_EMAIL`).

**`verify_jwt = true`** — the invoice + student email are read with a
caller-scoped client, so RLS decides whether this staff member may send. The
recipient is **always** the student's stored email, never a request value. No
service-role key.

Email delivery is best-effort: without `RESEND_API_KEY` it returns
`{ ok: false, code: 'email_not_configured' }` and the web app falls back to the
copy-link flow — nothing breaks.

Body: `{ invoice_id, origin? }`. Mirrors `send-invitation`'s response shape.
