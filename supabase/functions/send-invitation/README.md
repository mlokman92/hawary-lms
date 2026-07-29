# send-invitation

Edge Function that emails an academy's student-invitation accept link.

The web app already mints the invitation (the `create_invitation` RPC → a row in
`academy_invitations` with a token). This function turns that token into a
delivered email. The **Invite Student** dialog calls it automatically right after
creating the invite; if delivery isn't configured or fails, the dialog falls back
to a copyable link, so the flow never blocks.

## How it stays safe

- `verify_jwt = true` — the caller must be signed in.
- The invitation is read with a **caller-scoped** Supabase client (the caller's
  JWT), so Row Level Security decides whether they may see it. A non-staff user,
  or staff of another academy, gets no row — authorization comes for free from the
  existing `academy_invitations` / `academies` policies.
- The recipient is **always** the invitation's stored `email`, never a value from
  the request body — this can't be used as an open email relay.
- The accept-link base is **never** taken from arbitrary client input. It comes
  from `APP_URL`; a client-supplied `origin` is honoured only if it exactly
  matches `ALLOWED_ORIGINS`. All interpolated values are HTML-escaped. This stops
  anyone crafting a Hawary-branded email whose link points at an attacker domain.
- No service-role key is used.

## Configuration (function secrets)

Set these on the project (Dashboard → Edge Functions → Secrets, or the CLI):

```bash
supabase secrets set RESEND_API_KEY=re_xxxxxxxx
# Optional — until you verify a domain, Resend's shared sender only delivers to
# your own Resend account email. After verifying yourdomain.com:
supabase secrets set INVITE_FROM_EMAIL="Hawary LMS <invites@yourdomain.com>"
# Recommended — canonical base URL used to build the accept link in the email.
supabase secrets set APP_URL="https://app.hawary.my"
# Optional — origins a client may request instead of APP_URL (e.g. local dev).
supabase secrets set ALLOWED_ORIGINS="http://localhost:5173,https://app.hawary.my"
```

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are injected by the platform. If neither
`APP_URL` nor an allowlisted `origin` is present the link falls back to a safe
built-in default (never to unvalidated client input).

Without `RESEND_API_KEY` the function returns
`{ ok: false, code: 'email_not_configured' }` and the UI shows the copy-link
fallback — nothing errors.

## Request / response

`POST` with a Supabase auth JWT in `Authorization`. Body:

```json
{ "token": "<invitation token>", "origin": "https://app.hawary.my" }
```

`origin` is optional and only used to build the link when `APP_URL` isn't set.

Responses:

| Body                                                    | Meaning                                  |
| ------------------------------------------------------- | ---------------------------------------- |
| `{ "ok": true, "id": "...", "to": "..." }`              | Email accepted by Resend.                |
| `{ "ok": false, "code": "email_not_configured", ... }`  | No provider key set — use the copy link. |
| `{ "ok": false, "code": "send_failed", "message": ... }`| Provider rejected/unreachable.           |
| `4xx` with `{ "error": ... }`                           | Bad/again-not-pending token, or not permitted. |

## Deploy

Deployed via the Supabase MCP `deploy_edge_function` (or
`supabase functions deploy send-invitation`).
