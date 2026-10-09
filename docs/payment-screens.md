# The money screens — `/payments` and `/payments/log`

**Status:** implemented. See also [payment-report.md](payment-report.md) for
`/payments/report`, [course-billing.md](course-billing.md) for
`/courses/:id/billing`, [invoice-documents.md](invoice-documents.md) for the
PDFs, and [money-is-admin-only.md](money-is-admin-only.md) for why a trainer
sees none of this.

There are five money screens and each answers a different question:

| screen | question |
| --- | --- |
| `/payments` | what were people **asked** for |
| `/payments/log` | what **arrived**, when, by what means |
| `/payments/report` | where did it **come from**, who still owes |
| `/courses/:id/billing` | who was **never invoiced** |
| `/payments/receipts` | which bank transfers have **no receipt** yet |

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
`RecordPaymentDialog`, and folded into `payment_log_page`'s **and**
`payment_log_totals`' search identically — or a page of rows sums to a different
figure than the line above it. Blank stores as NULL. It is a note *about the
payment*, **not a staff-private one**: `payments: admin view all, student view
own` lets the student read their own rows, so nothing typed here should be
anything you would not say to them.

### The note is a column, and it is editable

It used to be a third sub-line under the method, below the source line. A note
that reads as a caption on another column is a note nobody searches for by eye,
and the log's own search box already indexes it — so it is **its own column**
between Method and Amount, and the method cell is back to two lines.

It is also the one field on a payment row that is routinely **wrong when first
typed**: the cheque number is on a slip somebody is still holding, the reason an
amount is short arrives on the next phone call. The only fix available before
was to delete the payment and re-enter it, which moves `created_at` — the
column the ledger sorts by — and so loses the record of when the money was
actually banked, to correct a sentence.

`useUpdatePaymentNote` is therefore a **plain PostgREST update**, no migration
and no RPC: `payments: admin update` has been `app.is_admin(academy_id)` in both
`using` and `with check` since the billing migration, so the database already
refuses everyone this screen is closed to, and a note drags no derived column
behind it. `app.sync_invoice_paid` does fire on the UPDATE and recompute
`amount_paid_sen` from the same succeeded rows it already summed — idempotent,
so the invoice does not move.

Two details are load-bearing:

- **`.select('id').single()`** is the point of the write. An UPDATE that RLS
  refuses, or one whose id belongs to another academy, returns **200 with zero
  rows** — not an error. Without reading the row back the dialog would close on
  "saved" having saved nothing, which on a money screen is the one outcome worse
  than an error message. `.eq('academy_id', …)` rides along for the same reason:
  an admin of two academies holds a valid JWT for both.
- **Blank clears back to NULL**, the single representation of "no note" the
  insert already writes. An empty string would start matching the ledger's own
  note search.

`EditPaymentNoteDialog` is a dialog rather than an editable cell because a note
is a sentence, and a sentence typed into a table cell either wraps the row open
or is clipped to a width nobody can write in. One dialog is mounted for the
page, not one per row, and the row it is editing lives in the page's state — 50
rows is 50 subscriptions to the same mutation otherwise, and only one can be
open. The trigger is the **whole cell**: an em dash is too small a target on a
touch screen, and the pencil shows on hover and focus only, so a page of fifty
rows does not read as fifty controls.

The invoice detail page still *prints* the note read-only under its payment row;
`invalidateMoney` plus the invoice key means an edit on the log reaches it.

`kwsp` joined `payment_method` for the same reason `bank_transfer` is not
"Other" — an EPF Account 2 education withdrawal arrives by its own route, with
its own paperwork. It sits before `other` in the enum so the catch-all stays
last in the picker.

### The log's number cards

Three cards above the ledger: **Total collections**, **Bank transfer**, **FPX**
— each an amount and the number of payments behind it. One per row on a phone,
three across from `sm` up: three ringgit figures side by side do not fit a
narrow screen.

They come from `payment_log_totals`, the same call as the summary line, as
FILTERs over the same rows — so they follow the search and the method filter
and always describe the rows the table is offering.

**Total collections is `received_sen - kwsp_sen`**, not everything received: to
staff, money that came by KWSP has not been collected. **Bank transfer + FPX
is less than the total**: cash and "other" are in the total and have no card.
The old summary line beside the filters ("N payments · RM x received") is gone
— the cards say it, and the owner had it removed.

### The log filters by method, not status

The picker beside the search box is **method of payment** (`?method=`), where a
status picker used to be. Every row in this ledger is `succeeded`, so the
status picker had one useful value; what is asked of a ledger is "show me the
bank transfers" or "what came by KWSP". A row that did fail or was refunded
still says so with a badge, and both log functions keep `_status` as an
argument because the Academy mobile apps already installed call them by name
without `_method` — its NULL default keeps them resolving to the one function
that exists. `?status=` on an old link is ignored.

The method narrows the cards too, since they share the filter: pick FPX and
Total collections *is* the FPX total, and the Bank transfer card reads zero.

**Export CSV** reuses `lib/csv.ts`'s `downloadCsv` and writes ISO dates +
ringgit decimals, because the file's job is reconciliation in a spreadsheet.

## `invoices.amount_paid_sen` is derived from the ledger

`app.sync_invoice_paid` is an AFTER INSERT/UPDATE/DELETE trigger on `payments`
that recomputes `invoices.amount_paid_sen` and the invoice status from
`sum(payments where succeeded)`, and `kwsp_paid_sen` from the KWSP rows among
them. **Clients must not write any of the three.**

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

### `/payments` loads more instead of paging

The invoice list is read top-down — newest first, keep going until you find it
— and Previous/Next made that a walk through screens that each forget the
last. So `/payments` has one **Load more** button and a "150 of 787" beside it;
both disappear once every row is on screen.

`fetchInvoicePage` is the read, and two hooks share it so they cannot ask
different questions: `useInvoicePage` (a page at a time — the Academy mobile
app still pages) and `useInvoiceList` (`useInfiniteQuery`, what the web uses).
The filters are in the list's query key and the page is not, so changing course
or pressing a tile starts again from the top with no reset code.

Pages are still cut by OFFSET, so an invoice raised between two loads pushes
every row down one and the next page begins with a row already on screen. The
page keeps the **first sighting of each id**; without that a row appears twice
and React is handed a duplicate key. `/payments/log` and the report's leaf keep
their pagers — a ledger is jumped into by search or date, not walked.

### The Breakdown column

Where Due used to be. It says how the Paid figure beside it arrived: **FPX**
(through the gateway) or **Manual** (typed in by staff). `collectedBreakdown`
splits on `payments.provider`, not `method` — staff can record a payment and
call its method anything, but only the gateway writes a row whose provider is
not `manual`. Succeeded payments only, and KWSP in neither line, so the two add
up to Paid. A route with nothing against it is left out, not printed as zero.

The payments ride along as a plain embed on the list read
(`payments(amount_sen, provider, method, status)`): it adds columns to each row
and filters nothing.

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
- **Collected** — `collected_sen > 0`
- **KWSP** — `kwsp_paid_sen > 0`
- **Outstanding** — `balance_sen > 0`

**Collected is invoices with money against them, not invoices settled in
full**: a part-paid invoice contributed to the tile, so `status = 'paid'` would
open a set that does not add up to the number above it.

**The three money tiles are separate slices: Invoiced = Collected + KWSP +
Outstanding.** Collected is what arrived by every route but KWSP; KWSP is what
a withdrawal covers; Outstanding is what students themselves still owe — the
invoice's own `balance_sen`. An invoice whose remainder KWSP is covering is
therefore **not** in Outstanding. (One overpaid invoice makes the three exceed
Invoiced by its credit: Collected is a raw sum, Outstanding clamps at zero.)

Outstanding first included the KWSP money, as "everything not collected". With
a KWSP tile beside it that counted the same ringgit twice, and the owner had it
taken out. **This is the one staff screen where "outstanding" is not
`uncollected_sen`**: the invoice page, the report, the student page, the
dashboard and course billing have no KWSP figure of their own, so on those the
KWSP money has to sit in outstanding or be nowhere. A screen with a KWSP tile
must leave it out; a screen without one must keep it in.

The rows under the tiles still read as staff do: the Paid column is
`collectedSen(inv)` and the badge is `collectionStatus(inv)`, so a row the
student sees as Paid reads Partially paid here while part of it waits on KWSP —
and such a row appears under KWSP, not under Outstanding. The whole rule, and
why the student's own figures are deliberately left alone, is in
[payment-report.md](payment-report.md#to-staff-kwsp-money-has-not-been-collected).

There is no Overdue tile any more — the owner dropped it when KWSP was added.
`overdue` stays in `MoneyFilter` because the Academy mobile app still offers it
as a chip, and it stays on `balance_sen`: money KWSP is covering is not the
student's to be late with.

Each tile also says **how many invoices** its figure was summed over — "RM
40,000.00 (80)". `invoice_totals` counts them with the very predicate the
tile's filter uses, so the number on the tile is the number of rows the list
shows when it is pressed. The money is three slices but the counts are **not
a partition**: an invoice paid partly by bank transfer and partly by KWSP is in
both Collected and KWSP, so they add up to more than the Invoiced count. The count wraps under the amount on a narrow tile
rather than truncating — a clipped count is a wrong count.

The tiles deliberately ignore the filter they apply — one that emptied itself
when pressed could not be un-pressed by reading it — and pressing the pressed
one clears.

**Both filters live in the URL** — `?c=<course id | __none__>` and
`?money=<collected | kwsp | outstanding>` — not in component state. "Siri 2,
outstanding" is a list you send to somebody, and the list you want back when
you return from an invoice opened out of it; state that dies with the component
can do neither. Only what was narrowed is written, so the bare `/payments` is
still everything. `c` is the name `/payments/report` uses, on purpose. Changes
`replace` the history entry, so Back from an invoice lands on the list as it
was left rather than on an earlier filter. A value the page cannot apply — a
malformed id, a `money` with no tile — reads as "not narrowed" instead of
reaching PostgREST as a failed cast. How far the list has been loaded is **not**
in the URL: a link should open at the top.

Every filter is a **stored column** (`balance_sen`, `collected_sen`,
`uncollected_sen` generated; `kwsp_paid_sen` kept by `app.sync_invoice_paid`),
because a column-to-column comparison is something PostgREST cannot express at
all. **Never written by a client.**

## Bank transfer receipts — `/payments/receipts`

A bank transfer is the one way money arrives that the system takes on trust:
FPX is confirmed by the gateway's callback, a transfer is a row a staff member
typed. The owner wants the proof beside the claim — every bank transfer carries
the receipt it was recorded from, and one that does not is **pending**.

**Pending is a fact about the paperwork, not the money.** It touches no
`payments.status`, no `amount_paid_sen` and no total: the transfer was recorded
as received and still counts as received. A payment is pending *exactly when it
has no `payment_receipts` row*, so there is no flag to keep in step with
anything. Only **succeeded** bank transfers are listed; all 2,331 that existed
on the day the page shipped started as pending.

The page opens on the pending list, because clearing it is the job. Each row
has one action — **Upload** when there is nothing, **View** when there is — and
replacing a receipt, which is occasional, is behind the row's `⋯`. State,
search and page are in the URL (`?state=uploaded|all`, `?q=`, `?page=`), with
pending the unwritten default. It keeps a pager rather than Load more: the
list is worked from the top and refills as rows leave it.

### One table, one function, no client writes

`payment_receipts` is keyed on `payment_id` — one receipt per payment, and
uploading again replaces. It is its own table rather than columns on
`payments` because every UPDATE of a payment fires `app.sync_invoice_paid` and
takes the invoice's row lock; attaching a file should go nowhere near the money
trigger.

The files are in the **private** `payment-receipts` bucket (PDF, JPG, PNG,
WebP; 10 MB), keyed `<academy_id>/<payment_id>/<uuid>.<ext>`. A receipt shows a
payer's name, bank and account number, so nothing about it is public.

Both halves go through the **`payment-receipt`** Edge Function — a new one,
not a branch in `upload-media`:

- **Upload** (multipart: `file`, `payment_id`). `upload-media` stops at the file
  and leaves the caller to insert its row; here the row *is* the point and the
  table takes no client DML. So this function uploads the object and upserts the
  row together, and removes the object again if the row fails — there is never
  a receipt nobody can see, or a row pointing at nothing. On a replace, the old
  object is removed only after the new row is in.
- **Link** (JSON: `payment_id`). Entitlement is decided by the database under
  the caller's own JWT — the table's SELECT policy is `app.is_admin` — and only
  the path the database hands back is signed, for 60 seconds. The body carries
  an id, never a path.

The caller must be an active **admin of the payment's own academy**; the
academy is read from the payment, never from the request, so the object and the
row can only land in the payment's tenant. "No such payment" and "not yours"
return the same 404.

`bank_transfer_receipts_page` and `bank_transfer_receipt_counts` are SECURITY
INVOKER with `app.is_admin(_academy)` in the WHERE, not only in the policies:
`payments` lets a student read their own rows, and without it a student calling
the function would get their own transfers back, every one "pending". The two
share a WHERE clause (minus `_state`) for the reason the log's two do.

Not done: deleting a payment cascades its receipt row but leaves the object in
the bucket, as a deleted course material does — nothing sweeps either. Receipts
are not attached in the Record payment dialog. Staff-web only; the Academy
mobile app has no receipts screen.

### The same receipt on the invoice page

`/payments/:id` lists the invoice's payments, and a bank transfer there carries
the same control: **Receipt pending** and Upload, or View receipt with Replace
behind `⋯`. It is the place an admin is already standing when they record the
transfer, so the proof can be attached without a trip to the queue.

`payments(*, receipt:payment_receipts(...))` on the invoice read supplies it —
a one-to-one embed, so `receipt` is an object or null. The learner's invoice
page runs that same read; `payment_receipts` is admin-only by RLS, so for a
student `receipt` is always null and the control is not drawn at all.

Both screens share `useReceiptPicker`: one hidden file input for the screen,
and each row's button says which payment the next chosen file belongs to. An
upload invalidates the queue, its counts and the invoice, so whichever screen
it was made from, the other is right when you get there.

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
