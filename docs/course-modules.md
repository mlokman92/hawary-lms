# Course modules — unifying notes, assessments & assignments

**Status:** implemented (migration `20260727000000_course_modules.sql`).

## The problem

Notes, assessments and assignments were already course-scoped in the database
(`course_id NOT NULL`, RLS via `app.is_enrolled(course_id)`) but were surfaced as
three sibling nav destinations, each a course `<Select>` in the header over a
table. Nothing showed a course as a whole, and notes carried a second,
overlapping hierarchy of their own — a 3-level folder tree per course.

## The decision

One hierarchy: **course → module → content.**

`course_modules` sits between a course and its content. `module_id` is
**NOT NULL** on `notes`, `assessments` and `assignments`: there is no
course-level loose content, and no "no module" option in any picker. A course
with no modules shows an empty state prompting for the first one.

Parentless content was considered and rejected. The trade accepted:
adding a note requires a module to exist first. What it buys: one code path
everywhere (a single `modules → items` loop, including for the future mobile
student app), unambiguous ordering, and no junk-drawer bucket that collects
everything nobody filed.

Notes lose their tree. A module *is* the grouping, so a second nesting level
inside it was redundant. Existing nested notes were flattened in **pre-order**
(depth-first) so reading order survived: a child note keeps its position
immediately after its former parent.

## Shape

```
courses
  └── course_modules            (title, description, sort_order, is_published)
        ├── notes               (module_id NOT NULL, sort_order)
        ├── assessments         (module_id NOT NULL, sort_order)
        └── assignments         (module_id NOT NULL, sort_order)
```

Each content table carries **both** `course_id` and `module_id`, with a
composite FK `(course_id, module_id) → course_modules (course_id, id)`. That one
constraint pins a module to the row's own course, so moving an item into a
module belonging to a different course is rejected by the database — the same
tenant-composite pattern the rest of the schema uses.

`sort_order` is per **(module, kind)**: a module's notes are ordered
independently of its assessments. The UI renders three labelled sections inside
each module card, which keeps "move up / move down" unambiguous.

## Visibility

`app.module_visible(_module_id)` (SECURITY DEFINER) = the module is published
**and** the caller is enrolled in its course. Content's student SELECT branch is
now `is_published AND app.module_visible(module_id)` instead of
`app.is_enrolled(course_id)`, so hiding a module hides everything under it.

`course_modules.is_published` defaults to **true** — opt-out, not opt-in — so a
new module never silently swallows the content someone just published in it.

## RPCs

Both are SECURITY INVOKER (the caller's staff-update RLS applies) with a pinned
`search_path`:

- `reorder_course_modules(p_course_id, p_ordered_ids)` — writes `sort_order` by
  array position.
- `reorder_module_items(p_module_id, p_kind, p_ordered_ids)` — `p_kind` is
  `note` / `assessment` / `assignment`; writes `module_id` **and** `sort_order`,
  so it handles both reordering within a module and moving between modules.
  An unrecognised kind raises.

`reorder_notes(uuid, uuid, uuid[])` and `app.notes_enforce_depth()` were dropped
with the tree.

## Migration notes

- One `Module 1` was created per course that already had content; courses
  without content got none.
- `notes.body` (deprecated jsonb blocks) is still retained and unused.
- `assessment_attempts` / `assignment_submissions` still reference `profiles`
  rather than `students` — unchanged here, still deferred.
