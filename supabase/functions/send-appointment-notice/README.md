# send-appointment-notice

Confirms a booked one-to-one session to **both** parties: the student, and the
instructor the rota (or a staff member) picked. One email each, once per
appointment.

## Trust model

Unlike `send-invitation` and `send-course-access`, this one **does** use the
service role — because it emails two people and a student cannot read
`instructors` at all. That table is staff-only on purpose: under round robin,
naming the free teachers would defeat the mode. So it takes the `material-url`
shape instead:

1. **Authorize under the caller's JWT.** The appointment is read with a
   caller-scoped anon client, so RLS decides — `appointments: staff read all,
   student read own`. No row → **404**, the right answer to both "not yours"
   and "does not exist".
2. **Then read and send under the service role**, for that appointment only.

The request body carries an `appointment_id` and nothing else. **Neither address
is ever client input** — that is what stops this being an open relay.

Two further guards after the row is in hand: `status` must still be `booked`
(a session cancelled between the insert and this call must not send "you're
booked"), and a row whose **both** receipts are stamped returns 409.

## Which address

`students.email` / `instructors.email` first — what the academy has on file and
what staff can see on the row — falling back to the linked account's auth
address (`auth.users`, via the service role) when the record carries none.

The fallback is why "every confirmed booking tells both parties" is actually
true: **22 of 659** student records have no email of their own, and a student
who can book is by definition a linked account with a real inbox. This differs
from `send-course-access`, which has no service role and so cannot look.

## Idempotency

A booking is an INSERT: the row did not exist a moment ago and only its creator
knows the id, so unlike `approve_enrollment` there is **no race to lose** and no
claim column. What is left is a client re-invoking — a double-click, a reload —
and two things settle it:

- a party whose receipt id is already stamped is **skipped**, so a re-invoke
  after a partial failure fills only the gap;
- each send carries `Idempotency-Key: appointment-notice:<id>:student|instructor`,
  which Resend dedupes for 24h.

## The receipt columns

```sql
select status, notice_sent_at, student_notice_id, instructor_notice_id
  from appointments where id = '...';
```

| `notice_sent_at` | receipt id | Means |
|---|---|---|
| null | null | Nothing was ever tried — the client died between booking and this call, or the booking predates this feature |
| set | null | Tried, that party not reached: **no address on record and no linked account**, or the provider refused |
| set | set | Sent. The id is the Resend message id — the join key into the provider's log |

The two receipts are independent because the two recipients fail
independently: an instructor record with no address must not stop the student
being told.

A standing health check:

```sql
select count(*) from appointments
 where notice_sent_at is not null
   and (student_notice_id is null or instructor_notice_id is null);
```

Nothing watches this. It is a query a human must choose to run.

## Soft-failure contract

Delivery problems return **HTTP 200** with `{ ok, student, instructor }`, where
each party is `{ sent, code?, id? }` and `code` is `no_email` · `send_failed` ·
`already_sent`. `ok` is true only when **both** were reached. A missing
`RESEND_API_KEY` returns `{ ok: false, code: 'email_not_configured' }`.

The session is booked either way, so a delivery failure must never look like the
booking failed. Only a bad request, or a row the caller may not see, returns 4xx
with `{ error }`.

## Resending

```js
await supabase.functions.invoke('send-appointment-notice', {
  body: { appointment_id: '<id>' },
})
```

Works for a party whose receipt is still null; if both are stamped it returns
409. There is deliberately **no UI control** — a resend button would turn a
feature scoped to one transition into "email anybody about any session".

## Kill switch

**Do not unset `RESEND_API_KEY`** — it is shared live with three other mail
functions. To stop only this one, remove the `functions.invoke` call in
`useBookAppointment` (`apps/web/src/features/appointments/api.ts`) and redeploy
the web app; bookings are unaffected, since the RPC has already returned by
then.

## Secrets

No new secret. Reuses `RESEND_API_KEY`, `INVITE_FROM_EMAIL`, `APP_URL` and
`ALLOWED_ORIGINS`, all already set and shared with the other mail functions.
