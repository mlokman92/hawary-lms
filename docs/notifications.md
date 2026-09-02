# Notifications

The bell in the header. One table, one bell, three event kinds so far — all
three about an appointment. What follows is the shape everything else plugs
into.

## The row is an event, not a sentence

```
notifications(id, academy_id, user_id, kind, data, read_at, created_at)
```

`kind` says what happened; `data` carries the facts. **No text is stored.** The
client assembles the wording from the dictionary, so the same row reads Malay
for a Malay reader and English for an English one. Storing "Session booked with
Cikgu Ali" would have frozen the language at write time, which is the one thing
`docs/i18n.md` exists to prevent.

`data` is also a **snapshot**: the other party's name and the session time as
they were when it happened. The list therefore needs no joins, and a later
rename does not rewrite history.

The recipient is an **account** (`auth.users`), not a student or instructor
record. A record nobody has claimed has no inbox to open and no way to sign in
and read this, so `app.notify` treats a null recipient as a no-op rather than an
error — an unclaimed record is the ordinary case, not a failure.

Rows are scoped by `academy_id` like every other tenant table, and the bell
follows the academy switcher. A trainer in two academies is two different people
as far as their work goes.

## Who may do what

| | |
|---|---|
| SELECT | `user_id = auth.uid()` — the only policy on the table |
| INSERT | **nobody**. `app.notify` (SECURITY DEFINER, `app` schema, unreachable over PostgREST) |
| UPDATE | **nobody**. `mark_notifications_read(ids)` / `mark_all_notifications_read(academy)` |
| DELETE | **nobody**. Nothing prunes yet — see below |

Marking read goes through an RPC rather than a policy because
`user_id = auth.uid()` on UPDATE would also authorise a person to rewrite their
own notification's `kind` and `data`. Harmless in effect, but not a thing
anybody should be able to do. Both RPCs scope to the caller *inside* the
statement, so an id lifted from somebody else's list changes nothing, and both
return the number of rows they actually changed.

## The first event: a booking

`book_appointment` gained a tail. Both parties are told **in the same
transaction as the insert** — that is the difference between this and the
confirmation email, which is a second call from the browser and can be lost. If
the booking exists, so does the notification.

**Both parties are told, including whoever pressed the button.** The rule used
to be the opposite — the actor was skipped, on the grounds that a notification
about your own click is a message telling you what you just did. It was wrong,
and the table said so:

```
appointment_booked → instructor   176 rows
appointment_booked → student        1 row
```

One. Students book themselves on `/learn/appointments`, so the actor was the
student on essentially every booking and the student side of the bell was empty
by construction. Cancelling is the same shape: 50 of the 52 upcoming cancelled
sessions were cancelled by the student. A bell that omits exactly the events you
caused cannot answer "what happened to my sessions", which is the only question
it is asked. The redundancy is accepted on purpose — a receipt is worth a
duplicate.

Staff at large are still not told: they have the diary, and a bell that fires
for every booking in the academy is one people learn to ignore.

`data` for `appointment_booked`:

```json
{ "appointment_id": "…", "role": "student" | "instructor",
  "with_name": "…", "starts_at": "…", "ends_at": "…", "tz": "Asia/Kuala_Lumpur" }
```

`role` is which side the reader is on. It decides both the wording and where the
row leads — `/learn/appointments` for a student, `/appointments/list` for an
instructor — because the notification was addressed to them as one or the other,
not because of which shell they happen to be standing in. The instructor lands
on the **register, not the diary**: the diary is a single week, so a session
booked for next month is not on it, and following a notification about one would
open a grid with nothing in it. The register opens on her own upcoming sessions,
soonest first, which is exactly where the row she tapped lives. `tz` is the academy's
zone at the time, so the row formats without a second query.

## The other two: a handover and a cancellation

Both are written by `cancel_appointment`, in the same transaction as the UPDATE,
on the same terms as the booking — both parties, staff at large not told.

`appointment_reassigned` fires when staff could not take a session and somebody
covered. It goes to the student and the **incoming** instructor, and its payload
is `appointment_booked`'s plus `from_name`.

`appointment_cancelled` fires on the two branches that genuinely call a session
off: a student cancelling their own, and staff cancelling when nobody can cover.
Both go through `app.notify_appointment_cancelled(id)` — one helper, two call
sites, because the branches differ only in who pressed the button and that no
longer changes who is told. Its payload is `appointment_booked`'s verbatim,
which is why `detailOf` and `linkOf` need no case for it: when the session was,
and where the row leads, are the same questions whatever became of it.

The **outgoing** instructor is told nothing on a handover. That is a real gap,
not an oversight — see `docs/appointments.md` → "Deliberately not done".

## The bell

`components/NotificationBell.tsx`, mounted in `components/shell/SidebarShell`
and therefore in **both** shells: a student waiting to hear that their session is
confirmed and a trainer waiting to hear that one was booked want the same
control.

- The **badge polls**, not the list. `useUnreadCount` is a `head: true` count on
  a minute's interval; the twenty rows are fetched only once the panel is
  opened. A closed bell costs one count per minute.
- The badge is drawn **only above zero**, the same rule the sidebar counts
  follow: a badge showing "0" is decoration, and its absence already says it.
- Opening a row marks it read and navigates. There is no "mark unread", no
  filter, and no page of older notifications — twenty is what the panel holds.

Adding a kind costs three cases in that one file (`titleOf`, `detailOf`,
`linkOf`), one enum value, and two dictionary lines. It is not a schema change.

## Deliberately not done

- **No realtime.** A minute's polling is what a notification of this kind is
  worth; a websocket per signed-in user is not.
- **No preferences.** Nothing to switch off yet, and a settings page for three
  event kinds of the same thing would be more product than the feature.
- **No pruning.** Nothing deletes read notifications. At the present rate the
  table takes years to become interesting; when it does, the sweep is a `delete
  … where read_at < now() - interval '90 days'`, and this is the note that says
  so.
- **No email/push fan-out from here.** The appointment emails are sent by
  `send-appointment-notice` on its own path — a second call from the browser,
  which is exactly why the notification is the more reliable of the two. The two
  paths mirror each other kind for kind and reach the same two people; routing
  them through one dispatcher is the move to make when a kind arrives that is
  not an appointment.

## Notes

- `notifications_academy_id_fkey` shows on the unindexed-foreign-key advisor.
  It is the same INFO the other composite-FK tables in this schema carry: the
  index that matters is `(user_id, academy_id, created_at desc)`, which serves
  every query the app makes, and a bare `academy_id` index would only pay for
  itself when an academy is deleted.
