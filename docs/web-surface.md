# The web surface — shells, nav and screens

**Status:** implemented (`apps/web`). What each screen is *for*, and the
decisions that are not visible in the code.

## Two shells, one component

`components/shell/{SidebarShell,ShellSidebar}` is shared by `AppLayout` (staff,
`/*`) and `LearnLayout` (learner, `/learn/*`). The learner gets the same shadcn
sidebar, `UserMenu` (identity + theme + language) and academy switcher — with
**no** "Add academy", because creating one makes the caller staff, which evicts
them from `/learn`.

**A component under `components/shell/` may not call `useAcademy()`.** It is
mounted in both trees, so there is no ambient answer for it to read. Which
academy the shell is scoped to is a **prop**: `AppLayout` passes the
back-office's, `LearnLayout` passes `useStudentAcademy()`'s. Ignoring this is
what made the learner's notification bell dead from the day it shipped — see
[notifications.md](notifications.md).

Shared page vocabulary lives in `components/patterns/*` (PageHeader, StatTile,
StatCard, FilterStatCard, EmptyState, QueryState, ListCard, BackLink) plus
`lib/{tone,format}.ts`. `personName(name, email)` in `lib/format.ts` prefers an
address to the word "Unnamed".

## Auth and onboarding

Email/password sign in/up; forgot → `/reset-password`, which is the recovery
link's own landing page (`lib/recoveryLink.ts` snapshots the URL params before
the Supabase client consumes them). Self-serve academy creation makes the
creator an admin. Academy switcher, light/dark theme.

**`/onboarding` is not a landing page.** An existing member who reaches it is
returned to `useLandingTarget()`; only `?new=1` — sent by the switcher's "Add
academy" — still opens the founder form. Without that guard an accepted invitee
who pressed Back got "Create your academy", and one student founded a second
academy named after her own school, which then outranked her student membership
on every sign-in.

## Staff sections

Courses · Students · Instructors · Appointments — each a list + add/edit,
staff-gated, academy-scoped by RLS. A trainer's nav is those four plus
Dashboard; admins also get **Payments** (+ its Log child), Incentive, Members
and Settings — see [money-is-admin-only.md](money-is-admin-only.md).

The **header search** (`HeaderSearch` + `features/search`) finds students and
instructors across the active academy by name, email, phone, IC or record
number, and jumps straight to the record.

## Course authoring

A course is a card grid (`/courses`) showing per-course counts; opening one
(`/courses/:id`) lists its **modules as an accordion** (`type="multiple"`, open
set kept per course in `sessionStorage`, first module open by default), each
holding notes, materials, assessments and assignments. Editors stay routable at
`/notes/:id`, `/assessments/:id`, `/assignments/:id`.

`course_modules` is the only hierarchy — see
[course-modules.md](course-modules.md).

Reorder/move via `reorder_course_modules` + `reorder_module_items(module, kind,
ordered_ids)`. Items are **drag-sortable** (`features/courses/ModuleItemList.tsx`,
dnd-kit): by handle, not whole-row — the row also holds a link, a switch and a
menu — and within one (module, kind) section only, since that is what the RPC
takes and a note cannot be dropped into "Assessments". Crossing modules stays
on the ⋯ menu, which still works when the target module is collapsed.
`useReorderModuleItems` is optimistic or the row springs back mid-drag.

Publishing is an inline `PublishSwitch` on the row (also optimistic); one
`useTogglePublished` covers all four kinds.

`/courses/:id` carries **no Grading button** and no enrollment controls — it is
for building the course, so *New module* is the only button and
Edit/Duplicate/Billing sit in a `⋯` menu.

## The sub-nav under Courses means different things per shell

`NavItem.children` → `SidebarMenuSub`, always open.

**Staff:** `/assessments` and `/assignments` are the **grading queues** —
`GradingQueuePage` over `useAcademyQueue`, academy-wide because RLS
(`app.can_grade_*`) already narrows a trainer to their assigned courses.
Awaiting/Marked/All tiles, search, and a `?course=` filter.
`/courses/:id/grading` (`CourseGradingPage`) still resolves for older links.
`/enrollments` is the third child — the whole enrollment surface, not a queue
(see [course-enrollment.md](course-enrollment.md)).

Authoring stays inside a course: there is no academy-wide content inventory,
and `LibraryPage`/`features/library` were removed when this replaced them.

**Learner:** `/learn/assessments` and `/learn/assignments` are their own lists
of work (`LearnTaskListPage`, off the existing dashboard query).

Notes and materials stay module-only on both sides.

## Two dashboards

`pages/DashboardRoute.tsx` forks `/` on role. `Dashboard.tsx` is untouched and
still serves admins.

This is a **component boundary, not an `isAdmin &&`**: hooks cannot be skipped
conditionally, so branching inside the 1027-line file would still *fire*
`useInvoices` for a trainer however many cards were hidden.
`pages/TrainerDashboard.tsx` must import nothing from
`@/features/{payments,settings/api,dashboard/api}` and never `formatMYR` —
**that grep is the regression test.**

The trainer dashboard asks *what is in front of me*:

- **Needs closing** — past sessions still `booked`. Self-hiding, and the only
  place they can surface, since `/appointments` is a week grid.
- **Your week** — own sessions, 7 days, **grouped by day**: bookings cluster on
  the two days an academy runs, so a flat list is one Tuesday and Thursday
  never appears.
- **Two marking cards** — two nav destinations, so a merged card could only
  link to one. They show how long work has **waited**, not when it arrived.
- **Reports to check** — its own card, not a third marking queue, because
  marking ends in a grade and a report goes back and forth until it is right
  ([report-checks.md](report-checks.md)).

No stat-tile row, no chart. Marking queues carry no course filter
(`app.can_grade_*` already narrows them), while `.eq('instructor_id', …)` on
the session queries is a **display** narrowing, not a boundary.

Both marking cards separate "nothing waiting" from **"you are not assigned to a
course"**, which is the real case: `course_instructors` is nearly empty, and
`useMyGradableCourses` returns `linked: true` there so the existing
no-instructor-record message does not fire.

The **learner dashboard** (`pages/learn/LearnDashboardPage.tsx`) carries a
sessions card beside a reports one, cut on **`ends_at` not `starts_at`** (a
session being taught right now is still today's). `Dashboard.tsx` (admin) has
no appointments card on purpose — it answers "how is the academy doing", and a
diary is not that.

## Learner surface

`/learn/*` (`StudentShell`): enrolled courses → published modules → notes /
assignments / assessments, plus **Billing** (own invoices, read-only) and **My
profile**.

Students submit assignments through RLS; they take assessments **only** through
the SECURITY DEFINER RPCs `start_attempt` / `get_attempt` /
`save_attempt_answers` / `submit_attempt`, which project an explicit column
list so `assessment_questions.correct_answer` never reaches a client.
`assessment_questions` has no student policy at all.

## Members and roles

`/members`, admin-only: the staff roster. Students are excluded — they are an
academy record, managed on their own page, where their app access can also be
suspended.

Two independent axes, **never merged into one ladder**: **access** is
`academy_members.role` (admin/trainer) and **teaching** is a linked
`instructors` record, so one account can be an admin *and* an instructor.
**Director** is the academy creator (`academies.created_by`) — a name for the
founder, not a fourth role; `Membership.isCreator` carries it to the client.

Contact details come from the admin-only `list_academy_staff` RPC, which joins
`auth.users` for the email: `profiles` is readable by every co-member, so an
email column there would be an address book for students.

There is **no `/members/:id`** — a row opens the person's own record
(`memberRecordPath`: instructor, else student). `/members` is where a
membership is managed (role, suspend/restore, attach/detach the instructor
record); the instructor page carries only a **"Make admin" checkbox**, the one
control worth having next to the person. `unlink_instructor_account` is the
inverse of `link_instructor_account`, which preserves an `admin` role on
purpose.

## CSV import

`features/import`: bulk creation for students and instructors, one spec-driven
dialog (`ImportSpec` → `ImportDialog`) plus a hand-rolled `lib/csv.ts` (BOM,
CRLF, quoted commas/newlines, `;`/tab delimiters — no dependency).

Headers match loosely against per-field aliases in EN and BM, so a spreadsheet
with `Nama Penuh` / `No. Telefon` lands without a mapping step. Parsing,
validation and duplicate detection (`email`, `ic_number`, against the loaded
list *and* earlier rows) all happen in the browser, and a row with a problem is
listed with its line number and excluded rather than dropped silently.

Inserts are chunked 100 at a time and report how many landed if a later chunk
fails. Importing also **invites** the batch — see
[account-claiming.md](account-claiming.md).

## Own profile

`/profile` (staff) and `/learn/profile` (learner) edit the same `profiles` row
via `features/profile/api.ts`. Both are reached by clicking your name in the
sidebar footer (`UserMenu`'s `profileTo` prop).

## Block content

Shared editor (`lib/blocks.ts` + `components/BlocksEditor.tsx`) — text / image /
youtube — used by assessments and assignments. Notes use the rich-text
`content` column instead.

## Storage

Public `avatars` + `note-media` buckets, keyed `<academy_id>/<uuid>.<ext>`;
private `course-materials` ([course-materials.md](course-materials.md)) and
`student-reports` ([report-checks.md](report-checks.md)).

Uploads go through the **`upload-media` Edge Function** (`lib/storage.ts` →
`uploadPublicImage`), which verifies the caller's JWT, re-checks staff
membership for the target academy, and writes with the service role. Direct
browser `storage.upload()` is **not** used: the storage RLS policies calling
`app.is_staff` rejected every upload even for valid staff on a correct path —
see `supabase/functions/upload-media/README.md`.

`student-reports` is the only bucket `upload-media` accepts a **non-staff**
write to.
