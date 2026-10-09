# The payment report

`/payments/report`, admin-only. **Two views over one drill** — month → course →
student → the rows:

- **Money received** aggregates `payments`. Where the money came from.
- **Paid vs outstanding** aggregates `invoices`. Billed, paid and still owing,
  **debtors first**.

## Why a third money screen

The section already had two, and they answer different questions:

| Screen | Question | Shape |
| --- | --- | --- |
| `/payments` | What were people **asked** for? | invoice book |
| `/payments/log` | What **arrived**, when, by what means? | ledger, newest first |
| `/payments/report` | **Where did it come from, and who still owes?** | aggregate, drilled |

The third could not be a filter on the second. A ledger is a flat list ordered
by time; both of the report's questions are hierarchies, and the only way to
answer them from `/payments/log` is to export 2,000 rows and build a pivot table
in a spreadsheet — which is what this replaces.

It is also not a chart. The dashboard already draws a `collected` series over
six months; what it cannot do is let you press August and find out *which
course*, then *which students*. The report is the drill, not the picture.

## Why the receivables view is a second query, not a column

A cash ledger cannot answer "who has **not** paid". A student who owes RM800 has
no payment row to aggregate — absence is invisible in a book of arrivals. So
the outstanding view reads `invoices` instead, and reports `billed`, `paid` and
`outstanding` per rung with a **Paid / Owing** badge on the label.

The two views also bucket months differently, on purpose:

| View | Month is | Source |
| --- | --- | --- |
| Money received | when it **arrived** | `coalesce(paid_at, created_at)` |
| Paid vs outstanding | when it was **asked for** | `coalesce(issued_at, created_at)` |

That difference is exactly why one query could not serve both: a September
payment against an August invoice belongs in a different month in each, and a
row claiming both would be wrong twice.

Everything else is shared — the same scope arguments, the same drill, the same
breadcrumb — so switching view keeps your place. "August, this course" is a
fair question to ask of either book, and losing the drill to ask it would make
the second view a different screen rather than another view of one.

`paid_sen` on that side is the invoice's own `amount_paid_sen`, not a sum of
`payments`: an invoice settled by three instalments is one debt cleared, and
joining payments would multiply the billed figure by the number of times
somebody paid towards it.

## Three rungs and a leaf

The rungs are not a fixed path. They are three independent narrowings —
`?m=YYYY-MM`, `?c=<course|__none__>`, `?s=<student>` — and the table groups by
**the first one that is still open**. So:

- nothing set → months
- `?m=2026-08` → courses within August
- `?m=2026-08&c=…` → students within that course, in August
- all three set → nothing left to group by, so the payments themselves

That falls out of `nextDim()` rather than being coded as a path, and it means a
pasted `/payments/report?c=<id>` reads "this course, month by month" with no
extra screen and no extra code. Dropping one crumb drops exactly that
narrowing; the ones after it go with it, because they were chosen inside it.

### The course is a filter as well as a rung

A course picker sits beside the dates and writes the same `?c=` a pressed
course row does. "This course" used to be reachable only by drilling through a
month to find it, or by pasting a URL; the question is asked far more often
than that.

Because the picker now says which course is being read, the course is **not a
crumb**. The trail walks month and student; the date window, the course and the
view all survive every crumb, so "August 2026" from a student goes back to
August *in that course*, and the way back to every course is the picker. One
control per narrowing — a crumb that also cleared the picker would undo a
filter the reader set on purpose.

Changing the course clears the student: they were chosen inside it, one student
is in one course, and keeping them would open an empty report instead of the
course that was asked for. The picker lists **every** course, unpublished ones
labelled, because a report reads backwards and last year's intake is exactly
what gets asked about.

The **whole state is in the URL** — window, drill, page — for the same reason
`/payments/log`'s filter is: a report is read *to* somebody. "August,
Prasekolah Siri 2, RM77,000" is a sentence you paste into a message, and a
drill living in `useState` cannot be pasted.

## Succeeded only

`payment_report` hard-codes `status = 'succeeded'` and the page calls the two
log functions with `_status := 'succeeded'`.

The log keeps failed and refunded rows on purpose — knowing an FPX attempt
bounced is the point of keeping a ledger — but a *report of money received*
that counts them overstates the takings. Both halves of the screen have to
count the same rows or the summary line and the column under it disagree, and
on a money screen that is the worst available ambiguity.

## To staff, KWSP money has not been collected

A KWSP (EPF Account 2) withdrawal settles the student's share of an invoice,
but it is not money the academy has collected. The owner reads an invoice with
RM2,000 by bank transfer and RM500 by KWSP as **RM500 outstanding**, and every
staff money screen says so. The student's side says the opposite, correctly:
that invoice owes them nothing more.

So one invoice row carries **two readings**, each consistent with itself:

| Reading | Paid | Still owing | Used by |
| --- | --- | --- | --- |
| student | `amount_paid_sen` | `balance_sen`, and `status` | `/learn`, the Student app, the pay link, `create-bill`, the invoice and receipt PDFs |
| staff | `collected_sen` | `uncollected_sen` | every back-office money screen |

`kwsp_paid_sen` is the part of `amount_paid_sen` that came by KWSP;
`collected_sen = amount_paid_sen - kwsp_paid_sen`; `uncollected_sen =
greatest(0, total_sen - collected_sen)`. Student: total = paid + balance.
Staff: total = collected + uncollected, with KWSP sitting in uncollected.

**The student's columns did not change meaning, and must not.** Counting KWSP
out of `amount_paid_sen` would have been one line in the trigger — and would
have put a balance and a Pay button in front of 110 students for money KWSP
had already covered, with an FPX link that would take it a second time.

On screen:

| Label | Is |
| --- | --- |
| **Received** / **Paid** / **Collected** | what arrived by every route but KWSP |
| **KWSP** (report and tiles) | what KWSP covers |
| **Outstanding** / **Balance** | what the academy has not collected — except the `/payments` tile, which is the student's balance only |
| the status badge | `collectionStatus()` — Partially paid while part waits on KWSP |

The invoice page (`/payments/:id`) shows Paid and Balance only; the KWSP
payment is in the list under them, and a third line in the summary was removed
at the owner's request.

**What the page shows follows the staff reading; what it lets you do follows
the student's.** Record payment, Void and the pay link still test
`invoice.status` and `total_sen - amount_paid_sen`. An invoice KWSP has covered
reads Partially paid and offers no Record payment, on purpose: either action
would take the same money twice.

`collectedSen`, `uncollectedSen` and `collectionStatus` in
`features/payments/api.ts` are the staff reading for a row already in hand, and
every staff screen goes through them. `collectionStatus` is
`app.sync_invoice_paid`'s own rule applied to the collected figure.

**Overdue stays on the student's balance.** Money KWSP is covering is not the
student's to be late with.

### Why columns

`kwsp_paid_sen` is written by `app.sync_invoice_paid` in the same UPDATE, under
the same row lock, as `amount_paid_sen`; the other two are generated. They are
columns rather than a join to `payments` at read time for two reasons:

- The `/payments` list is a plain PostgREST read and can only filter on a
  column. "Show me what is uncollected" is `uncollected_sen > 0`.
- The join is what broke the first version. It summed KWSP per invoice in a
  CTE; Postgres inlined it and, under RLS, re-ran it for every invoice —
  re-checking `app.is_admin` / `app.owns_student` on every payment row, about
  two million policy calls — so three functions died on the 8-second statement
  timeout for every signed-in user while returning instantly for the table
  owner, who has no policy to evaluate. **Verify a function that reads
  RLS-protected tables as a signed-in user, never only as `postgres`.**

The trigger's extra `is distinct from` on `kwsp_paid_sen` is for a payment
whose method is corrected to or from KWSP: `amount_paid_sen` does not move
then, and an invoice still `issued` would otherwise be skipped.

### What the functions return

`payment_report` and `payment_log_totals` return everything received plus
`kwsp_sen`, the part of it that came by KWSP; the page subtracts.
`invoice_report` returns `paid_sen` (everything), `kwsp_sen`, and
`outstanding_sen` as the staff figure, and ranks debtors by it.
`invoice_report_page` carries `uncollected_sen` beside `balance_sen`.
`course_billing_summary` / `course_billing_roster` report collected and
uncollected, so a student waiting on KWSP is `partial`, not `paid`.

`invoice_totals` keeps `collected_sen` and `outstanding_sen` as the student
reading and adds `kwsp_sen` and `uncollected_sen`, because the Academy mobile
apps already installed read the old two; `useInvoiceStats` turns them into the
staff figures. `/payments/log` still shows one received figure, KWSP included —
it is a ledger of what arrived.

Groups on the received view are still **ranked by the whole amount**. A course
is not smaller because its students drew on KWSP to pay for it.

## Days are the academy's

Every date comparison and every month bucket converts
`coalesce(paid_at, created_at)` into `academies.timezone` before comparing.

A payment at 00:30 UTC on 1 September is an 08:30 Malaysian payment on the same
day. Bucketing on the raw instant would file it under August, and the person
reading the report would be right and the report wrong. Same rule
`features/appointments/calendar.ts` follows on the client; the fallback is
`Asia/Kuala_Lumpur`, because an academy row hidden from the caller must not turn
a report into an error.

`coalesce(paid_at, created_at)` and not `paid_at`: `paid_at` is nullable, and a
row with none still happened. This matches what the log already displays.

## One scope vocabulary, three functions

`payment_log_page` and `payment_log_totals` grew the report's scope arguments
(`_from`, `_to`, `_course`, `_no_course`, `_student`) rather than the report
getting a row-level function of its own.

That is the load-bearing decision here. A second row reader would be a second
copy of the same five-table join and the same predicate, free to drift from the
aggregate above it — and the first symptom of drift would be a group totalling
RM12,000 whose rows add up to RM11,800. Instead **the leaf of the drill *is* the
ledger, filtered**, and the summary line at every rung comes from
`payment_log_totals` over the identical scope. `/payments/log` passes none of
them and reads the whole book, exactly as before.

Argument lists changed, so both are drop-and-create: `create or replace` with a
new signature leaves the old function behind as an overload and PostgREST's
named-argument call then resolves to neither.

The month rung is expressed as `_from`/`_to`, **not** a `_month` argument.
`'2026-08'` → `'2026-08-01'` / `'2026-08-31'` is string arithmetic the client
can do without knowing a timezone, and it keeps one scope vocabulary across all
three functions instead of two that have to be kept in step.

`_no_course` exists because `_course uuid` has no value meaning "null" and
payments against an invoice with no course are a real group — ad-hoc fees are
billed that way. Same convention `invoice_totals` already used.

## Groups are not paged

`payment_report` returns every group, ordered newest-month-first or
largest-amount-first, with `limit 500` as a backstop.

At academy scale a month holds tens of courses and hundreds of students, and a
report you have to page through is a list again. The backstop is real, though,
so the RPC also returns `group_count` — the true number — and the page prints
one line when the two differ. Silence about a clipped report would make the
column a lie about the total above it.

The leaf **is** paged, at the log's own `PAGE_SIZE` of 50, and CSV export walks
the whole filtered set in 200-row chunks via `fetchPaymentLogAll` — a
reconciliation that stops at row 50 is worse than none.

## Ordering

Months descend (a report is read backwards from now). Courses and students sort
by money, largest first, because both of the report's questions are ranking
questions. One `order by` covers all three rungs: `month_key` is NULL on the
non-month ones, so it collapses to the money ranking there.

On the receivables side the ranking is **outstanding first**, and that carries a
property worth relying on: because every row with a balance sorts above every
row without one, the 500-group backstop can only ever clip **settled** groups
until an academy has more than 500 debtors in one scope. The answer to "who
still owes me" is never the part that gets cut — and if it ever were, the
clipped line says how many are missing.

## Authority

Every function is **SECURITY INVOKER**. RLS on `payments` and `invoices`
already scopes the caller, so definer rights would buy nothing but risk — and
because `docs/money-is-admin-only.md` moved those SELECT policies to
`app.is_admin`, a trainer calling `payment_report` gets zero rows rather than an
error, which is the correct answer. The route sits under `AdminRoute` alongside
`/payments` and `/incentives` for the same reason it does: a page that renders
an empty ledger with a live Export button reads as data loss.

## Where the labels come from

The URL carries ids, not names. The month label is formatted from its own
`YYYY-MM` key (`fmtYearMonth` in `lib/format.ts`, pinned to UTC so a browser
west of Kuala Lumpur cannot render August's takings as July); the student crumb
comes from `useStudent` and the course picker from `useCourses`, both cached
reads the section already makes. No label is stashed in the query string — a
URL that carries a name goes stale the moment somebody is renamed.

## The `/payments` stat tiles are the same idea

The four tiles on `/payments` are `FilterStatCard`s: a tile is a **sum over a
set of invoices**, so pressing it shows that set. "Who still owes me" was
otherwise a figure you could read but not open.

The mapping is the set each sum was taken over, not a status guess:

| Tile | Shows |
| --- | --- |
| Total invoiced | everything the tiles count (not void / cancelled / draft) |
| Collected | `collected_sen > 0` |
| KWSP | `kwsp_paid_sen > 0` |
| Outstanding | `balance_sen > 0` |

Total invoiced = Collected + KWSP + Outstanding: three separate slices.
Outstanding here is the student's own balance, so money KWSP is covering is in
the KWSP tile and **not** in Outstanding — the one place a staff screen's
"outstanding" is `balance_sen` rather than `uncollected_sen`. See
[payment-screens.md](payment-screens.md#the-four-tiles-are-filters) for why:
a screen with a KWSP figure of its own must leave that money out of
outstanding, and a screen without one (this report, the invoice page) must
keep it in.

**Collected is invoices with money against them, not invoices settled in full.**
A part-paid invoice contributed to the tile; narrowing to `status = 'paid'`
would open a set that does not add up to the number above it.

There is no Overdue tile: the owner dropped it when KWSP was added, so the row
reads Total invoiced · Collected · KWSP · Outstanding. `overdue` survives as a
filter value only because the Academy mobile app still offers it.

The tiles keep showing the whole picture while one is pressed — a tile that
emptied itself when pressed could not be un-pressed by reading it — and pressing
the pressed one clears, so the tiles are also the way back out.

Each filter is a **stored column** because a comparison between two columns is
something PostgREST cannot express at all. `balance_sen` was the first
(`greatest(0, total_sen - amount_paid_sen)`); `collected_sen` and
`uncollected_sen` follow it. All are clamped or derived in the database so one
student's overpayment cannot erase another's arrears in a sum. Never write them.

## Files

- `supabase/migrations/20260905120000_payment_report.sql` — the payments view
- `supabase/migrations/20260905140000_receivables_report.sql` — `balance_sen`,
  `invoice_report`, `invoice_report_page`, `invoice_totals`' scope + count
- `supabase/migrations/20261010120000_kwsp_separate.sql` — `kwsp_sen` on all
  five functions
- `supabase/migrations/20261010123000_kwsp_materialized.sql` — the KWSP
  subtotal computed once, not once per invoice
- `supabase/migrations/20261010140000_kwsp_not_collected.sql` —
  `kwsp_paid_sen`, `collected_sen`, `uncollected_sen`; the trigger; the staff
  reading in the five invoice-side functions
- `apps/web/src/features/payments/report.ts` — drill vocabulary + both views' hooks
- `apps/web/src/features/payments/api.ts` — `PaymentScope`, `scopeArgs`, `MoneyFilter`
- `apps/web/src/pages/PaymentReportPage.tsx`
- `apps/web/src/pages/PaymentsPage.tsx` — the clickable tiles
