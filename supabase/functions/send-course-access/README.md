# send-course-access

Emails a student that their enrollment request was approved and the course is
now open. One email, once, per approved request.

## Trust model

Identical to `send-invitation`, and for the same reasons:

- **Caller JWT + RLS.** `verify_jwt = true`. The enrollment is read with a
  caller-scoped anon client, so a non-staff caller — or a staff member of
  another academy — gets no row and a 404. **No service-role key is used
  anywhere in this function.**
- **The recipient is never client input.** The request body carries an
  `enrollment_id` and nothing else. The address is read from `students.email`
  under the caller's own JWT. This is what stops the endpoint being an open
  relay.
- **Links come from server config.** `resolveBase()` uses `APP_URL`; a
  client-supplied `origin` is honoured only when it exactly matches
  `ALLOWED_ORIGINS`. Every interpolated value is HTML-escaped.

## Why it refuses rows with a null `access_email_at`

Three of the four ways a student becomes `active` must stay silent — staff
enrolling from the student page, bulk enrol, and the public join link (which
only creates a request). Only `public.approve_enrollment` stamps
`access_email_at`, under the same row lock as the transition.

So **that column is the authorization to send.** Without it there is no
reachable path from this endpoint to a student who was never approved through
the request list. Every one of the 639 enrollments already active when this
shipped has a null `access_email_at` and is unreachable here.

The four hard guards, in order: the row must be visible to the caller under
RLS · `status = 'active'` · `access_email_at IS NOT NULL` · the course has a
non-blank `access_email_body`.

## The copy is per course, and silence is the default

There is **no product-wide template**. Each course carries its own body in
`course_enrollment_settings.access_email_body`, authored by staff on
`/enrollments` → Courses → ⋯ → Limits. A course with **no settings row, or a
blank body, sends nothing at all** — that is the default and it is not an error.
Five of seven courses had no settings row when this shipped.

`approve_enrollment` makes the same test before it claims, so a course without a
body never even stamps `access_email_at`. The check is repeated in the function
because the endpoint can also be invoked directly.

Staff write **plain text**. Three placeholders are substituted —
`{{student_name}}`, `{{course}}`, `{{academy}}` — and an unrecognised
`{{token}}` is left alone rather than erroring, because a typo should not block
an email nobody can recall. The subject stays generated
(`You're enrolled in <course> at <academy>`), so there is one field to fill and
no way to ship a blank subject line. The **Open the course** button is always
appended, so staff cannot forget the one thing the email exists to deliver.

Escaping order is load-bearing: the body is HTML-escaped **first**, then the
`{{tokens}}` are filled with already-escaped values. The markers pass through
`escapeHtml` untouched, so nothing a staff member types — or that lives in a
student's name — can become markup. Blank lines become paragraphs, single
newlines become `<br />`.

## Which address, and why

`students.email` — the academy's record, not the linked account's auth email.
It is staff-editable, so it is *what the academy has on file*, not provably the
account's inbox. Today 0 of 124 linked students diverge from their auth address.
Reading `auth.users.email` instead would need a SECURITY DEFINER hop or a
service-role key, breaking the property above for no present benefit. It is also
the address staff can see on the row they are approving. Same choice as
`send-pay-link`.

## The four column states

Diagnosis is one query and it survives forever — Edge Function logs do not
(a query 7 days back already returns nothing).

```sql
select status, approved_at, access_email_at, access_email_id
  from enrollments where id = '...';
```

| `approved_at` | `access_email_at` | `access_email_id` | Means |
|---|---|---|---|
| null | null | null | Never approved through the request list — bulk-enrolled, enrolled directly, or predates this feature |
| set | null | null | Approved, but nothing was sent — **either** the student has no email address **or** the course has no acceptance email. One join separates the two: `students.email` and `course_enrollment_settings.access_email_body` |
| set | set | null | **Claimed, never confirmed sent** — the one failure state that is otherwise invisible |
| set | set | set | Sent. `access_email_id` is the Resend message id — the join key into the provider's log |

A standing health check:

```sql
select count(*) from enrollments
 where access_email_at is not null and access_email_id is null;
```

Nothing watches this. It is a query a human must choose to run.

## Resending

The function checks the claim but does not consume it, so a resend is one call:

```js
await supabase.functions.invoke('send-course-access', {
  body: { enrollment_id: '<id>' },
})
```

Resend dedupes on `Idempotency-Key: enrollment-email:<enrollment_id>` for 24h,
so an accidental repeat inside that window is a no-op; a deliberate one after it
re-sends. There is deliberately **no UI control** for this: a resend button would
turn a feature scoped to one transition into a general "email any enrolled
student about any course" surface. The recovery path is developer-operable, not
admin-operable — that is a known, accepted cost.

## Kill switch

**Per course, no SQL needed:** clear the acceptance email on `/enrollments` →
Courses → ⋯ → Limits. A blank body is the off switch, and it is the same control
staff already use to write the copy.

**For the whole academy:** clear it on every course. There is no academy-wide
flag, deliberately — a switch that silences courses whose staff never asked for
silence would be a worse default than the one that already exists.

**Do not unset `RESEND_API_KEY`** — it is shared live with `send-invitation` and
`send-pay-link`, so that takes down two other features. Stop this feature alone
at the database, no redeploy needed, by making the claim unreachable:

```sql
-- Approvals keep working; no email is ever claimed, so none is ever sent.
create or replace function public.approve_enrollment(_enrollment_id uuid)
returns json language sql security invoker set search_path = '' as $$
  update public.enrollments set status = 'active',
         approved_at = coalesce(approved_at, now())
   where id = _enrollment_id
  returning json_build_object('approved', true, 'notify', false,
                              'status', 'active');
$$;
```

Restore by re-running the `20260825130000_enrollment_approval_email.sql`
migration, which is idempotent (`create or replace`, `add column if not exists`).

## Secrets

No new secret. Reuses `RESEND_API_KEY`, `INVITE_FROM_EMAIL`, `APP_URL` and
`ALLOWED_ORIGINS`, all already set and shared with the two other mail functions.

## Soft-failure contract

Delivery problems return **HTTP 200** with `{ ok: false, code, message }` —
`no_email` · `email_not_configured` · `send_failed`. The student is already
enrolled, so a delivery failure must never look like the approval failed. Only a
bad request, or a row the caller may not see, returns 4xx with `{ error }`.
