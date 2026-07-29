# Plan · Academy registration & account setup

How people get into Hawary LMS. Two flows:

- **A. Academy registration** — self-serve. A person signs up and creates an academy;
  they become its first **admin**.
- **B. Account setup** — the academy admin **invites** trainers and students into that
  academy (email invitation). Not Hawary-managed.

This builds on the schema already applied (`academies`, `profiles`, `academy_members`,
and the `app.*` tenancy helpers). Auth is **Supabase Auth (email + password)** with
**email confirmation on**; email is the only notification channel in v1.

---

## Identity & reconciliation (implemented — supersedes the specifics in Flow B below)

**Identity is global; roles/records are per-academy.** One email = one Supabase auth
account = one `profiles` row, globally. That single profile can simultaneously be admin
of the academy it created, a **student** in academy X, and a student in academy Y
(each = a `students` row + an `academy_members` row). A person can also self-register
and create their own academy. So the single-origin app + academy switcher is correct —
**no subdomains** (per-origin sessions would fragment the multi-academy user; slugs stay
for invite/public links, subdomains only ever for future public/marketing pages).

**Duplicate student emails are allowed.** Admins may enter the same email on multiple
student records (guardian-shared, dupes). So invitations are **anchored to a specific
`student_id`, not an email** — linking is unambiguous even with duplicates. Guardrail:
`unique(academy_id, user_id)` on `students` means one login backs at most one student per
academy.

**Reconciliation = link a global profile to a per-academy student record.** Implemented
as two `SECURITY DEFINER` RPCs (no Edge Functions):

- `create_invitation(student_id)` — staff only; supersedes older pending invites; returns
  a `token`. The app builds `…/accept-invite?token=…` and emails it: right after creating
  the invite, the **Invite Student** dialog calls the **`send-invitation` Edge Function**
  (Resend), which re-reads the invitation with a *caller-scoped* client (RLS enforces
  staff-of-academy) and emails the link to the invitation's stored address. Delivery is
  best-effort — the copyable link is always shown as a fallback, and if `RESEND_API_KEY`
  isn't set the function returns `email_not_configured` and the UI just shows the link.
  See `supabase/functions/send-invitation/README.md` for the secrets.
- `accept_invitation(token)` — the signed-in invitee. Verifies the caller's email matches
  the invite, sets `students.user_id = auth.uid()` for the invitation's `student_id`, and
  upserts the `academy_members` row. Idempotent. Covers all four cases uniformly:

  | Existing auth account? | Academy pre-made a record? | Result |
  |---|---|---|
  | No / Yes | Yes (Add Student) | **links** that record (reconcile) |
  | No / Yes | No | creates a student record + membership |

Accept flow in the app: `/accept-invite?token=…` → if signed out, sign up/**sign in with
the invited email** (routes carry `?next=`); then the RPC runs and the switcher shows the
new academy. (With email-confirmation ON, the confirm step must precede accept — resolved
by the Supabase invite email once SMTP is set up.)

**Avatars** live in a public `avatars` Storage bucket; writes are staff-scoped by the
first path segment (`<academy_id>/…`) via `storage.objects` RLS.

---

## Building blocks already in place

- `profiles` is auto-created for every new auth user (trigger `app.handle_new_user`).
- Creating an academy makes the creator its admin (trigger `app.handle_new_academy`,
  which fires when `academies.created_by = auth.uid()`).
- RLS: `academies` INSERT is allowed for any authenticated user **only** when
  `created_by = auth.uid()` → safe self-serve academy creation.
- RLS: `academy_members` INSERT is **admin-only**. This is why adding a
  trainer/student runs through an **Edge Function (service role)**, not a direct client
  insert — the invitee cannot add themselves.

---

## Flow A — Academy registration (self-serve)

**Screens (web / admin surface):**

1. **Sign up** — email, password, full name, phone → `supabase.auth.signUp({ email,
   password, options: { data: { full_name, phone } } })`. Confirmation email sent.
2. **Confirm email** — link returns to the app (`emailRedirectTo`).
3. **First login → onboarding check** — query `academy_members` for the current user:
   - **0 memberships** → show **“Create your academy”**.
   - **≥1 membership** → go to dashboard (with an academy switcher if more than one).
4. **Create academy** — name, slug (auto-suggested from name, availability-checked),
   phone, address, state, postcode, SST fields → `insert into academies (…, created_by
   = auth.uid())`. The trigger creates the admin membership. Land in the admin dashboard.

**Notes & rules**
- **Slug** is unique (case-insensitive index already exists); show live availability and
  handle the unique-violation gracefully.
- **Multi-academy**: a user may create/belong to several academies. Keep an *active
  academy* in client state; every query is scoped to it and RLS enforces isolation.
- **No approval gate** in v1 (self-serve). Add one later if abuse appears.
- Require a **confirmed email** before academy creation.

---

## Flow B — Account setup (admin invites trainers & students)

Invitation-based. Adds one table + two Edge Functions.

### New schema (migration `0006_invitations`)

```
create type public.invitation_status as enum ('pending','accepted','revoked','expired');

create table public.academy_invitations (
  id               uuid primary key default gen_random_uuid(),
  academy_id       uuid not null references public.academies(id) on delete cascade,
  email            text not null,                 -- stored lower-cased
  role             app.user_role not null,        -- admin | trainer | student
  status           public.invitation_status not null default 'pending',
  token            text not null unique,          -- high-entropy, set server-side
  invited_by       uuid references public.profiles(id) on delete set null,
  expires_at       timestamptz not null default (now() + interval '14 days'),
  accepted_at      timestamptz,
  accepted_user_id uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index academy_invitations_pending_email_key
  on public.academy_invitations (academy_id, lower(email)) where status = 'pending';
create index academy_invitations_academy_id_idx on public.academy_invitations (academy_id);
create index academy_invitations_email_idx       on public.academy_invitations (lower(email));
-- RLS: admins of the academy manage rows (select/insert/update/delete via app.is_admin).
-- The invitee never reads this table directly — acceptance goes through an Edge Function
-- using the token + the service role.
```

### Edge Functions

1. **`invite-member`** (caller = authenticated admin)
   - Input: `{ academy_id, email, role }`.
   - **Verify the caller is an admin of `academy_id`** (from their JWT + membership) —
     never trust a client-supplied role/academy without this check.
   - Create the invitation row (service role), generate the token.
   - Send the invite **email** with a link: `…/accept-invite?token=<token>`
     (via Supabase `auth.admin.inviteUserByEmail` for new emails, or transactional
     email for existing users). English template for v1.

2. **`accept-invite`** (caller = authenticated user who followed the link)
   - Input: `{ token }`.
   - Load invitation by token; validate: `status = 'pending'`, not expired, and
     **`invitation.email == auth.email()`** (binds the invite to the intended person).
   - `insert into academy_members (academy_id, user_id = auth.uid(), role =
     invitation.role)` using the **service role** (RLS is admin-only), then mark the
     invitation `accepted` (`accepted_at`, `accepted_user_id`). **Idempotent**.
   - Role comes from the invitation (admin-created), never from client input → no
     self-escalation.

**Invitee journeys**
- *New person*: invite email → set password (Supabase invite) → land on accept-invite →
  membership created → into the app.
- *Existing account*: click link → (log in if needed) → accept-invite adds the new
  membership. One person can belong to multiple academies.

**Admin management UI**
- Members list (name, role, status) with role change / suspend / remove (existing
  admin RLS on `academy_members`).
- Invite modal (email + role); pending-invitations list with **resend** and **revoke**
  (`status = 'revoked'`).

---

## Security checklist (carry the lessons from the schema review)

- `invite-member` re-checks admin membership server-side; ignore any client role/academy
  claims beyond the inputs it validates.
- Invitation **token**: ≥256-bit, single-use, expiring; bind acceptance to the email.
- `accept-invite` sets the role **from the invitation**, not from the request.
- Service-role key lives **only** in Edge Functions.
- Generic responses on invite (avoid email enumeration); rate-limit invites.
- Optional `pg_cron` job to flip past-due `pending` invitations to `expired`.

---

## Config / infrastructure

- **Supabase Auth**: enable email confirmations; set Site URL + redirect allow-list for
  the web origin and the mobile deep-link scheme; customise auth email templates.
- **SMTP**: configure a production sender (Resend / Postmark / SES) for auth + invite +
  invoice emails (the built-in Supabase mailer is rate-limited).
- **Mobile deep links**: expo-router scheme for `accept-invite` and password reset.
- **Env**: apps use the publishable key only; service-role key stays server-side.

---

## Phased delivery

**Phase 1 — Auth + academy self-registration**
- Configure Supabase Auth (confirmations, redirect URLs, SMTP).
- `@hawary/shared`: auth helpers + `useAuth` (session) + active-academy context.
- Web: sign-up / login / forgot-password / confirm screens + “Create academy” onboarding.

**Phase 2 — Account setup (invites)**
- Migration `0006_invitations` (+ RLS).
- Edge Functions `invite-member` and `accept-invite` (+ email).
- Web admin: members + invitations UI; invitee accept flow (web + mobile deep link).

**Phase 3 — Polish**
- Resend / revoke / expiry cron; multiple-admin support; basic audit; (later) bulk
  student import and self-service join codes.

**Recommended start:** Phase 1 (auth + academy self-registration) — it unblocks every
other screen. Say the word and I’ll implement it.
