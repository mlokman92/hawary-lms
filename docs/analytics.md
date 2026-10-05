# Login analytics

> Decided 2026-10-05. Migrations `20261005090000_login_analytics.sql` and
> `20261005100000_login_analytics_students_only.sql`.

`/analytics` answers three questions for a Director, **about students**: how
many logins there were on each day of a month, how many different students that
was, and when each one was last seen.

## What a login is

One of two things:

- **a sign-in** — somebody typed a password (or followed an emailed link) and
  got a new session;
- **a return** — somebody came back on a device that was still signed in, an
  hour or more after they were last seen.

The second half is the decision. A session here lasts until sign-out: a student
who signs in once on their phone stays signed in for weeks. Counting only
sign-ins, that student logs in once and is never seen again however often they
use the LMS. Five days into October 2026, sign-ins alone counted **34** people
where **72** had actually been in. A page that calls 34 "active users" is wrong
by more than half, so returns are logins too.

The bars and the tile then mean different things on purpose: the chart is a
**total** (somebody in on ten days is ten logins, and twice in one day is two),
the tile is a **head count** (one active student).

## Why Supabase's own data could not be used

- `auth.audit_log_entries` is empty: this project does not write it.
- `auth.sessions` loses its row when the account signs out, so it forgets
  exactly the history a chart needs. 47 accounts had signed in and had no
  session left.
- `auth.users.last_sign_in_at` is one timestamp per account, and it moves only
  on a sign-in, never on a return.

## The log

`public.login_events` — one row per login (`user_id`, `session_id`,
`is_sign_in`, `created_at`). It is **global to the account**, not to an academy:
a login is not made *to* a branch. The readers attribute it through
`academy_members`.

It is written by one trigger, `on_auth_session_login` on `auth.sessions`
(`app.record_login`):

- `INSERT` → a sign-in;
- `UPDATE OF refreshed_at` → a return, **if** the session was last seen an hour
  or more ago.

**The one-hour test.** The access token lives one hour (JWT expiry 3600s, the
Supabase default) and the client renews it at about 58 minutes while the app is
open. So a renewal a full hour or more after the last one means the app had
been closed and somebody came back; a renewal at 58 minutes is an open tab
keeping itself alive, and is not recorded. Over two months, 2,274 of 2,345
renewals were returns and 71 were keep-alives.

If the JWT expiry is ever changed in the dashboard: shorter only merges a return
inside the hour into the visit before it; **much longer would hide returns**,
because nothing is renewed until the token runs out. Revisit this file first.

**The trigger must never block a sign-in.** It sits on the auth path of a live
system, so its body is wrapped in an exception handler that downgrades any
failure to a warning. A broken log loses analytics; it does not lock anyone out.

The trigger is on `auth.sessions` rather than `auth.refresh_tokens` because the
session row is touched by a renewal however the refresh token itself is stored.
`auth.sessions` already carries `refresh_token_counter` and
`refresh_token_hmac_key` columns — unused in this project today — which suggest
a token will not always be a row.

## History

The migration replayed the same rule over every refresh token still on file,
and added the last sign-in of each account whose sessions were gone: 4,136
logins. Two limits, both permanent:

- nothing is on file from before **2 August 2026**;
- for an account that signed out before 5 October 2026, only its *last* sign-in
  survived. Earlier months are therefore a little low; from 5 October the log is
  complete.

## Who can read it

`app.can_view_analytics(academy)`: a **Director** of the academy, or the
owner's own account (muhamadlokman92@gmail.com), named by address at the
owner's request. The address lives in that one function and nowhere in the
client.

- `login_events` has RLS on and **no policies**, and its grants are revoked: no
  client reads or writes it. The advisor's "RLS enabled, no policy" note on it
  is intended.
- `login_analytics(academy, month)` and `list_user_logins(academy)` are
  SECURITY DEFINER and check `app.can_view_analytics` themselves.
- `can_view_analytics(academy)` in `public` is the same answer for the client,
  which uses it only to decide whether to show the nav entry and the route
  (`useAnalyticsAccess`, `components/AnalyticsRoute.tsx`). A Director is
  recognised from the membership already loaded and costs no request.

## Scope

- **Students only** (`academy_members.role = 'student'`), the owner's
  follow-up the same day. The page asks whether students are using the LMS;
  staff are in it all day as part of the job, and their logins would only pad
  the answer. The filter is in the two readers — **the log still records every
  account**, so widening the page again loses no history. Someone who is an
  admin or trainer here and also has a student record is staff, and is not
  counted.
- **One course, optionally** (`?c=<course id>`, `_course_id` on both readers,
  migration `20261005120000`): the chart, the head count and the list narrow
  together to students with an enrolment on that course that is not cancelled
  (`app.analytics_in_course`). Null is every course. A course from another
  academy matches nobody.
- An account that is a student in two branches counts in both.
- **Accounts left out by address**: `app.is_analytics_excluded(user_id)` holds a
  short list (today: broadcastimedia@gmail.com, a student membership that is not
  a learner) and both readers skip them. To exclude another, add its address to
  the array in that function with a new migration. The account still signs in
  and is still logged.
- **Not counted: accounts with no membership** — people who signed up and never
  claimed a record (109 on 2026-10-05). They belong to no academy, so they are
  on no academy's page.
- Days and months are the **academy's calendar** (`academies.timezone`), decided
  in SQL. The client never converts a timestamp into a day; `fmtDay` and
  `fmtYearMonth` format the keys the database returned.

## The page

`pages/AnalyticsPage.tsx`, `features/analytics/*`.

- One call, `login_analytics`, returns the bars, the two figures and the list of
  months the selector offers, so they cannot disagree.
- The month is in the URL (`?m=YYYY-MM`), like the payment report's. The current
  month is the default and is not written, so a bookmark rolls over.
- The list is every student account, most recently seen first, searched and
  paged in the browser; a row opens the student's record. "Last logged in" is the later of the log and
  `last_sign_in_at` — the log knows about returns, and `last_sign_in_at` reaches
  back before the log began.
- The chart is lazy-loaded, as the dashboard's is: Recharts stays out of the
  main bundle.

## Not built

- Staff logins on the page, and any measure of time spent.
- A return within the hour of the last visit is not a separate login.
