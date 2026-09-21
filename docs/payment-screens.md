# The money screens — `/payments` and `/payments/log`

**Status:** implemented. See also [payment-report.md](payment-report.md) for
`/payments/report`, [course-billing.md](course-billing.md) for
`/courses/:id/billing`, [invoice-documents.md](invoice-documents.md) for the
PDFs, and [money-is-admin-only.md](money-is-admin-only.md) for why a trainer
sees none of this.

There are four money screens and each answers a different question:

| screen | question |
| --- | --- |
| `/payments` | what were people **asked** for |
| `/payments/log` | what **arrived**, when, by what means |
| `/payments/report` | where did it **come from**, who still owes |
| `/courses/:id/billing` | who was **never invoiced** |

## The log is a ledger, not a view of the invoice book

Neither list derives from the other: an invoice carries no paid-on date, and
one invoice can be settled by several payments. So `usePaymentLog` reads
`payments` directly rather than re-deriving from `useInvoices`. It is
staff-wide because `payments: staff view all` is; no migration was needed.

Only `succeeded` rows count towards "received", and a status badge is drawn
**only** when the row is not succeeded. A manual row names **who recorded it**
(`created_by` → `profiles`, readable via `profiles: self or co-member can
view`); a gateway row names the gateway and its reference instead, because a
callback wrote it and there is nobody to name. The recorder is searchable —
"everything Aisyah took in cash" is a real question to ask a ledger.

`payments.note` is the sentence none of the columns can reconstruct: a cheque
number, who handed it over, why the amount is short. Written in
`RecordPaymentDialog`, shown under the source line on the log and on the
invoice, and folded into `payment_log_page`'s **and** `payment_log_totals`'
search identically — or a page of rows sums to a different figure than the line
above it. Blank stores as NULL. It is a note *about the payment*, **not a
staff-private one**: `payments: admin view all, student view own` lets the
student read their own rows, so nothing typed here should be anything you would
not say to them.

`kwsp` joined `payment_method` for the same reason `bank_transfer` is not
"Other" — an EPF Account 2 education withdrawal arrives by its own route, with
its own paperwork. It sits before `other` in the enum so the catch-all stays
last in the picker.

**Export CSV** reuses `lib/csv.ts`'s `downloadCsv` and writes ISO dates +
ringgit decimals, because the file's job is reconciliation in a spreadsheet.

## `invoices.amount_paid_sen` is derived from the ledger

`app.sync_invoice_paid` is an AFTER INSERT/UPDATE/DELETE trigger on `payments`
that recomputes `invoices.amount_paid_sen` and the invoice status from
`sum(payments where succeeded)`. **Clients must not write either column.**

`useRecordPayment` used to write them itself, as `currentPaidSen + amountSen`,
where `currentPaidSen` came from whatever the *page* was showing. Two payments
recorded from one open screen therefore both added to the same stale figure and
the second one's money stayed in the ledger but left the invoice: INV-YKP2CP
held five RM500 rows and read RM2,000.

`record_gateway_payment` never had the bug — a gateway callback has no page
state to read, so it always summed. That rule now lives on the column, where
every writer gets it, including a plain PostgREST insert by an admin that
passes through no RPC at all. The same argument as `app.fill_record_identity`.
`record_gateway_payment`'s own recompute stays as belt and braces.

The invoice row is **locked before the sum is taken** (`select … for update`).
Two admins recording a payment at once is the ordinary case, and under READ
COMMITTED the second transaction's sum has to be a statement that runs *after*
the first commits, or it recomputes from a snapshot that never saw the other
payment — the very failure being fixed, one layer down.

Consequences worth knowing: a refund (`status = 'refunded'`) or a deleted row
now **does** decrement `amount_paid_sen`, and an invoice recomputed back to
zero drops from `paid`/`partially_paid` to `issued`. `void` and `cancelled` are
never moved — money against a voided bill is a reconciliation job, not a status
change.

## Back-dated payments and `_sort`

`RecordPaymentDialog` asks for the *payment* date and stores it at midday, so
staff catching up on historical payments enter them back-dated — **737 of 742**
rows in this database have a `paid_at` on a different day from their
`created_at`.

Ordering the ledger by `paid_at` therefore buries fresh data entry: a payment
banked today for money that arrived in May sorted to row 338 of 742, page 7. It
was never missing, but "I just recorded it and cannot see it" is
indistinguishable from missing, and on a ledger that is the worst ambiguity
available.

So the log takes a `_sort` of **`recorded`** (`created_at`, the **default** —
what a person doing data entry means by "recent") or `paid` (value-date order,
for reconciliation), and each row shows the recorded timestamp **only when it
was back-dated**; when the two days agree the payment date already said it.

`_sort` is **not** part of `PaymentLogFilters`: a sum and a count do not care
about ORDER BY, so changing it must not re-fetch the totals. The ORDER BY is
**dynamic SQL over a two-clause whitelist**, not a CASE inside ORDER BY — a
CASE is not indexable and would force a full sort of the academy's payments on
every page turn, defeating both `payments_academy_paid_at_idx` and
`payments_academy_created_at_idx`.

## Pagination — rows are a page, totals are an aggregate

Both lists are paged **server-side** at 50, because both used to fetch every
row and one academy is already at 543 invoices / 702 payments. PostgREST caps a
request at the project's "Max rows" (1000 by default) and a *ledger* that
silently stops at row 1000 is worse than one that is slow.

A page of 50 cannot answer "how much is outstanding", and deriving the tiles
from the page would quietly reinterpret the question — so `invoice_totals`
(four money tiles, optionally narrowed by `_course` / `_no_course`) and
`payment_log_totals` (count + money received) are their own calls.
`invoice_totals` mirrors the old client `computeStats` **exactly**, asymmetries
included: `collected` is the raw sum of `amount_paid_sen`, while `outstanding`
and `overdue` clamp each invoice at zero first. Verified equal on live data, so
the numbers on screen did not move.

The **log rows need an RPC** (`payment_log_page`) because its search spans five
tables and PostgREST cannot OR across embedded resources. The **invoice rows
stay on PostgREST** (`.range()` + `count: 'exact'`) because a course filter is
one `eq`. All three functions are **SECURITY INVOKER** — RLS already scopes the
caller, so definer rights would buy nothing but risk.

Two details are load-bearing, not polish:

- Every ordering carries **`id` as a final tie-break**. OFFSET paging over a
  non-unique sort repeats one row and skips another.
- Both lists use **`keepPreviousData`**. Without it a page turn blanks the
  table through the empty state and back, which reads as an error.

Search is debounced through `lib/useDebounced.ts` — otherwise a keystroke is
two round trips. **CSV export walks the whole filtered set** in 200-row chunks
via `fetchPaymentLogAll`, never the 50 rows on screen: a reconciliation that
stops at row 50 is worse than none, and 200 is the `_limit` clamp the RPC
enforces. `invalidateMoney` is the one place a money write invalidates all six
cached lists.

Still unbounded and deliberately left so: the **dashboard**'s `useInvoices`,
which reads every invoice for its 6-month chart and stat tiles.

## The four tiles are filters

A tile is a **sum over a set of invoices**, so pressing it shows that set —
"who still owes me" was a figure you could read but not open. The tiles are
`FilterStatCard`s:

- **Invoiced** — everything the tiles count (not void/cancelled/draft)
- **Collected** — `amount_paid_sen > 0`
- **Outstanding** — `balance_sen > 0`
- **Overdue** — that plus past `due_at`

**Collected is invoices with money against them, not invoices settled in
full**: the tile is the raw sum of `amount_paid_sen` and a part-paid invoice
contributed to it, so `status = 'paid'` would open a set that does not add up
to the number above it.

The tiles deliberately ignore the filter they apply — one that emptied itself
when pressed could not be un-pressed by reading it — and pressing the pressed
one clears.

**`invoices.balance_sen`** is a generated stored column
(`greatest(0, total_sen - amount_paid_sen)`) added for this: `total_sen -
amount_paid_sen > 0` is a column-to-column comparison PostgREST cannot express
at all. Clamped at zero so one student's overpayment cannot erase another's
arrears in any sum over it, and **never written by a client**.

## Nav

`/payments/log` is the **first child nested under its parent's own path**,
which exposed a bug in `isNavActive` (`components/shell/nav.ts`):
`pathname.startsWith` made `/payments/log` light up the Payments row *and* the
Log row, when the shell's rule is that a parent whose child is active gets the
brand colour on its icon alone. `isNavActive` now yields to a matching child,
so only one row ever claims "the page you are on". `/courses`' children
(`/assessments` etc.) never hit this because they do not share its prefix.

The dashboard's recent-payments card links here as its "View all"; its revenue
chart is a **single** `collected` series (the invoiced figure survives as a
number on the card, not a bar), so `dash.chart.invoiced` is gone.
