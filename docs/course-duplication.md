# Duplicating a course

An academy runs the same syllabus again for a new intake. `duplicate_course`
deep-copies the teaching material and leaves the people behind.

## There is no cohort entity

The intake lives in the **title** — "Short Course Cohort 2" — because that is
how academies already name them. No `cohort` column, table or enum was added,
and none should be added by accident later: the duplicate dialog asks for a
title precisely so the naming stays the academy's business.

## What crosses, and what does not

| Copied                                       | Not copied                     |
| -------------------------------------------- | ------------------------------ |
| modules (order, published state)             | enrolments                     |
| notes                                        | students                       |
| materials (pointing at the same file)        | assessment attempts            |
| assessments + questions + **answer keys**    | assignment submissions         |
| assignments                                  | invoices and payments          |
| `course_instructors` assignments             | `code` — see below             |

Two fields are asked for rather than derived:

- **title** — two courses with the same name are indistinguishable in every list
  in the app.
- **code** — `courses_academy_code_key` is `UNIQUE (academy_id, lower(code))
  WHERE code IS NOT NULL`, so copying it verbatim is a constraint violation.
  (The first version of this function did exactly that and failed on the first
  real course it was pointed at.) The copy starts with **no code**: a blank one
  is visibly missing and gets filled in, whereas an auto-generated
  `ACCA-1-copy` is a made-up identifier that looks deliberate. The RPC checks
  for a clash up front so the caller gets a sentence, not a raw `23505`.

Three things are reset rather than copied:

- **status** → `draft`. A copy is not ready to be shown or sold, whatever the
  original was.
- **`available_from` / `available_until`** on assessments, and **`due_at`** on
  assignments → `NULL`. An intake that inherits last year's window opens already
  closed, and every assignment in it is already overdue. A blank date is
  visibly missing; a stale one is silently wrong.
- **`total_points`** is not copied — the `assessment_questions_sync_points`
  trigger recomputes it as the questions land.

## Who may do it

`app.can_grade_course(_course_id)` — academy admin, or a trainer assigned to the
course through `course_instructors`. Deliberately *stricter* than the
`app.is_staff` that governs creating a course from scratch, because this one
carries another course's question bank (including `correct_answer`) with it.

SECURITY DEFINER, so the check is made once, explicitly, at the top: the body
writes `assessment_questions`, whose INSERT policy is
`app.can_grade_assessment`, and RLS is not available to lean on inside.

## The id-mapping trick

Children have to land in the *copy's* modules, so the insert and the mapping
need to agree on ids that do not exist yet:

```sql
with src as materialized (
  select m.*, gen_random_uuid() as new_id
  from public.course_modules m where m.course_id = _course_id
),
ins as ( insert into public.course_modules (id, …) select s.new_id, … from src s returning 1 )
select jsonb_object_agg(s.id::text, s.new_id::text) into v_modules from src s;
```

`materialized` is load-bearing. `gen_random_uuid()` is volatile, and without it
the planner may inline `src` into both referencing branches and generate a
different uuid for each — the insert would write one id and the map would record
another. The same shape runs again for assessments, so questions can find their
new parent.

## Materials share their file

A copied material row points at the same storage object as the original. See
[course-materials.md](./course-materials.md) — the consequence is that deleting
a material must not delete its object.
