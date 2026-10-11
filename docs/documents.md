# Documents — the offer letter, the IC copy and the employment letter

One parent in both rails, **Documents**, over three pages: the **offer letter**
(surat tawaran) the academy issues to a student, and the **IC copy** (salinan
kad pengenalan) and the **employment letter** (Surat Pengesahan Tempoh Bekerja)
it collects from one. Web only for now; the mobile apps come later.

| | staff (admin only) | student |
| --- | --- | --- |
| offer letter | `/documents/offer-letters` — every student, who has signed, download any | `/learn/documents/offer-letter` — sign, agree, download their own |
| IC copy | `/documents/ic-copies` — every student, view the copy | `/learn/documents/ic-copy` — upload, replace, view |
| employment letter | `/documents/employment-letters` — as the IC copy | `/learn/documents/employment-letter` — as the IC copy |

`/documents` and `/learn/documents` redirect to the letter: the parent is a
heading in the rail, not a page. The staff pages are one roster
(`features/documents/DocumentStudentList.tsx`, one read in
`features/documents/api.ts`) with search and a course filter, and one trailing
cell that is the page's own business.

**The roster opens on the interesting half.** Each page's third filter has a
default (`statusFilter.defaultValue`): the offer letter opens on *Signed and
agreed*, the IC copy and the employment letter on *Uploaded*. *All statuses* is
one click away; the choice is not remembered between visits. The two uploaded
documents also list the newest course first (`newestCourseFirst`: latest
`start_date` first, no start date last, names alphabetical within a course); the
offer letter stays alphabetical.

A student's **course** here is their one enrolment that is not cancelled —
`enrollments_one_course_per_student` allows exactly one — whatever state it is
in.

## The offer letter

### Drawn, not stored

`features/offer-letter/letter.ts` draws the letter with jsPDF, as
`features/payments/pdf.ts` draws an invoice: built on demand from what the
record says today, nothing saved, nothing frozen. The wording, the page breaks
and the positions of pages one to five are the academy's own letter, measured in
points from the PDF it was supplied as. Page six is the student's acceptance
([below](#the-acceptance-page-six)). It is always Malay, whatever language the
app is in — it is a document, not a screen.

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

### The acceptance (page six)

The letter ends with a declaration the student accepts — *Pengakuan penerimaan
tawaran dan persetujuan terma & syarat* — and a place to sign. The wording is
`features/offer-letter/terms.ts`: one text for the student's page and the
letter, Malay whatever the app's language, so it is **not** in the i18n
dictionary and has no English twin to drift from it.

What page six carries comes from `student_offer_acceptances`:

| | signed | not signed |
| --- | --- | --- |
| signature | the picture, scaled to fit 160 × 50 pt, across the dotted line | the dotted line, bare |
| Nama / No. kad pengenalan | from the record | from the record |
| Tarikh | the day it was signed, on the **Malaysian** calendar | dots, to fill in by hand |

The day is `accepted_at` read in `Asia/Kuala_Lumpur`, not in the reader's
timezone: a late-evening signature must not print as the day before for
somebody downloading it from abroad. (Contrast the start date, a calendar day
with no time at all, which is never run through `Date`.)

### Who may download

**An admin, anything.** The staff page asks nothing of the record: whatever is
missing prints as a blank, to be filled in by hand — including page six's
signature when the student has not signed, and a payment nobody has made. If
the student has signed, the signature is read for that click and the letter
carries it.

**A student, when three things are true**, and the page shows the first that is
not:

1. their course has a **start date** — it is the date the letter carries;
2. they have **paid something** — any invoice of theirs with
   `amount_paid_sen > 0`. That is the student's side of the ledger
   ([payment-screens.md](payment-screens.md)): it counts a bank transfer
   whether or not the academy has filed its receipt, so a student who paid is
   not kept waiting on the academy's paperwork. The page offers a link to
   billing and nothing else;
3. the student's own part is done. In one form, whatever is missing is asked
   for, saved, and the letter downloads in the same step:
   - an **IC number** and a **personal address**, saved through
     `update_my_student_details` ([invoice-documents.md](invoice-documents.md)
     §5). An IC number staff typed freehand that the function would refuse
     counts as missing and is offered back to be corrected;
   - a **signature**, drawn in the box, and the **terms agreed** by ticking the
     checkbox under them — both required, in that order, before anything is
     saved.

Once a signature is on file the form shows it with the date, and the button is
a plain *Download*. **Sign again** reopens the box for a replacement; it asks
for the agreement again, because it is a new acceptance.

These are what the academy asks for, **not an access boundary**. The letter is
drawn in the browser from the student's own record and a template that ships
with the app, so there is nothing for RLS to guard: a student who bypassed the
page would obtain their own letter. If the payment rule ever has to be
enforced, the letter has to be built server-side. What *is* enforced is who may
write or read a signature — below.

### The signature and who may read it

`student_offer_acceptances` — `student_id` is the primary key, so signing again
replaces — with `signature` (the PNG as a data URL), `academy_id` and
`accepted_at`. Migration `20261012100000_student_offer_acceptances.sql`.

- **Written** only by `sign_offer_letter(_student_id, _signature)`, a SECURITY
  DEFINER RPC: the caller must be the account the student record is linked to,
  the record must not be archived, and the academy is copied from the record.
  Staff do not sign for a student. Clients have no DML on the table.
  `accepted_at` is the database's `now()`, which the page hands straight to the
  letter — never the browser's clock.
- **Read** by **`app.is_admin OR app.owns_student`**, as an IC copy is. Not
  `app.is_staff`: a trainer reads students and has no use for anybody's
  signature. The staff list embeds `accepted_at` only; the picture is fetched
  for the one student whose letter is being downloaded.
- **Kept in the table, not a bucket.** The pad draws a 900 × 300 black-on-white
  PNG, a few kilobytes of ink, so a private bucket and an Edge Function would be
  more machinery than it deserves. The shape is checked twice, by a `check`
  constraint and again in the RPC: a PNG data URL, 300,000 characters at most.
  If signatures ever become large or varied, they move to a bucket as the IC
  copies did.
- **White paper, not transparent.** The picture reads the same in either theme
  on the page and lays onto the letter with no alpha channel to go wrong.

The staff page lists the date beside each download — *Signed and agreed* — or
*Not signed*, and a third filter beside search and course narrows the roster to
either (`DocumentStudentList`'s optional `statusFilter`; the IC copy page does
not pass one). Signing and agreeing are one act: there is no row for a student
who ticked and did not sign, nor the reverse.

## The IC copy and the employment letter

Two documents, one shape. Everything below is written for the IC copy; the
employment letter is the same in every respect but the names:

| | IC copy | employment letter |
| --- | --- | --- |
| table | `student_ic_copies` | `student_employment_letters` |
| bucket | `ic-copies` | `employment-letters` |
| Edge Function | `ic-copy` | `employment-letter` |
| migration | `20261011110000_student_ic_copies.sql` | `20261012120000_student_employment_letters.sql` |

The Edge Function is a copy of the other with the names changed, not one
function with a `kind`: a mistake in one cannot reach the other's bucket, and
the live IC copy function was not touched to add the second document. The
pages are written once (`features/documents/UploadedPdfPages.tsx`) and the
web's upload and link helpers are one pair of functions over a function name
(`lib/storage.ts`).

The employment letter is **not required of anyone** — nothing blocks on it, and
a student with none simply shows *Not uploaded*.

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
- The terms are not versioned. An acceptance records when, not which wording:
  page six is drawn from `terms.ts` as it reads today, like the rest of the
  letter, so changing the text changes what an old signature appears under. If
  that matters, freeze the text on the row at signing.
- A replaced signature is gone — the row is overwritten, with no history of the
  earlier one.
- Staff cannot clear a signature from the app; that is the owner's, in SQL.
- No way for a student to remove an IC copy or an employment letter, only to
  replace it.
- The employment letter has no expiry and no notion of which employer or period
  it covers; it is a file, as the IC copy is.
