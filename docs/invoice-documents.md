# Invoice documents — pay links, PDFs, academy letterhead

Three changes that together make an invoice self-service for the student: the
pay link now exists from the moment the invoice does, the academy's letterhead
is editable, and the learner can download an invoice or a receipt as a PDF.

## 1. The pay link is minted on insert

**Before:** `pay_token` was minted on demand by `ensure_pay_token(_invoice)`,
which an admin triggered from **Create pay link** on `/payments/:id`. A freshly
created invoice therefore had no link until someone clicked. That also blocked
the learner's own view — `ensure_pay_token` is `app.is_admin`-gated and raises
*Not authorized* for a student, so `/learn/billing/:id` could only ever *show* a
link it never had.

**Now:** `app.set_invoice_pay_token()` runs `BEFORE INSERT ON public.invoices`
(migration `20260731090000_invoice_pay_token_on_insert.sql`) and mints
`encode(gen_random_bytes(24), 'hex')` when `pay_token` is null.

A trigger rather than a call in `useCreateInvoices`, because there is more than
one creation path (single, bulk, anything server-side later) and the guarantee
should not depend on which one ran. Existing rows were backfilled by the same
migration.

`ensure_pay_token` is unchanged and still exported — it is idempotent, so it
stays the correct repair for any row that somehow lacks a token.

### Why the token is not a leak

`get_public_invoice(_token)` only resolves invoices whose status is
`issued` / `partially_paid` / `overdue`, and returns nothing beyond the invoice
number, the academy name and logo, and the amounts. A draft invoice's token
resolves to nothing. `PayLinkCard` still gates the whole card on
`toyyibpay_enabled`, so a link is only *offered* when it can actually be paid.

The visible effect on `/payments/:id` is that the card now shows the copyable
link straight away instead of a **Create pay link** button.

## 2. Academy letterhead is editable

`academies` has carried `registration_no, email, phone, address, city, state,
postcode, sst_registered, sst_number, logo_url` since the first tenancy
migration, but the only writer was `pages/Onboarding.tsx` — set at sign-up,
never afterwards.

`features/settings/AcademyProfileCard.tsx` (rendered above the ToyyibPay card on
`/settings`) now edits the subset the documents print:

| Field | Column | Required |
|---|---|---|
| Academy name | `name` | **yes** (`NOT NULL`, already collected at sign-up) |
| Logo | `logo_url` | no |
| Address | `address` | no |
| Phone number | `phone` | no |
| SST number | `sst_number` | no |

Blank inputs are stored as `NULL`, so "unset" has one representation and the PDF
can simply omit the line. Writes are admin-only through the existing
`academies: admins can update` policy — no new grants.

The logo goes through `uploadPublicImage('avatars', …)`, i.e. the `upload-media`
Edge Function, exactly like student avatars. The file picker accepts only
PNG/JPEG/WebP: jsPDF cannot rasterise SVG, so an SVG logo would upload happily
and then silently vanish from every document.

Saving calls `useAcademy().refresh()` — the sidebar and the academy switcher
read the name from the membership list, not from this query.

## 3. Invoice and receipt PDFs

`features/payments/pdf.ts` draws both documents with **jsPDF**, imported
dynamically so ~130 kB gzipped stays out of the initial bundle and is fetched
only on the first download.

**Why not `window.print()`.** It is a dialog, not a download, and the learner
screen is a responsive tree with a sidebar and a theme — coaxing that into A4
via print CSS yields a different document per browser. Laying the page out in
millimetres gives one deterministic artefact.

Both documents share a letterhead (logo, academy name, address, `Tel:`,
`SST No.:`), a **Bill to** block (name, student no., email, course), the line
items and a totals block. They differ in what they assert:

- **Invoice** — dated by `issued_at` / `due_at`, ends at *Balance due*.
- **Receipt** — dated by the **latest succeeded payment**, and adds a *Payments
  received* table (date · method · amount) plus *Amount received*. Offered only
  when `amount_paid_sen > 0`: a receipt acknowledges money, and an unpaid
  invoice has none to acknowledge.

Failure is always soft. A logo that 404s, blocks CORS, is an unsupported type or
fails to decode returns `null` from `loadLogo` and the document prints without
it — a broken image must never be why a student cannot download their invoice.

### Encoding

The built-in Helvetica is WinAnsi-encoded, so `pdfText()` folds curly quotes, en
and em dashes, ellipses, bullets and non-breaking spaces down to ASCII before
anything reaches the page. `formatMYR` emits `RM …` on some engines, hence
`money()` routes through the same fold. Malay copy is plain Latin-1 and needs
nothing further.

### Where the buttons are

- `/learn/billing` — a per-row **Download** menu (invoice, plus receipt when
  paid). The click is `stopPropagation`'d because the row itself navigates.
- `/learn/billing/:id` — **Download invoice** / **Download receipt** beside
  **Pay online**, which is now the primary button on the page.

`features/payments/documents.ts` holds `useInvoiceDocuments(academyId)`. The
list page has only the invoice header, so items and letterhead are fetched *on
click* — a billing list of thirty invoices should not fetch thirty item sets to
render five columns. The detail page passes the already-loaded `InvoiceDetail`
straight in and skips the re-fetch.

Both reads resolve under the caller's own RLS — `invoices` via
`app.owns_student`, `academies` via `app.is_member` — so a learner gets exactly
their own documents and the feature needed no new policy.

### Copy

New `doc.*` namespace (`lib/i18n/locales/{en,ms}/documents.ts`). It is separate
from `payments.*` and `lacct.*` because the same strings are rendered from two
very different places: the learner's screens, and a plain drawing helper with no
hook — `pdf.ts` resolves them with `translate()`, the documented escape hatch
for non-component code.

## 4. Previewing the letterhead from Settings

**Preview invoice** sits next to **Save details** on the Academy details card
and opens `InvoicePreviewDialog` — the real invoice and receipt, rendered from
the real `pdf.ts`, in an `<iframe>`.

**It draws the actual document, not a mock-up.** `pdf.ts` grew a build/deliver
split: `buildInvoicePdf` / `buildReceiptPdf` return `{ doc, fileName }`, and the
`downloadInvoicePdf` / `downloadReceiptPdf` pair are now two-line wrappers that
call `doc.save(fileName)`. The preview takes the same `doc` and calls
`doc.output('blob')`. A mock-up would drift; this cannot.

**The letterhead is the form's current state, not the saved row.** The question
being answered is "how will *this* look" — an admin can see a wrapped address or
an over-tall logo before committing to it. Nothing is written and nothing is
read, so this is safe on an unsaved form, and it works on an academy that has
never issued an invoice. The effect depends on the five letterhead *fields*
rather than the object (the parent builds it inline, so its identity changes
every render) plus `t`, which is memoised per language — so the document
redraws exactly when it would look different, including on a language switch.

**The invoice is invented** (`features/settings/sampleInvoice.ts`). It is
deliberately part-paid with one payment recorded: that is the only shape that
exercises every block both documents can draw — line items, tax, an amount paid,
an outstanding balance, and the receipt's payments table. The payer is
`doc.sample.student` → "Sample Student", not a plausible person's name, so a
preview that gets printed or saved can never read as a real bill. It is built by
a function rather than held as a constant because `translate()` reads the
language at call time.

The tab strip is a plain segmented control, not shadcn `Tabs`: there is one
panel rather than two, and it would have been the only `Tabs` in the app.

## Not done

- No PDF affordance on the **admin** invoice page (`/payments/:id`); the request
  was scoped to the learner's billing screens. `useInvoiceDocuments` is generic
  and would drop straight in.
- The receipt covers the **invoice**, not one payment. A per-payment receipt
  would need its own numbering series.
- `city` / `state` / `postcode` stay unexposed; the address is edited as one
  multi-line field.
