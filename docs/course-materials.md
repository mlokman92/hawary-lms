# Course materials

The fourth thing a module can hold, beside notes, assessments and assignments:
a file to download — slides, a PDF, a worksheet.

## The row is like a note; the file is not

`course_materials` is shaped exactly like `notes` — same FK chain, same four
policies — so it inherits the tenancy and visibility rules already proven there.
Deleting a module cascades. A student sees a row only when
`is_published AND app.module_visible(module_id)`.

What differs is the file. It lives in the **private** `course-materials` bucket:

| bucket             | public | contents | key                                       |
| ------------------ | ------ | -------- | ----------------------------------------- |
| `avatars`          | yes    | images   | `<academy_id>/<uuid>.<ext>`               |
| `note-media`       | yes    | images   | `<academy_id>/<uuid>.<ext>`               |
| `course-materials` | **no** | docs     | `<academy_id>/<course_id>/<uuid>.<ext>`   |

The first two hold decoration. This one holds the thing the academy is selling,
and in a public bucket the URL *is* the product — one leaked link and the
enrolment is optional. So the bucket is private and every read is signed.

## Two functions, no storage RLS

Neither path touches `storage.objects` policies. That is deliberate: the direct
route was tried and failed for uploads (see
`supabase/functions/upload-media/README.md`), and repeating it here would repeat
the debugging.

**Upload — `upload-media`** (extended, not replaced). It already verified the
JWT and re-checked staff membership for the target academy before writing with
the service role; materials add a bucket branch, a 50 MB cap instead of 10 MB, a
document MIME allow-list instead of an image one, and `course_id` in the key.
Materials get no URL back, only the path — there is nothing public to return.

**Download — `material-url`** (new). The entitlement decision is made in the
*database*, not in the function: the caller-scoped client (their JWT) calls
`public.material_download`, whose SECURITY DEFINER body applies exactly the rule
the SELECT policy applies. Zero rows means "not yours", indistinguishable from
"does not exist", which is the right answer to both. Only then does the
service-role client sign, and only the path the database handed back — the
request body carries an **id, never a path**, so no caller can ask for an
arbitrary object. The URL lives 60 seconds; it is followed immediately, and a
longer life only widens the window in which a copied link still works.

Client entry points are `uploadMaterial` and `materialUrl` in `lib/storage.ts`.

## Ordering and moving

`material` is a fourth `ItemKind`, so `reorder_module_items(module, kind, ids)`
grew a branch and the course page's move/reorder menus work unchanged.

## Two rows can share one file

`duplicate_course` copies material rows pointing at the **same** storage object.
One slide deck used by two intakes is one PDF; duplicating bytes per copy would
grow storage without bound.

The consequence, which is not visible from a row: **deleting a material must not
delete its object.** `useDeleteMaterial` deletes the row only. Objects are
therefore orphaned when the last row goes, and nothing sweeps them yet. A sweep
that does will have to check for other rows on the same `file_path` —
`course_materials_file_path_idx` exists for exactly that query.

## Not done yet

- No orphan sweep (above).
- No in-app preview: a click opens the signed URL in a new tab and lets the
  browser decide. Good enough for PDFs and images; a `.pptx` downloads.
- Materials are not in the academy-wide library pages (`/assessments`,
  `/assignments`) — those exist because work has deadlines. A material does not,
  so it is reachable through its module.
- `size_bytes` and `mime_type` are recorded from the upload response and never
  re-verified against the object.
