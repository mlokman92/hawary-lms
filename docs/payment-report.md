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
west of Kuala Lumpur cannot render August's takings as July); the course and
student crumbs come from `useCourse` / `useStudent`, which are cached reads the
section already makes. No label is stashed in the query string — a URL that
carries a name goes stale the moment somebody is renamed.

## The `/payments` stat tiles are the same idea

The four tiles on `/payments` are now `FilterStatCard`s: a tile is a **sum over
a set of invoices**, so pressing it shows that set. "Who still owes me" was
otherwise a figure you could read but not open.

The mapping is the set each sum was taken over, not a status guess:

| Tile | Shows |
| --- | --- |
| Total invoiced | everything the tiles count (not void / cancelled / draft) |
| Collected | `amount_paid_sen > 0` |
| Outstanding | `balance_sen > 0` |
| Overdue | `balance_sen > 0` and past `due_at` |

**Collected is invoices with money against them, not invoices settled in full.**
The tile is the raw sum of `amount_paid_sen` and a part-paid invoice contributed
to it; narrowing to `status = 'paid'` would open a set that does not add up to
the number above it.

The tiles keep showing the whole picture while one is pressed — a tile that
emptied itself when pressed could not be un-pressed by reading it — and pressing
the pressed one clears, so the tiles are also the way back out.

`balance_sen` is a **generated stored column** (`greatest(0, total_sen -
amount_paid_sen)`) added for this: `total_sen - amount_paid_sen > 0` is a
column-to-column comparison, which PostgREST cannot express at all. Clamped at
zero for the same reason `invoice_totals` clamps — an overpayment is not a
negative debt, and letting it go negative would let one student's credit erase
another's arrears in any sum over the column. Never write it.

## Files

- `supabase/migrations/20260905120000_payment_report.sql` — the payments view
- `supabase/migrations/20260905140000_receivables_report.sql` — `balance_sen`,
  `invoice_report`, `invoice_report_page`, `invoice_totals`' scope + count
- `apps/web/src/features/payments/report.ts` — drill vocabulary + both views' hooks
- `apps/web/src/features/payments/api.ts` — `PaymentScope`, `scopeArgs`, `MoneyFilter`
- `apps/web/src/pages/PaymentReportPage.tsx`
- `apps/web/src/pages/PaymentsPage.tsx` — the clickable tiles
