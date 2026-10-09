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
  `features/assignments/SubmissionFiles.tsx` and does not attach.
- **The Student app attaches from the files app only** (Oct 2026, the owner's
  call): the Attach button opens the document picker directly, for a hand-in
  and for an LPKC report alike. A photo already on the phone can be picked
  there. The Academy app still offers camera, photos and files.
- **How a picked file is uploaded** (`lib/storage.ts → formFile`): through
  `expo-file-system`'s `File`, never as React Native's `{ uri, name, type }`
  descriptor. From SDK 57 the global `fetch` is Expo's own, and it refuses that
  descriptor before the request leaves the phone — every upload from the apps
  failed with "Upload failed" until this was changed. The picked name is kept
  client-side, because the filename is percent-encoded in transit.

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

## Updates without a store release

`expo-updates` + EAS Update, from version **1.0.1** on. A change that is only
JavaScript — a screen, a fix, a string — is published with `eas update` and
reaches the installed apps without a store review. A change to native code (a
new package with native code, a permission, an icon, an SDK upgrade) still needs
a build.

- **Which builds an update reaches:** those on the same **channel** and with the
  same **runtime version**. The channel comes from the build profile in
  `eas.json` (`production`, `preview`, `development`). The runtime version is
  the app `version` in `app.config.ts` (`runtimeVersion: { policy: 'appVersion' }`).
  So **raise `version` for every store release that changes native code** —
  otherwise an update written for the new binary is offered to the old one,
  which cannot run it.
- **The 1.0.0 builds cannot be updated this way.** They were built without the
  package. Once 1.0.1 is in the stores, raising `app_min_versions` to `1.0.1`
  (see **Forced update**) is what moves people off them.
- **Publishing** — one command per app, because each app is its own EAS project:

  ```bash
  pnpm --filter mobile update:student "What changed"
  pnpm --filter mobile update:academy "What changed"
  # a third argument publishes to the internal builds instead:
  pnpm --filter mobile update:student "What changed" preview
  ```

  `scripts/ota.mjs` rather than a bare `eas update`, for two reasons it explains
  itself: `APP_VARIANT` picks the project (forgetting it publishes the Student
  bundle), and from SDK 55 `eas update --environment` ignores local `.env`
  files — the Supabase URL and key live on the build profiles in `eas.json`, and
  a bundle exported without them throws on its first line on every phone that
  receives it. The script reads them from the same profile the build used.
- **In the app** (`shell/ota.ts`): the update downloads in the background at
  launch, and again whenever the app is brought to the front. When it is ready
  the app asks once — *New update available. Restart the app to see the
  changes.* — **Restart** or **Later**. Later means the next cold start, without
  being asked again.
- The package is loaded behind a `try`: on a binary without its native half,
  importing it throws while the module loads, and that would take the app down.
- Nothing happens in development or on the web preview.

**Try the first update on a `preview` build before `production`.** A bad update
reaches everybody on the channel within minutes; `eas update:rollback` undoes
one.

## UI

A small StyleSheet kit in `apps/mobile/src/ui` (light, dark, follow the phone),
rather than NativeWind + React Native Reusables as first planned: NativeWind
adds a Babel/Metro CSS transform that could not be exercised on a device from
here.

**It is the web's theme carried to a phone** (`apps/web/src/index.css`): the
same zinc neutrals, the same **teal** as the one brand colour, the same
typeface, **Figtree**. `ui/theme.tsx` holds the hex equivalents of the web's
oklch tokens — change the two together. What the phone adds is shape: a tinted
canvas with white cards on it, large radii, a soft shadow in light mode and a
hairline in dark (`elevation()`), and tinted fills where the web draws
outlines. The first version was plain black-on-white with system type; the
owner called it dated (2026-10-07) and this replaced it.

Three rules that are easy to break:

- **A weight is a font family, never `fontWeight`.** Figtree is one file per
  weight in `apps/mobile/assets/fonts` — local files under the OFL, not a
  package, so there is nothing native to link and nothing fetched at launch —
  loaded in `AppRoot` before the first screen. Android cannot find the bold cut
  of a custom font from a weight number and smears a fake one. Use `<T>`
  (which turns an inline `fontWeight` into the right family) or `font(700)`.
- **Two things sit side by side only if both are short in both languages.**
  Malay runs about a third longer. The kit absorbs some of it — a button's
  label shrinks a little before it is cut, a stat tile's figure steps down for
  a sum of money, the tab labels are sized for five tabs on a 360-wide phone —
  but two long buttons in a row will truncate. Stack them, or make them rows.
- **A list you pick from flows down.** The slot picker
  (`features/appointments/SlotPicker`) is day cards stacked, the times inside
  the open day, and the caller's form (`footer`) directly under the chosen
  time: one column, one direction of travel. It began as a sideways strip of
  days; the owner asked for it to flow down. Both apps use the one picker.

**Student tabs:** Dashboard · My courses · **LPKC** · Appointments · More. LPKC
took the middle tab from My work at the owner's request (2026-10-07); My work
is the first row under More, and is still where the dashboard's "All work"
leads.

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
2. `eas build --profile student-production --platform android` (an `.aab`;
   `…-preview` gives an installable APK). **Android builds start without a
   prompt** — EAS makes the keystore itself. **The first iOS build of each app
   has to be run by a person in a terminal**: it signs in to Apple (with 2FA)
   to make the certificate and profile, and `--non-interactive` refuses.
   The profile also names the update channel the binary listens to (see
   **Updates without a store release**).

   **What a build uploads is decided by the root `.easignore`**, not by
   `.gitignore` — once that file exists the CLI reads nothing else, so it
   repeats every `.gitignore` in the repo. It is there because on Windows the
   CLI applies only the *root* `.gitignore` and skips the ones in subfolders:
   builds were uploading `apps/landing/.next` and the promo film's caches, a
   714 MB archive that took seven minutes to compress. It is now about 5 MB.
   A new ignore rule goes in both files.
3. Push credentials — see **Push credentials**, below.
4. Icons are in place — see **Icons**, below.
5. Fill in the two `.well-known` files (see **Deep links**).
6. Set each `app_min_versions.store_url` once the listings exist.

## Icons

Both icons are the academy's symbol, the arch and dot ([brand.md](brand.md)).
**Student is the symbol on white; Academy is the same symbol on teal.** Files:
`apps/mobile/assets/images/<variant>/` (`icon.png`, `adaptive-foreground.png`,
`adaptive-background.png`), chosen by `APP_VARIANT` in `app.config.ts`, all
rendered from `brand/icon-student.svg` and `brand/icon-academy.svg`.

Why light against dark: it is a difference of lightness, not hue, so it survives
greyscale and red-green colour-blindness. A marker (a band, a glyph) under an
identical emblem was tried and lost: it is a few pixels at home-screen size.

- **No monochrome layer** on Android: the apps differ only in their ground, so a
  themed single-colour icon would make them identical.
- `notification-icon.png` is the symbol's small-size cut in white on nothing.
  Android draws the status-bar icon from alpha alone; the app icon there shows
  as a grey square.
- On Android the art is drawn at 72% of its iOS size, so the arch's feet stay
  inside the circle a launcher crops to.

## Push credentials

The server side (`send-push` → Expo's push service) needs nothing per app. What
each *app* needs is the platform's permission to be pushed to:

- **iOS** — an APNs key. It belongs to the Apple team, not to an app, so the
  one already on the owner's Expo account is reused: answer yes to "set up push
  notifications" and "reuse this key" during the first interactive iOS build.
- **Android** — Firebase, in two halves, and both are needed:
  1. `apps/mobile/google-services.json`, listing a client for
     `my.hawary.student` and one for `my.hawary.academy` (one file, both
     apps). It is **baked into the build**: `app.config.ts` picks it up when the
     file exists, and an `.aab` built without it installs and runs but never
     gets a push token. It is not a secret and is committed.
  2. The Firebase project's **service-account key**, uploaded to *each* EAS
     project (`eas credentials` → Android → Google Service Account → FCM V1).
     This is what lets Expo's push service send. It is a secret and stays out
     of the repo.

  Both apps can live in a Firebase project that already serves another app:
  add two Android apps to it and the same service-account key covers them.

## The web preview

`pnpm web:student` (http://localhost:8191) and `pnpm web:academy`
(http://localhost:8192) run either app in a browser against the real backend,
in a phone-width column. Sign in with a real account.

It is a preview, not a product. The pieces that only exist on a phone have
browser stand-ins so the flows can still be walked through: alerts and
confirmations use the browser's own, the date picker is `<input type="date">`,
a note renders in an iframe, a PDF opens the print dialog, "share" copies to the
clipboard, and uploads send the browser's File. Push, the camera and the
calendar do nothing there.

Not the default Expo port: 8081 belongs to another project on the owner's
machine.

## Looking at a screen without a phone

`expo export --platform web --clear` builds either variant as a web page. With
a temporary stub that replaces `supabase.from` / `supabase.rpc` with canned
rows, every signed-in screen can be opened in headless Edge and screenshotted.
That is how both apps were checked before any device build — and it found two
real bugs (calls that exist on a phone and not on the web target, now guarded).
It does not exercise native modules: camera, files, calendar, push and PDF
sharing need a device.

Look at every screen in **Malay and in dark mode** as well: that is where the
cut-off labels and the invisible borders are. And give the export its own Metro
cache (`TEMP`/`TMP` pointed at a scratch folder) when a preview server is
running — `--clear` otherwise empties the cache that server is using.

## Not done

- **Biometric unlock, document scanning, offline notes, a QR student ID,
  acting on a notification without opening it** — proposed, not chosen.
- Assessment settings still have no UI anywhere.
- Announcements on the web.
- A scheduled sweep for orphaned objects in `submissions`.
- Staff are not pushed about payments or enrolment requests; the Today screen
  shows both.
