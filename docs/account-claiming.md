# Joining an academy — invitations and self-claim

Two routes now lead to a membership. They share one body, so they cannot drift.

## The record is the invitation

A student or instructor record carrying an email is claimable by the person who
controls that email, with no link to chase:

```
my_pending_invitations()                    -> academies waiting for you
accept_pending_invitation(kind, record_id)  -> claim one
```

`my_pending_invitations` derives the list from `students` / `instructors` —
`user_id is null`, `archived_at is null`, `lower(email) = the caller's confirmed
email` — newest first. Deliberately *not* from `academy_invitations`: a CSV
import creates no invitation rows, so a token-shaped list would be empty exactly
when it matters most. Records the caller could not claim anyway are filtered out
here (one login backs at most one student and one instructor record per
academy), so the list never offers a seat that acceptance would refuse.

Both functions are gated on `auth.users.email_confirmed_at`. Without a token, a
verified email is the *entire* proof of identity — do not relax that.

`accept_pending_invitation` takes the record id rather than (academy, kind)
because a student email is legitimately duplicated across records
(guardian-shared inboxes) — the same reason invitations were anchored to a
`student_id` from the start. The caller may only name a record carrying their own
confirmed email, so the id disambiguates; it is not a capability.

**Role is derived from the record kind and never read from client input**
(student record → `student`, instructor record → `trainer`). That is what keeps
self-claim off the admin ladder.

## The token flow, unchanged

`create_invitation` (staff) / `create_instructor_invitation` (admin) still mint a
14-day token, `send-invitation` still emails it, `resend_invitation` /
`revoke_invitation` still manage it, and `/accept-invite?token=…` still works.
It survives for what it is good at: an email or WhatsApp message that lands the
person directly on the accept screen, plus revocation and audit.

What the token never was is the authorisation: `accept_invitation` has always
required `lower(auth email) = lower(invitation email)`. Claiming a record
directly is the same check without the round trip.

A successful claim closes any pending token invitation for that record, so staff
are not left chasing a "pending" invite for someone who already joined.

## Shared body

`app.link_claimed_record(kind, record_id, academy, role, caller)` holds the parts
worth getting right once: the archived / already-linked guards, the monotonic
role upsert (`admin` > `trainer` > `student`, never demoted) and
suspended-stays-suspended. Both `accept_invitation` and
`accept_pending_invitation` call it.

Its exception *strings* used to be matched by `apps/web/src/lib/invite.ts` to
decide whether a failure was terminal. They no longer are — see below.

## Releasing the stashed token

`hawary.pendingInvite` is a bearer credential parked in `localStorage`, and
`PendingInviteRedirect` used to treat it as outranking every landing route. So
the question "may this token be discarded?" decides whether a person can reach
the app at all, and it has to be answerable without reading English.

It was not. `isTerminalInviteError` matched the raise text against a list of
phrases and defaulted an unrecognised failure to *retryable* — keep the token,
try again — and the message it matched was never the server's: supabase-js only
constructs a real `PostgrestError` when the call used `.throwOnError()`, so the
`{ data, error }` form hands back the parsed JSON body, a plain object, and
`e instanceof Error ? e.message : fallback` had already replaced the reason with
"Could not accept the invitation." The list therefore never matched anything.

In production this cost an academy admin access to their own academy. They
opened an invite link meant for someone else; the token stuck; every landing
route — including the one a finished password reset ends on — bounced them to
`/accept-invite`, where the acceptance 400'd and the screen said it looked like
"a connection problem". Thirteen `accept_invitation` calls in the forty
minutes after the first reset (sixteen across the day), two password resets,
one sign-out, all HTTP 400, none of them able to release the token.

Three rules came out of it, and they are the load-bearing part:

- **Classify on `error.code`, never on the message.** `lib/errors.ts` reads
  `message`/`code` off the plain object. `isRetryableInviteError` keeps the
  token only where the function never rendered a verdict: an empty code
  (PostgREST did not answer in its own voice), any `PGRST…` code except
  `PGRST1xx` (a malformed request is the one PostgREST complaint that repeating
  cannot help), `42501` (refused as `anon` — the token did not attach) and the
  transient Postgres classes `08`/`40`/`53`/`57`. **Everything else is final.**
  An unrecognised failure now releases the token instead of outliving it.
  Prose is not a contract; SQLSTATE is.

  `errorMessage` applies the same signal to what a person is shown: a real
  `Error` was built deliberately so its message is read, but a plain object is
  only quoted when PostgREST answered — otherwise the "message" is
  `TypeError: Failed to fetch` or a whole HTML error page. That is also why
  `PGRST1xx` never reaches a screen: `JSON object requested, multiple (or no)
  rows returned` is a note to a developer.
- **A stashed credential never outranks an existing membership.**
  `PendingInviteRedirect` now takes the same "only while they still have
  nowhere to be" guard that `AppShell`, `StudentShell` and `useLandingTarget`
  already had — it was the one site where the token branch sat *above* it. A
  real invitee has no membership yet, and a live invite link carries its own
  `?token=`.
- **A retry has to actually retry.** The old "Try again" only set state that no
  effect depended on, so it rendered "Joining…" forever. The acceptance effect
  is keyed on `(account, token, attempt)`.

## Where the invitee sees it

`features/invitations/PendingInviteList.tsx` renders the list and joins; it
renders nothing when there is nothing pending, so it sits unconditionally on:

- **`/onboarding`** — the important one. This page used to be the founder form
  and nothing else, which trapped an invited student: the only way forward was
  creating an academy, which makes them staff and evicts them from `/learn`. The
  old escape hatch (a token in `localStorage`) only fired if the link had been
  clicked *on that device*. Now invitations lead and "create one instead" is a
  secondary action.
- **`/profile` and `/learn/profile`** — the only place an existing member would
  ever find out that a second academy has added them.

## Accepted risk: instructor self-claim

`instructors` INSERT is `app.is_staff` but `create_instructor_invitation` is
`app.is_admin` — an asymmetry migration 0024 introduced on purpose. Self-claim
bypasses it: a trainer can create an instructor record with an email they
control and claim it, minting a second trainer account. This is a deliberate
product decision (auto-claim for both kinds, no per-record opt-out). It is
lateral, not escalation — `trainer` cannot reach `admin` this way, because the
role comes from the record kind.

If it ever needs closing, tighten the `instructors: staff insert` policy to
`app.is_admin`. Do not special-case the claim function: the invariant belongs on
the table that mints the subject.
