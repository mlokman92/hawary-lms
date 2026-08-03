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
`accept_pending_invitation` call it. Its exception strings are matched by
`apps/web/src/lib/invite.ts` to decide whether a failure is terminal — change
them in both places or the retry logic silently inverts.

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
