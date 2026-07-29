# Students learn, instructors grade

**Status:** implemented (migrations `20260727150000`–`20260727150300`, web `/learn/*` + `/grading/*`).

Web only. `apps/mobile` is still an unmodified Expo template; the RLS contract and
RPC signatures here are the spec it will implement.

## The two stories

1. A student signs in, reads published notes, submits assignments and takes
   assessments — at `/learn/*`.
2. An instructor signs in and marks that work — at `/courses/:id/grading`, scoped
   to the courses they are assigned to.

## Identity

`students` and `instructors` are per-academy CRM records with a **nullable**
`user_id`. A record becomes a login when `user_id` is set, which happens either
through `accept_invitation` or — new — through the admin-only
`link_student_account(_student_id, _email)` / `link_instructor_account(...)`.

Those RPCs exist because `accept_invitation` was the *only* writer of `user_id`,
which made every downstream feature untestable until transactional email was
configured, and left no repair path for a wrong link.

## What was broken and is now fixed

| Problem | Fix |
| --- | --- |
| `app.is_enrolled` lost its `academy_members` join in `20260725154144`, so suspending a member no longer revoked content | Restored, and extended to reject archived students and non-`active`/`trial` statuses |
| `assessment_attempts.student_id` / `assignment_submissions.student_id` still pointed at `profiles` | Repointed to `students` via a **composite** `(academy_id, student_id)` FK |
| Any trainer could rewrite a pending invitation's `role` to `admin` and accept it | Client DML on `academy_invitations` revoked; `revoke_invitation` / `resend_invitation` RPCs touch only status/token/expiry |
| Guards were `BEFORE UPDATE` only and policed grading columns alone, leaving `started_at` / `submitted_at` client-writable | Rewritten as `TG_OP`-aware `BEFORE INSERT OR UPDATE`; both timestamps are server-derived |
| `due_at` / `allow_late` / `max_attempts` / availability windows were stored but enforced nowhere | Enforced in the guards and in `start_attempt` |
| A student could revert a `returned` submission to draft and delete it | Student UPDATE/DELETE now require `status = 'draft'` |
| Read gate used `module_visible(module_id)` but the write gate used `is_enrolled(course_id)` — an unpublished module was a read boundary only | One predicate: `app.assessment_open` / `app.assignment_open` |
| Archiving an instructor left `academy_members.role = 'trainer'` forever | `app.sync_instructor_membership` demotes on unlink/archive/delete |

## The answer key never leaves the server

`assessment_questions` has **no** student policy — RLS is row-level, so any
permitted row would carry `correct_answer` with it. Students reach questions only
through `start_attempt` / `get_attempt`, which project an **explicit column
list** (`id, question_type, prompt, points, sort_order, options`). A later
`select *` refactor therefore cannot leak the key.

`submit_attempt` is the single place `correct_answer` may ever be read. For the
essay-only v1 it reads nothing. Objective auto-scoring is a change to that one
function body, using the `app.autograde_attempt` transaction-local GUC the guard
understands — needed because `SECURITY DEFINER` changes the *role*, not
`auth.uid()`, so a student calling `submit_attempt` is still a student to the
guard.

## Grading scope

`app.can_grade_course(_course_id)` = `is_admin(academy)` **OR**
(`is_staff(academy)` **AND** `teaches_course(course)`). Every attempts /
submissions / questions policy and both guards route through it, so scoping was
a single function-body change in `20260727150300`.

`app.is_staff` is untouched on purpose: 58 policies depend on it.

**Invariant this creates:** a trainer with no linked `instructors` row resolves
to zero gradable courses. The grading page says so explicitly, and admins keep
academy-wide reach as the escape hatch.

## Verified

Both suites ran as transactions that roll back, against real data:

- **Guards** — suspended member loses enrolment; archived student loses
  enrolment; a forged insert (`status='graded', grade=100, submitted_at` 5 days
  ago) lands as a null-graded draft; a backdated `submitted_at` is overwritten;
  a late submission is rejected until `allow_late` is set; a student cannot set
  `grade`.
- **RPCs** — `correct_answer` (and a sentinel `LEAKED` string) never appear in
  the `start_attempt` payload; a second call resumes rather than burning an
  attempt; a foreign question id is rejected; `submit_attempt` stamps server time
  and is idempotent; no writes after submission; `max_attempts` enforced;
  unpublishing the module closes the write path.

## Known gaps

- **Transactional email is not configured.** Sign-up confirmation still goes
  through Supabase's low-rate test mailer, and `send-invitation` needs `APP_URL`
  / `ALLOWED_ORIGINS` set or it builds links against a hard-coded default. The
  admin linking RPCs are the workaround, not the fix.
- **Assignment attachments** are not implemented — `attachment_url` is unused.
  It needs a **private** `submissions` bucket and a student branch in
  `upload-media` that resolves `student_id` server-side rather than trusting the
  body.
- **Expired invitations** are only flipped lazily inside `accept_invitation`;
  there is no scheduled sweep.
- **Student billing** (`/learn` invoice view) is out of scope.
- **`duration_minutes`** blocks saving once elapsed but does not auto-submit; an
  abandoned `in_progress` attempt still consumes one of `max_attempts`.
