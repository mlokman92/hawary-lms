# Documents — the offer letter and the IC copy

One parent in both rails, **Documents**, over two pages: the **offer letter**
(surat tawaran) the academy issues to a student, and the **IC copy** (salinan
kad pengenalan) it collects from one. Web only for now; the mobile apps come
later.

| | staff (admin only) | student |
| --- | --- | --- |
| offer letter | `/documents/offer-letters` — every student, download any | `/learn/documents/offer-letter` — their own |
| IC copy | `/documents/ic-copies` — every student, view the copy | `/learn/documents/ic-copy` — upload, replace, view |

`/documents` and `/learn/documents` redirect to the letter: the parent is a
heading in the rail, not a page. Both staff pages are one roster
(`features/documents/DocumentStudentList.tsx`, one read in
`features/documents/api.ts`) with search and a course filter, and one trailing
cell that is the page's own business.

A student's **course** here is their one enrolment that is not cancelled —
`enrollments_one_course_per_student` allows exactly one — whatever state it is
in.

## The offer letter

### Drawn, not stored

`features/offer-letter/letter.ts` draws the letter with jsPDF, as
`features/payments/pdf.ts` draws an invoice: built on demand from what the
record says today, nothing saved, nothing frozen. The wording, the page breaks
and the positions are the academy's own five-page letter, measured in points
from the PDF it was supplied as. It is always Malay, whatever language the app
is in — it is a document, not a screen.

Four values on page one come from the record. Everything else is the letter.

| on the letter | from |
| --- | --- |
| Tarikh | `courses.start_date` of the student's course, as `01 April 2026` |
| Nama calon | `students.full_name`, upper-cased |
| No. kad pengenalan | `students.ic_number`; twelve digits get their dashes back |
| Alamat | `students.personal_address`, upper-cased, line breaks as commas |

The date is read from the `YYYY-MM-DD` string and never through `Date`: a start
date is a calendar day and must not move with the reader's timezone.

**Everything else is fixed text, on purpose.** `Ruj. Kami: HA/DKM/4/2026`, the
fee (`RM2,500.00`), the six months, the bank account and the signatory are
typed into `letter.ts` exactly as the letter has them. None is bound to the
course's `price_sen` or its dates: nobody asked for that, and a letter whose
fee silently follows a field somebody edited is a worse surprise than one that
has to be changed in one place. A second programme, or a branch, needs its own
letter — this file is Hawary Academy's DKM Tahap 4 letter and nothing more
general.

**The letterhead and the signature are files** in
`features/offer-letter/assets/`, lifted from the supplied PDF. The signature is
flattened to ink on white and drawn *before* the dotted line it sits across.
They ship in the web bundle, so the URL of each is public to anyone who reads
the bundle — acceptable because every student is handed a PDF carrying them
anyway. If that stops being acceptable they move to a private bucket and the
letter is built behind a function.

**What was changed from the supplied draft**, so that a later comparison does
not read as an accident:

- four misspellings corrected — `Assalamulaikum`, `penmabahbaikan`, `malumat`,
  `nilau tambah` — and `NOSS;dan` given its space;
- the literal `*…*` around the motto dropped (the line is still italic);
- the emblem and the wordmark set side by side — in the draft the emblem
  covered the first letter of *SKILLED* on four pages;
- one left margin and one list indent throughout, where the draft's pages
  differed by a few points.

Left as written: the stray hyphen in the title, `; dan` on two consecutive list
items, `DKM*` with no footnote, and the two expansions of *LPKC*.

**A long address** is the only thing that can move the page. The letter leaves
two lines for it; a third fits at full size, anything longer is set at 9pt and
cut at five lines, and past two lines the blank line under the address gives
way so the last paragraph stays clear of the footer.

### Who may download

**An admin, anything.** The staff page asks nothing of the record: whatever is
missing prints as a blank, to be filled in by hand.

**A student, when three things are true**, and the page shows the first that is
not:

1. their course has a **start date** — it is the date the letter carries;
2. they have **paid something** — any invoice of theirs with
   `amount_paid_sen > 0`. That is the student's side of the ledger
   ([payment-screens.md](payment-screens.md)): it counts a bank transfer
   whether or not the academy has filed its receipt, so a student who paid is
   not kept waiting on the academy's paperwork. The page offers a link to
   billing and nothing else;
3. the record has an **IC number** and a **personal address**. Whichever is
   missing is asked for on the page, saved through `update_my_student_details`
   ([invoice-documents.md](invoice-documents.md) §5) and the letter downloads
   in the same step. An IC number staff typed freehand that the function would
   refuse counts as missing and is offered back to be corrected.

These are what the academy asks for, **not an access boundary**. The letter is
drawn in the browser from the student's own record and a template that ships
with the app, so there is nothing for RLS to guard: a student who bypassed the
page would obtain their own letter. If the payment rule ever has to be
enforced, the letter has to be built server-side.

## The IC copy

### Shape

`student_ic_copies` — `student_id` is the primary key, so uploading again
replaces — and the private bucket `ic-copies` (PDF only, 10 MB). Migration
`20261011110000_student_ic_copies.sql`.

A table of its own rather than columns on `students`, so that who may read a
scan is a policy on the scan: **`app.is_admin OR app.owns_student`**. Not
`app.is_staff` — a trainer reads students and has no use for anybody's identity
card. The staff page is behind `AdminRoute` for the same reason, and would list
every copy as "not uploaded" for a trainer who reached it anyway.

### One Edge Function, like the receipts

`ic-copy` is `payment-receipt` again
([payment-screens.md](payment-screens.md)): the bucket has no `storage.objects`
policies and the table takes no client writes, so one function holding the
service role does both halves.

- **Upload** (`multipart`: `file`, `student_id`) — the caller must be the
  account the record is linked to. The academy comes from the record, never the
  request. PDF is checked twice, by declared type and by the file's first five
  bytes, because the type is only what the browser guessed. The object is
  written, then the row; a failed row takes the object back out, and a replaced
  copy's old object is removed only after the new row is in.
- **Link** (`json`: `student_id`) — the row is read under the caller's own JWT,
  so the policy above decides; only a path the database handed back is signed,
  for 60 seconds.

**Staff do not upload on a student's behalf.** Nobody asked for it, and it is
the student's card. If the academy starts receiving them by WhatsApp, that is a
second branch in the function and a button on the staff page.

Deleting a student takes the row with it; the object stays in the bucket,
orphaned, as a deleted payment's receipt does. Nothing sweeps either yet.

## Not done

- Mobile. The Student app has neither page.
- No record of who downloaded a letter, or when.
- No way for a student to remove an IC copy, only to replace it.
