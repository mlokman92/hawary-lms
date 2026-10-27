# Documents — the offer letter, the IC copy, the employment letter and the KWSP letter

One parent in both rails, **Documents**: the **offer letter** (surat tawaran)
the academy issues to a student, the **IC copy** (salinan kad pengenalan) and
the **employment letter** (Surat Pengesahan Tempoh Bekerja) it collects from
one, and — on the staff rail only — the **KWSP letter** (Surat Pengesahan
Pendaftaran Pelajar) it prepares for some. A student asks for that last one
from **KWSP application**, a page of its own in their rail. Web only for now;
the mobile apps come later.

| | staff (admin only) | student |
| --- | --- | --- |
| offer letter | `/documents/offer-letters` — every student, who has signed, download any | `/learn/documents/offer-letter` — sign, agree, download their own |
| IC copy | `/documents/ic-copies` — every student, view the copy | `/learn/documents/ic-copy` — upload, replace, view |
| employment letter | `/documents/employment-letters` — as the IC copy, plus accept, or reject with a note | `/learn/documents/employment-letter` — as the IC copy, plus where it stands and why it was rejected |
| KWSP letter | `/documents/kwsp-letters` — who has applied, who has one, download; create for many in a dialog | `/learn/kwsp` — apply, withdraw while under review, and read where it stands; never the letter |

`/documents` and `/learn/documents` redirect to the letter: the parent is a
heading in the rail, not a page. The staff pages are one roster
(`features/documents/DocumentStudentList.tsx`, one read in
`features/documents/api.ts`) with search and a course filter, and one trailing
cell that is the page's own business.

**The roster opens on the interesting half.** Each page's third filter has a
default (`statusFilter.defaultValue`): the offer letter opens on *Signed and
agreed*, the IC copy and the employment letter on *Uploaded*. *All statuses* is
one click away; the choice is not remembered between visits. Each page also
orders latest first (`latestFirst`, no date last, names alphabetical within a
date): the offer letter by when it was signed, the two uploaded documents by
the course's `start_date`.

**50 rows, then *Load more*.** The roster is one read and filters in the
browser, so the limit is only on what is drawn; changing a filter or the
search starts again at 50. A roster with checkboxes (the KWSP pages) shows
everyone, because *select all* has to reach everything the filters left.

**One student's row is also on `/students/:id`**, as a *Documents* card
(`features/documents/StudentDocumentsCard.tsx`) under the enrolment: the
documents, the date each was signed, uploaded or created, and the roster's own
actions — *Download* for a letter, *View* for a file that is there, and
*Create* for a KWSP letter the student does not have yet (a student who has
asked for one reads *Applied*, with the date). It is the
roster's read narrowed to one id (`useStudentDocuments`), keyed under the
roster's so one invalidation refreshes both, and it is shown to an admin only,
for the reason the pages are. The student's own dashboard and KWSP page run the
same read on their own id: RLS hands a student their row and what is theirs on
it, so the statuses there are one request and need no second copy of the rule. Two differences from the roster: an archived
student still has a card, and the letter's download reads the row again first —
the profile and the course are edited on that same page, and neither edit
invalidates this read.

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
a student with none simply shows *Not uploaded*. It differs from the IC copy in
one respect: an admin reviews it ([below](#the-employment-letter-is-reviewed)).

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

### The employment letter is reviewed

Added 2026-10-22, migrations `20261022090000_employment_letter_rejected_kind.sql`
and `20261022090100_employment_letter_review.sql`. The academy found letters
that would not do and wanted those students to send them again.

- **Three states on the row**, `student_employment_letters.status`: *pending*
  (sent, nobody has looked), *accepted*, *rejected* — with `review_note`,
  `reviewed_at` and `reviewed_by`. A check constraint makes a rejection carry a
  note.
- **The 104 letters on file when this arrived are accepted**, not pending: the
  column was added with a default of `accepted` and then switched to `pending`.
  Their `reviewed_at` is null — nobody reviewed them. The owner did not want
  them back in a queue; the few that are wrong are rejected like any other.
- **Every new file is pending**, a replacement included. That is a trigger
  (`student_employment_letters_new_file`, when `file_path` changes), not the
  Edge Function: the function was not touched, and every upload — web, the
  Student app, an old build of either — lands in front of an admin.
- **Accept and reject are RPCs**, `accept_employment_letter(_student_id)` and
  `reject_employment_letter(_student_id, _note)`: SECURITY DEFINER, an admin of
  the letter's academy, as the KWSP functions. Rejecting needs a note (1,000
  characters at most) and notifies the student in the same transaction
  (`employment_letter_rejected`, [notifications.md](notifications.md)).
  Rejecting can happen in any state — an accepted letter is how the old
  problem ones are sent back — and again, with a new note. Accepting a
  rejected letter takes the rejection back; the student keeps the
  notification.
- **The file stays when it is rejected**, so both sides can still open what was
  turned away until a new one replaces it.

On the page, each row reads *Pending review*, *Accepted* or *Rejected* (the
note on hover), pending rows come first, and the status filter has the three
beside *Uploaded* and *Not uploaded*; it still opens on *Uploaded*. *Accept* is
a button on a pending row; *Reject…* — and *Accept*, on a rejected one — are
behind `⋯`, and the same control sits on the student's Documents card
(`features/documents/EmploymentLetterReview.tsx`). The student's page shows the
state beside the file and the note under it; uploading again is the answer.
Their dashboard reads the state too.

**Web only so far.** The Student app still shows *Uploaded* and nothing else,
and its notification screen does not know the new kind until the mobile
catch-up syncs `render.ts` and `link.ts`; the push itself is sent correctly
(`send-push` composes it server-side).

## The KWSP letter

Surat Pengesahan Pendaftaran Pelajar: the academy's confirmation to KWSP that
somebody is its student, which a student paying through a KWSP withdrawal has to
hand in. **Not every student has one**, and the letter is **the academy's
alone** — it is created, downloaded, printed, signed and handed over by an
admin. A student can **ask for it** and see where the request stands
([below](#the-application)); they never hold the file.

### Created, then drawn

Two separate things:

- **Created** is a row in `student_kwsp_letters` (`student_id` primary key,
  `academy_id`, `created_at`) — the fact that this student has one, and since
  when. Migrations `20261013160000_student_kwsp_letters.sql` and
  `20261013160100_remove_kwsp_letters.sql`.
- **Drawn** is `features/kwsp-letter/letter.ts`, on every download, from the
  record as it reads that day. Nothing of the letter is stored, as with the
  offer letter, and it borrows that letter's letterhead, footer and text
  drawing (`block`, which learned to rule text out and to underline for this).

Creating does not download and downloading does not create: a letter can only
be downloaded for a student who has the row.

**The page lists the students who have applied and the students who have
one.** `/documents/kwsp-letters` is the roster narrowed to them
(`DocumentStudentList`'s `only`), with search, the course filter, a status
filter (*Applied* / *Created*) and a checkbox on every row (`selection`).
Anybody else is not on the page at all; there is no "not created" row.

- **Applications come first** (`first`): they are what is waiting on somebody.
  The page opens on *All statuses* rather than on *Applied*, so a day with no
  applications still opens on the letters and not on an empty list.
- An application's row says when it was sent and carries **Create** — the
  review is reading the row, and creating the letter is the answer. A letter's
  row carries its date and **Download**, as before.
- Every row carries **Payment history**: a panel
  (`features/payments/StudentPaymentsSheet.tsx`) of what the student has paid,
  every status, read through `payment_log_page` scoped to the student — so it
  is the ledger's own answer, admin-only like the rest of the money. Whether a
  student has paid is asked before their letter is created.
- Ticking rows brings up *Create (n)* for the applications among them,
  *Download (n)* for the letters — one file, a letter to a page — and
  *Remove (n)* behind `⋯`.

**Where it is created.** On an application's row. For one student who has not
applied, the *Create* button on their Documents card on `/students/:id`. For
many, the page's *Create* button opens a dialog
(`features/documents/KwspCreateDialog.tsx`): the same roster, turned round to
everyone who has **no** letter — applicants included — with its own search and
course filter, so a course and *select all* make a course's worth one click,
and the button says how many it will create.

**A selection never holds a student who is not in view**, on the page or in
the dialog: narrowing the roster drops whoever it hides, so nothing is created
or removed out of sight.

### The application

The student asks; an admin answers by creating the letter. Migrations
`20261014090000_student_kwsp_applications.sql` and
`20261014090100_remove_kwsp_applications.sql`.

- **`student_kwsp_applications`** (`student_id` primary key, `academy_id`,
  `created_at`) — the fact that this student asked, and when. **A table of its
  own, not a state on `student_kwsp_letters`**: a row there keeps meaning "the
  academy has prepared one", so `create_kwsp_letters` and `remove_kwsp_letters`
  were not touched and the build deployed before this kept working unchanged.
- **Three states, none stored** (`kwspState` in `features/documents/api.ts`):
  no row in either table is *not applied*; an application with no letter is
  *under review*; a letter is *approved*, asked for or not. The student reads
  those three words; staff read *Applied {date}* and *Created {date}*.
- **Applying is one button** on `/learn/kwsp`. The letter is drawn from the
  record, so there is nothing to fill in — except an **IC number** when the
  record has none (or holds one the save would refuse), since the letter is two
  lines of it. It is asked for there and saved through
  `update_my_student_details` on the way, as on the offer letter's page; the
  function refuses an application from a record with no IC number, so the rule
  does not rest on the page.
- **What comes back is a status, never the file.** The letter is the
  academy's to sign, stamp and hand over, as it always was.
- **The student may withdraw while it is under review** — *Withdraw* beside
  the status on `/learn/kwsp`, through `withdraw_kwsp_application`. The row
  goes, the page shows *Apply* again, and a later application has a new date.
  No confirmation: nothing is lost but that date. Once the letter is created
  the application has been answered and the function refuses, so a letter is
  never left without the request behind it. Migration
  `20261017100000_withdraw_kwsp_application.sql`.
- **Taking a letter back leaves the application waiting again** — the
  application row is still there. *Remove* on an application that has no letter
  turns it away: the row goes, the student reads *not applied* and may ask
  again. There is no "declined" state and no reason given; if the academy wants
  to say why, that is a conversation.
- **Nobody is notified** — not the admins when one arrives, not the student
  when it is answered. The page lists applications first, and the student's
  dashboard shows where theirs stands.

### Who may do what

- **Read**, both tables: **`app.is_admin OR app.owns_student`**, as an IC copy
  is — not a trainer. The letter's row was admin-only while the student had no
  part in it; having applied, they need the answer. The row says only that a
  letter exists and since when.
- **Written** only by SECURITY DEFINER RPCs; clients have no DML on either.
  `create_kwsp_letters(_student_ids uuid[])` wants every id to be a live
  student of an academy the caller administers, or it writes nothing — a partial
  bulk would leave the admin guessing which rows took. A student who already has
  one is passed over, so an existing date does not move.
  `remove_kwsp_letters(_student_ids uuid[])` takes rows back; it exists because
  a bulk create is one click and needs an undo, and it loses nothing but the
  date.
  `apply_for_kwsp_letter(_student_id uuid)` is the student's: the caller must be
  the account the record is linked to, as in `sign_offer_letter`, and applying
  twice keeps the first date. Staff do not apply for a student — an admin who
  wants one to have a letter creates it.
  `remove_kwsp_applications(_student_ids uuid[])` is an admin's, and passes over
  rows of an academy the caller does not administer.
  `withdraw_kwsp_application(_student_id uuid)` is the student's again — the
  caller must be the linked account — and only while no letter exists.

### What the letter says

One A4 page. Four values come from the record and one from the admin who
downloads it; everything else is the form.

| on the letter | from |
| --- | --- |
| (a) Nama Pelajar | `students.full_name`, upper-cased |
| (b) No.Kad Pengenalan | `students.ic_number`, dashes restored |
| (c) No.Pendaftaran/Matrix Pelajar | the IC number again, as on the academy's form — **not** `student_no` |
| (g) the two dates | `courses.start_date` *sehingga* `courses.end_date` of the student's course |
| (i) Tahun Pengajian Semasa | the year of the start date |
| Tarikh, beside the signature | the day it is **downloaded** on the Malaysian calendar, or a day the admin picks |

**Fixed text, as in the offer letter and for the same reason**: the programme
(*Pengajaran Prasekolah*, *Tahap 4*, `P851-002-4:2025`), the institution's
registration `PD6238`, *6 Bulan*, the fee `RM 2,500.00`, and the payee. None
follows `price_sen` or the course's length. A second programme needs its own
letter.

**The account number is the offer letter's, `5511 9112 8510`.** The supplied
form printed `5515 9112 8510`; the academy confirmed 5511 is the account
(2026-10-14). The bank is still the form's *Maybank Berhad*, where the offer
letter says *Maybank Islamic Berhad*. It is one string in `PAYEE`.

**Dated on the page, signed and stamped by hand.** The signature line is
printed blank, with no signature picture and no name stamp under it; the
academy signs and stamps the printed letter (2026-10-23, at the owner's
request — it used to carry the offer letter's signature and a typed stamp).

**The date is the day of the download**, today in `Asia/Kuala_Lumpur`
(`todayInMalaysia`), so a letter printed for KWSP reads as current. *Download*
uses it with no question asked. *Download with date…*, behind `⋯` on the
student's Documents card and on the page's selection bar, opens a date field
that starts on today (`KwspDateDialog`); every letter in that file is signed on
the day chosen. The day is not stored: the next download is today again. A
single row on the page has no `⋯` of its own — tick it and use the bar's.

**What was changed from the supplied form:** four misspellings in the running
text — `diddaftarkan`, `insitusi` (three times), `pembiayaaan`,
`peruntukkan` — and the letterhead and footer, which are the offer letter's
(the form's own footer was black and carried a *Dimiliki oleh* line). The
labels of the lettered rows are left exactly as the form has them, including
*Dokument* and *Semesta*, and so are the alternatives the form rules out in
rows (k) and (l).

**A long name** wraps to a second line and the signature line gives up that
much room, never the footer's. The page is full: a hand signature needs room
above the line and a stamp below it, clear of the footer, so the paragraph gaps
are tight and the line has a floor (`SIGN_FLOOR`). A name of three lines — over
a hundred characters — is the one case where the two touch.

## Not done

- The student cannot download the KWSP letter, on purpose, and the KWSP
  application has no mobile page yet.
- No notification when a KWSP application arrives or is answered, and no count
  on the staff rail.
- The KWSP letter records that it was created, not who created it, nor each
  download.

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
- Admins are not told when a letter arrives or is replaced; the page lists
  pending letters first, and there is no count on the rail.
- The IC copy is not reviewed.
