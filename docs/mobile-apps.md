# The mobile apps

Two store apps, built from one Expo project with EAS:

| app | for | bundle id | scheme | route tree |
| --- | --- | --- | --- | --- |
| **Hawary Student LMS** | students | `my.hawary.student` | `hawarystudent://` | `apps/mobile/src/app-student` |
| **Hawary Academy LMS** | admins and trainers | `my.hawary.academy` | `hawaryacademy://` | `apps/mobile/src/app-academy` |

They talk to the same Supabase project as the web app, through the same tables,
RPCs and RLS. Nothing on a phone is trusted any more than a browser is.

## One project, two apps

`APP_VARIANT` (`student` | `academy`) is read by `apps/mobile/app.config.ts` and
decides the name, bundle id, scheme, EAS project **and which folder
expo-router treats as its `app` directory** (the plugin's `root` option). So a
binary ships only its own screens — the Student app does not contain the
grading queue, greyed out or otherwise — while everything outside the two
route folders is shared.

Two projects with a shared package was the obvious alternative. It was not
taken because the shared part is most of the app (auth, the data layer, the UI
kit, the LPKC thread, notifications, announcements), and a workspace package
holding React Native code under pnpm is a standing invitation to two copies of
`react-native` in one bundle.

**The variant is fixed at build time and read from `expo-constants`**
(`lib/env.ts`). Metro caches a file's transform together with the environment
it inlined, so switching variants without clearing the cache serves the other
app's constants — which is why every script in `apps/mobile/package.json`
passes `--clear`. EAS builds start clean and are not affected.

**One React.** The web app and the mobile app pin different React patch
versions, so the workspace holds two copies. `metro.config.js` resolves every
`react` import as if it came from `apps/mobile`; without that, hoisted packages
resolve the root copy and hooks throw.

## What is in each app, and what is not

Decided feature by feature with the owner (2026-10-05). The rule that came out
of it: **a phone is for doing the work; a desk is for setting it up.**

**Student** — everything on `/learn`, except the public join link
(`/enroll/<slug>`), which stays a web page.

**Academy** — in: Today, marking, the LPKC queue and thread, students (look up,
add, edit, enrol), enrolment requests, instructors (read), the diary, the
register, booking for a student, blocked dates, invoices (read, record a
payment, share the pay link, PDFs), the payment log (read), incentive batches
(read), announcements, the publish switch on course content.

**Academy — deliberately web-only:** building a course (modules, notes,
questions, uploads, duplication); enrolment setup and bulk enrol; the LPKC
checker pool; suspending or archiving a student; CSV import; managing
instructors; booking policy, hours and pool; creating and voiding invoices,
payment terms and notes; the payment report and course billing; **disbursing
incentives**; members; settings; analytics.

Disbursing is worth its own sentence: it is hundreds of sequential transfers
that have to be watched, resumed and reconciled, and a duplicate cannot be
undone ([billplz-incentives.md](billplz-incentives.md)). The phone shows how a
batch went and has no button that sends money.

## The data layer is the web app's, copied by a script

The apps need the same queries the web app already has: ~35 files of TanStack
Query hooks under `apps/web/src/features/*`. Those files depend on nothing but
`@/lib/{supabase,auth,i18n,errors,format,…}`, and `apps/mobile/src/lib`
provides modules at exactly those paths with the same exports. So the hooks run
on a phone **unchanged**, and `apps/mobile/scripts/sync-web-data.mjs` copies
them across.

- **The web file is the source.** A synced file starts with a header saying so.
  Change it in `apps/web`, then `pnpm --filter mobile sync:data`.
  `sync:check` exits non-zero when a copy is stale.
- Two mechanical rewrites, both because there is no browser:
  `window.location.origin` becomes `APP_ORIGIN` (the web app's address — the
  links in emails must point there either way), and an upload's DOM `File`
  becomes `UploadFile` (a picked file's uri, name, type and size).
- A file that uses any other browser API makes the script fail rather than copy
  something that would crash on a phone.

Moving the hooks into `packages/shared` is the tidier end state. It was not
done now because it rewrites the import of every web feature in one go, on a
live app, to save a copy step.

What **did** move to `packages/shared` is the dictionary
(`packages/shared/src/i18n`), as [i18n.md](i18n.md) always said it would. Both
surfaces render the same copy; mobile-only strings are the `mobile` namespace
(`m.*`).

Mobile-only modules (not synced): `lib/{env,kv,supabase,auth,i18n,storage,push,
deviceCalendar}`, `features/{files,announcements,version}`,
`features/payments/documents.ts`, `features/courses/content.ts`.

## Sign-in, and the two emails that land on the web

Email and password, against the same Supabase Auth. The session lives in
AsyncStorage.

The **confirmation** email and the **password reset** email both open the web
app, on purpose. Supabase only redirects to URLs on its allow list
([production-urls.md](production-urls.md)); the web pages for both exist and
work; and somebody finishing either one simply comes back to the app and signs
in. Nothing in the apps depends on a redirect the dashboard could silently drop.

**The gate** (`shell/AppRoot.tsx` → `useGate`) is the phone's
`useLandingTarget`: signed out → sign in; signed in with a membership this app
serves → the app; signed in without one → `/onboarding`, which shows pending
invitations, or *"this is a staff account — use the other app"*, or *"no record
of you at this address"*. Each app only offers the invitations it can act on: a
trainer invitation accepted in the Student app would grant a membership the app
then could not open.

**Deleting an account** (Student app, profile). Apple requires it of any app
that lets people create an account. `delete_my_account()` deletes the
`auth.users` row, which cascades to the profile, memberships, notifications and
registered phones. The academy's own record survives — `students.user_id` is
`ON DELETE SET NULL` — so enrolments, invoices and payments stay, unlinked,
exactly as they were before anybody claimed them, and the same email can claim
the record again. Staff are refused: a staff account is removed by a Director.

## Push

**A push is a copy of a `notifications` row, never a second source of truth.**

```
the write (booking, comment, payment…)
  └─ app.notify(...)            same transaction — the row is the record
       └─ trigger: notifications_dispatch_push   (statement-level)
            └─ pg_net → send-push (Edge Function, Vault bearer)
                 └─ Expo push service → the phone
```

- The phone registers itself with `register_push_device(token, app, platform,
  lang)`; `push_devices` has no client policies at all. The upsert is on the
  **token**, so when a second person signs in on a shared phone the row moves to
  them. Sign-out calls `unregister_push_device`.
- The trigger is statement-level with a transition table, so an announcement to
  600 students is one HTTP call carrying 600 ids. pg_net sends after commit; a
  rolled-back write pushes nothing.
- `send-push` is told notification **ids** and nothing else. Who is told, what,
  and in which language come from the stored rows, so it cannot be used to push
  arbitrary text to anybody.
- **Which app:** `data.role` — `instructor` goes to the Academy app, anything
  else to the Student app. A person with both apps on one phone gets each
  notification once.
- **Language:** a row stores an event, not a sentence
  ([notifications.md](notifications.md)), and the app renders it in the reader's
  language. A push has to be a sentence, so `send-push` writes it in the
  language the device registered with. It is the one place outside the
  dictionary that holds user-facing copy, in both languages.
- **Tapping** a push opens the screen `shell/links.ts → linkOf` returns — the
  function the notifications screen uses — so a push and the row it copies
  cannot lead to different places.
- Every trigger that writes a notification, and the dispatcher itself, swallow
  their own failures. Telling somebody is never worth failing the booking,
  payment or mark it is about.

### Six new kinds

Added with the apps, but ordinary rows: the web bell shows them too. Wording is
in `features/notifications/render.ts`, shared by all three surfaces.

| kind | written when | to |
| --- | --- | --- |
| `work_marked` | a hand-in becomes graded/returned; an attempt is graded **by a person** | the student |
| `work_due` | 09:00 academy time, work closing within 36 h and not handed in | the student |
| `invoice_issued` | an invoice is created issued, or leaves draft | the student |
| `payment_received` | a `payments` row succeeds (manual or ToyyibPay) | the student |
| `appointment_reminder` | the evening-before email stamps `reminder_sent_at` | the student |
| `announcement` | `post_announcement` | every recipient |

Three decisions inside that table:

- An **auto-graded** attempt tells nobody: the score is on the student's screen
  the moment they submit, and a notification would arrive after the news.
- **`appointment_reminder` rides on the email** rather than keeping a second
  clock. Same selection, same hour, same retries — and a student with no email
  address is stamped too, so they are still told here.
- **`work_due` remembers by looking at `notifications`** (one per person per
  piece of work, ever), not in a ledger table.

### Switched off until the web is deployed

The five triggers and the `work-due-notices` job were created **disabled**
(`20261006090300`). The live web bell only learned the new kinds in the same
change that added them, and an old bell would title an invoice notice "Session
booked with someone". Apply `20261006090400_mobile_event_triggers_on.sql` once
the web build carrying `features/notifications/render.ts` is live.

## Deep links

The web app's paths are the contract — every email already sent points at them
— so the apps bend to the web. `+native-intent.ts` passes every incoming link
through `shell/links.ts → routeForIncomingLink`: the Student app strips
`/learn`, the Academy app maps `/reports/:id` to `/lpkc/:id`, and a link the app
does not understand opens the home screen rather than an error.

Each app claims its own slice of `app.hawary.my`: `/learn` for Student; the
back-office sections for Academy. **Never `/`** — it would swallow
`/pay/<token>`, which has to stay a web page anybody can open.

Universal links need two files on the web host, both in
`apps/web/public/.well-known/`. They ship with placeholders and do nothing
until filled in:

- `apple-app-site-association` — replace `REPLACE_WITH_APPLE_TEAM_ID` (both
  entries).
- `assetlinks.json` — replace the two fingerprints with each app's signing
  certificate SHA-256 (`eas credentials`, Android).

Until then links from emails open the web app, as they do today, and the custom
schemes and push taps work regardless.

## Paying

**Pay online opens the web pay page** (`/pay/<token>`) in the browser sheet. It
is the page the emailed pay link opens, and it already does part payment, the
FPX surcharge notice and the hand-off to ToyyibPay. One payment flow, not two —
and tuition paid through the bank's own page is the arrangement the app stores
are least likely to question.

**Invoice and receipt PDFs** are laid out as HTML and rendered by the platform
(`expo-print`), then handed to the share sheet. Same blocks and `doc.*` strings
as the web's jsPDF documents ([invoice-documents.md](invoice-documents.md)) —
keep the two in step.

## Assignment attachments

New with the Student app, and the piece CLAUDE.md listed as not built.

- Private `submissions` bucket, key `<academy_id>/<uploader>/<uuid>.<ext>`,
  written only by `upload-media` and read only through `submission-url` (a
  60-second signed URL, by file id). The `student-reports` shape, for the same
  reasons ([report-checks.md](report-checks.md) → "Files").
- `assignment_submission_files`, not the old `attachment_url` column: a hand-in
  is usually several photographs, and a URL column cannot hold a private object.
  Its SELECT policy follows the submission.
- Clients have no DML. `attach_submission_file` re-checks the path was uploaded
  by the caller (`app.assert_own_upload`) and refuses anything but a **draft** —
  once handed in, what the grader is marking must not change underneath them.
  At most 10 files.
- A file needs a hand-in to hang on, so attaching the first one saves the draft
  first.
- The **web shows** attachments (grader and student) through
  `features/assignments/SubmissionFiles.tsx` and does not attach. Phone photos
  are the use case.

## Announcements

One message from the academy, or from one course, to its students.

- `announcements(academy_id, course_id?, title, body, author_name, …)`. A null
  course is the whole academy. `author_name` is a snapshot.
- Staff read all; a student reads the academy-wide ones and those of courses
  they are actively enrolled in.
- `post_announcement` writes the row **and** a notification per recipient in one
  statement — an announcement nobody was told about is a note on a page nobody
  opens. An admin may address the academy or any course; a trainer the courses
  they teach (`app.can_grade_course`).
- Mobile only. The web bell shows the notification (title and first lines) and
  leads nowhere; a web page for announcements is not built.

## Calendar

"Add to calendar" writes the session straight into the phone's calendar with an
alert 60 minutes before (`lib/deviceCalendar.ts`). Not the system's "new event"
form: that is one more screen to confirm something just asked for, and on
Android it cannot carry the alert. iOS is asked for write-only access.

## Forced update

`app_min_versions(app, platform, min_version, store_url)` — the oldest build
allowed to run. Readable signed out, because the check runs before sign-in.
Below the floor the app shows a link to the store and nothing else.

```sql
update app_min_versions
   set min_version = '1.2.0', store_url = 'https://apps.apple.com/…'
 where app = 'student' and platform = 'ios';
```

**It fails open.** If the row cannot be read the app runs: locking everybody
out because a version check could not reach the server would turn a small
problem into a total one.

## UI

A small StyleSheet kit in `apps/mobile/src/ui` carrying the web's neutral theme
(light, dark, follow the phone), rather than NativeWind + React Native Reusables
as first planned. The kit is about a dozen components; NativeWind adds a
Babel/Metro CSS transform that could not be exercised on a device from here,
and the owner's rule is functionality first.

The conventions are the web's: prefer removing UI; one obvious action is a
button (pinned to the bottom of the screen); everything occasional is behind
`⋯`; hide a control the reader's role cannot use.

## Before the apps ship

Two migrations are written and **not yet applied**:

- `20261006090200_mobile_removal_rpcs.sql` — sign-out unregistering a phone,
  deleting an announcement, removing a file from a draft, and a student
  deleting their account. Each contains a `DELETE`, which the Supabase
  connector will not run without a confirmation it cannot show in this editor:
  paste it into the SQL editor. Then regenerate the `packages/shared` types and
  replace the `rpcPending(...)` calls with `supabase.rpc(...)`
  (`apps/mobile/src/lib/rpcPending.ts` says how).
- `20261006090400_mobile_event_triggers_on.sql` — see **Push**, above.

## First build

```bash
cd apps/mobile
pnpm dev:student            # or dev:academy — Expo dev server
pnpm export:student         # JS-only bundle; catches resolution errors
```

1. `eas init` once per variant (`APP_VARIANT=student eas init`, then
   `academy`). The config is dynamic, so EAS prints each project id instead of
   writing it: paste them into `APPS.student.projectId` and
   `APPS.academy.projectId` in `app.config.ts`. Push tokens cannot be minted
   without one.
2. `eas build --profile student-preview --platform android` (an installable
   APK). `…-production` for the stores.
3. Android push needs an FCM key uploaded to EAS (`eas credentials`); iOS needs
   an Apple Developer account. EAS manages both.
4. Replace the placeholder icons in `apps/mobile/assets/images` — both apps
   currently share Expo's default artwork.
5. Fill in the two `.well-known` files (see **Deep links**).
6. Set each `app_min_versions.store_url` once the listings exist.

## Looking at a screen without a phone

`expo export --platform web --clear` builds either variant as a web page. With
a temporary stub that replaces `supabase.from` / `supabase.rpc` with canned
rows, every signed-in screen can be opened in headless Edge and screenshotted.
That is how both apps were checked before any device build — and it found two
real bugs (calls that exist on a phone and not on the web target, now guarded).
It does not exercise native modules: camera, files, calendar, push and PDF
sharing need a device.

## Not done

- **Biometric unlock, document scanning, offline notes, a QR student ID,
  acting on a notification without opening it** — proposed, not chosen.
- Assessment settings still have no UI anywhere.
- Announcements on the web.
- A scheduled sweep for orphaned objects in `submissions`.
- Staff are not pushed about payments or enrolment requests; the Today screen
  shows both.
