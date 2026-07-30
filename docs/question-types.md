# Assessment question types

Assessments carry six question types. Two are marked by a person, four by the
database. This note records the wire format and where the boundary sits.

## The types

| `question_type`   | UI                          | Marked by |
| ----------------- | --------------------------- | --------- |
| `essay`           | textarea                    | a person  |
| `short_text`      | single-line input           | a person  |
| `true_false`      | two radios                  | Postgres  |
| `single_choice`   | radio list                  | Postgres  |
| `multiple_choice` | checkbox list               | Postgres  |
| `matching`        | left column + a select each | Postgres  |

`essay` is what v1 shipped; every question written before this existed is one,
and nothing about it changed.

## Wire format

Two jsonb columns on `assessment_questions` carry everything type-specific.

`options` is **public** — it ships to the student inside the attempt payload.
`correct_answer` is **not**: `app.attempt_questions` projects an explicit column
list that omits it, and the `assessment_questions` SELECT policy is
`app.can_grade_assessment`, so a student has no path to it at all. Nothing may
put an answer key inside `options`.

| type                    | `options`                            | `correct_answer`      |
| ----------------------- | ------------------------------------ | --------------------- |
| `essay` / `short_text`  | `null`                               | `null`                |
| `true_false`            | `null`                               | `true`                |
| `single_choice`         | `{"choices":[{"id","text"}]}`        | `["optId"]`           |
| `multiple_choice`       | `{"choices":[{"id","text"}]}`        | `["optId","optId"]`   |
| `matching`              | `{"left":[…],"right":[…]}`           | `{"leftId":"rightId"}` |

**A student's answer is encoded exactly like `correct_answer`.** That is the
load-bearing decision: scoring becomes a comparison rather than a translation,
and because each encoding is a distinct JSON type (string / boolean / array /
object) the v1 answers already in the database — bare strings — keep working
with no migration. `attempt.answers` stays a flat map of question id → value.

The TypeScript mirror is `apps/web/src/lib/questions.ts`.

## Matching leaks through row order, so the server shuffles

An author writes matching questions as pairs: item on the left, its answer on
the right. Stored naively that means `right[i]` **is** the answer to `left[i]`,
and a student reading the network payload has the whole key — even though
`correct_answer` never left the server.

`app.shuffled_matching_options` reorders the right column by
`md5(question_id || option_id)` before it goes out. Deterministic, so the list
does not jump between reloads (answers reference option ids, so order is purely
presentational), and unrelated to the pairing.

## Auto-scoring

`app.question_fraction(type, correct, answer)` returns what fraction of a
question's marks an answer earned, or **NULL for "no machine can say"** — an
essay, or an objective question whose author never set a key. That NULL is what
keeps a half-authored quiz out of `graded`.

- choice questions are all-or-nothing on exact set equality (order and
  duplicates ignored);
- matching earns **partial credit** — four pairs, three right, 0.75. An
  all-or-nothing six-pair question is a cliff no learner can reason about.

`submit_attempt` applies it in two updates, deliberately:

1. `in_progress → submitted`, which is the transition `app.guard_attempt_write`
   derives `submitted_at` from. Jumping straight to `graded` would leave it null.
2. score + `max_score`, and `graded` **only if no question needs a human**.
   Otherwise the attempt stays `submitted` with the objective part banked, so
   the grader tops up instead of starting from zero.

The second update sets the `app.autograde_attempt` GUC, which
`app.guard_attempt_write` already understood before any of this existed: it
permits the grading columns to move and forces `graded_by` to null, so an
automatic mark is never attributed to a person.

`questionFraction()` in `lib/questions.ts` mirrors the SQL so the grader's
review can tick each answer without a round trip. **The server remains the only
thing that may write a score.** Keep the two in step.

## total_points

`assessments.total_points` was never maintained — it sat at its default `0`
while the learner landing page displayed it and `GradeAttemptPage` re-summed the
questions to get its own denominator. It is now kept by
`assessment_questions_sync_points`, an AFTER trigger, and backfilled. Clients
must not write it.

## Adding a seventh type

1. `alter type public.question_type add value` — **its own migration**; Postgres
   will not let the adding transaction reference the new label.
2. Teach `app.question_fraction` (or leave it NULL for manual marking) and its
   twin in `lib/questions.ts`.
3. Add the shapes to `QUESTION_TYPE_META` and the parsers in `lib/questions.ts`.
4. Add a branch to `QuestionEditor` (authoring), `AnswerInput` (student) and
   `AnswerReview` (grader).
5. Copy: `qtype.*` in the **common** namespace — three unrelated surfaces render
   the same label — and `qedit.*` in `assessments` for authoring-only strings.

`features/assessments/api.ts` needs no change: it carries `options` and
`correct_answer` as opaque jsonb on purpose.
