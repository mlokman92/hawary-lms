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

## The token flow — same machinery, no button

`create_invitation` (staff) / `create_instructor_invitation` (admin) still mint a
14-day token, `send-invitation` still emails it, `resend_invitation` /
`revoke_invitation` still manage it, and `/accept-invite?token=…` still works.
It survives for what it is good at: an email that lands the person directly on
the accept screen, plus revocation and audit.

**What changed is when it fires.** There is no "Invite to app" button any more,
on either detail page, and no separate "Invite student" / "Invite instructor"
dialog. *Adding somebody invites them*: the create branch of
`StudentFormDialog` / `InstructorFormDialog` calls
`features/invitations/autoInvite.ts` → `sendRecordInvite`, which mints and
sends. A CSV import asks once — a checkbox, on by default — and then invites the
whole batch, one at a time with a gap, because the provider limits *requests*
and each invitation costs two.

`sendRecordInvite` **never throws**, and that is the whole design: the record
already exists and is claimable without a token, so a failure is a missed
notification, not a missed grant. Three failures are ordinary rather than
exceptional — no email on the record, a trainer adding an instructor (below),
and the provider being down. None of them is reported on the single-add path;
`PendingInvitations` on `/students` and `/instructors` is now the only place
staff act on an invitation, which makes it more load-bearing, not less.

**A trainer adding an instructor sends nothing.** `create_instructor_invitation`
is admin-only by deliberate hardening — a trainer who could mint one could
invite an address they control and make themselves a second trainer — while
`instructors: staff insert` lets a trainer create the record. So the form skips
the call for a non-admin rather than making it and showing a raw Postgres error,
which is what the old button did. The person is still reachable: their record
carrying their confirmed email is an invitation in itself. Making "always
invites" literally true would mean tightening `instructors: staff insert` to
`app.is_admin` — the fix this document already names — not relaxing the RPC.

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

## The founder form is not a landing page

`/onboarding` answers one question — "you belong nowhere; what now?" — and for a
long time it never checked whether that was still true. `ProtectedRoute` asks
only whether you are signed in.

Invitations-first fixed the *first* visit and nothing after it, because
`hasInvites` empties the instant one is accepted. Press Back, reopen the
confirmation email, or hit a bookmark, and the same URL now renders "Create your
academy" to somebody who became a student thirty seconds ago. Submitting it is
self-serve academy creation working exactly as designed: creator becomes admin.

That is not hypothetical. On 24 Aug 2026 a student of Hawary Academy claimed her
CSV-imported record at 05:22:43 and founded an empty academy — which she also
named "Hawary Academy" — at 05:24:48. Two minutes and five seconds. Afterwards
every sign-in put her in the back office, because `useLandingTarget` ranks staff
above student and she was now staff *of her own shell*. The switcher showed two
rows with identical names. She reported that she had been made an admin of her
school, and from her side of the screen that is precisely what it looked like.

Four of the seven academies in the database were empty single-member shells;
three were created that same morning by people trying to reach Hawary Academy.

Two rules came out of it:

- **Membership is the gate.** An existing member who reaches `/onboarding` is
  returned to `useLandingTarget()`. The page is for people with nowhere to be.
- **Arriving has to be deliberate.** `?new=1` — sent only by the switcher's
  "Add academy" — is what still opens the founder form for a member. A query
  param and not router state, because the accidents were reloads and Back.

A learner therefore has no button that founds an academy. That is not a new
restriction: `ShellSidebar` already leaves "Add academy" out of the learner
switcher, for the same reason it was always wrong here — founding one makes you
staff and evicts you from `/learn`.

What this does **not** fix: somebody with no record waiting and no invitation
still meets the founder form and nothing else. Two of the three shells that
morning were exactly that — people who came to join a school and were offered
only the option to start one. `/enroll/:slug` is the door they needed and never
saw. That is a separate piece of work.

## Nobody stays "Unnamed"

`InviteStudentDialog` used to ask for one field, an email, and mint a `students`
row from it. Attaching an account later wrote `user_id` and nothing else. So the
record stayed nameless for ever, while the account that had just proved it owns
that email carried a name on its profile all along. The name existed; it never
crossed the gap.

**The fill hangs off the column, not off the RPCs.** Seven things attach an
account to a record: `accept_invitation`, `accept_pending_invitation` and
`join_academy` (all via `app.link_claimed_record`), `link_student_account` and
`link_instructor_account` (which run their own UPDATE and never call it), and —
because `students: staff update` / `instructors: staff update` put no column
restriction on `user_id` — a plain PostgREST write, on either table. Putting the
backfill inside `link_claimed_record` would have covered three of the seven.
`app.fill_record_identity`, a `BEFORE INSERT OR UPDATE OF user_id` trigger on
both tables, covers all seven and whatever is written next.
`app.link_claimed_record` is deliberately untouched: `lib/invite.ts` is coupled
to the shape of its failures.

`app.sync_profile_identity` catches the other direction in time — somebody who
joins with a blank profile and fills it in afterwards. `AFTER UPDATE OF
full_name` with a `WHEN` clause, because `UPDATE OF` fires on assignment rather
than on change and `useUpdateMyProfile` writes the column on every save. There
is no INSERT branch: `students.user_id` references `profiles(id)`, so at
profile-insert time there are provably zero rows to fill — and
`app.handle_new_user` runs inside GoTrue's own `auth.users` transaction, where
anything raised would fail account creation.

Three rules hold both triggers together:

- **Fill blanks, never rename.** `coalesce(btrim(x), '') = ''` — NULL, empty and
  whitespace alike. A name staff typed outranks a self-service profile, and a
  later rename must not retitle someone's record in a different academy.
- **Match on `user_id`, never on a matching email.** Two of the four blank rows
  in this database have an auth account with the same address and are left
  alone. Guessing at a record nobody has claimed is a different decision, and a
  worse one.
- **Name only.** Phone looks like the same problem and is not: 27 linked pairs
  already disagree about it, and `create-bill` sets ToyyibPay's `billPayorInfo`
  when payer name + email + phone are all present, which *locks* those fields on
  the FPX page. Backfilling a stale self-service phone would quietly take away
  the payer's ability to correct it.

What was **not** built, on purpose: a mirror writing the record's name back onto
the profile. `profiles` is readable by `app.shares_academy`, which is
role-agnostic — every co-member, students included — so promoting a value that
staff typed behind `app.is_staff` into `profiles` publishes it to every member
of every *other* academy that person belongs to. It would also have inverted the
lock order against the profile trigger.

### On screen

`personName(name, email)` in `lib/format.ts` — sibling of `initialsOf`, same two
arguments for the same reason. It returns null only when both are empty, so the
caller still supplies the last-resort label in the reader's own language. An
address identifies somebody; "Unnamed" identifies nobody.

Note that `full_name ?? t('common.unnamed')` — the shape at roughly twenty call
sites — catches NULL but not `''`, so an empty-string name renders as *nothing
at all*, which is worse than the fallback it was meant to trigger.
`personName` trims, so it closes that too. `join_academy` now also wraps the
profile value in `nullif(btrim(...), '')` rather than writing it raw.

Applied where the surface is identifying a person and already holds the email:
the student detail heading, the student list, and — the one that matters most,
because a file outlives a screen — the invoice and receipt **bill-to** block,
which printed "Unnamed" while the email sat two lines below it. `create-bill`
falls through to the email before the generic word "Customer" on the payer's
bank confirmation. `hasFullPayer` is deliberately not relaxed: an email is a
usable label, not a name.

Deliberately **not** given an email fallback: `LearnAppointmentsPage`, which
names instructors to a student, and `HeaderSearch`, whose second line already
prints the address.

One site was a correctness bug rather than a fallback. `AvailabilityCard` drew
time off as "whole academy" whenever the instructor had no name — the flag is
`instructor_id` being null, not the name being absent, so one unnamed
instructor's afternoon off read as the academy shutting for the day.

### Left open

`unlink_instructor_account` leaves a copied name behind on the academy's record.
That is correct — the record belongs to the academy, not to the person who was
briefly attached to it — but it is worth knowing. And a placeholder name is not
a blank one: "Test" is a live `full_name` in this database, and nothing here
repairs that.
