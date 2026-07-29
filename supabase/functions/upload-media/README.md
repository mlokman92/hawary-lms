# upload-media

Uploads an image into a public bucket under `<academy_id>/`, returning its public
URL. Used by the block editor (assessment / assignment instructions) and the
avatar uploader.

**`verify_jwt = true`** — caller must be signed-in **staff** (`admin` or
`trainer`) of the target academy.

## Why not upload straight from the browser

Direct `supabase.storage.upload()` writes to `storage.objects`, authorised by RLS
policies calling `app.is_staff(...)`. Those policies rejected *every* upload with
`new row violates row-level security policy` — for a valid staff user, on a
correct `<academy_id>/…` path, for both buckets, while every ordinary table query
against the same policies' helpers kept working. Uploading here instead removes
storage RLS from the path entirely: identity is verified explicitly and the write
is made with the service role.

## Contract

`POST` `multipart/form-data`:

| field | value |
| --- | --- |
| `file` | the image (≤ 10 MB, `image/{jpeg,png,webp,gif,avif,svg+xml}`) |
| `bucket` | `note-media` or `avatars` (allow-listed) |
| `academy_id` | target academy uuid |

Response `200`: `{ ok: true, path, url }`.

`403` carries `code: "not_staff"` plus `signed_in_as`, `requested_academy` and
`your_academies` — because the common failure is being signed into the wrong
account, and an opaque 403 is what made the original storage error so hard to
place.

## Security

- Identity comes from the JWT via a caller-scoped client, never from the body.
- Staff membership for the **target** academy is re-checked server-side with the
  service role before any write.
- The object key is always `<academy_id>/<uuid>.<ext>` — the caller never
  supplies a path, so it cannot write outside its tenant or overwrite (`upsert:
  false`).
- Content type must be an allow-listed image; size is capped at 10 MB.

Secrets: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (all
auto-injected).
