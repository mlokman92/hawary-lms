-- The bucket a student's report lives in. PRIVATE, for a stronger reason than
-- course-materials was: a course material is the academy's product, but a
-- report is the student's own unfinished work, and 690 of them in a public
-- bucket is a directory of other people's draft theses.
--
-- No storage.objects policies are added. Nothing reaches this bucket except the
-- two Edge Functions holding the service role — upload-media writes, report-url
-- signs — which is the same shape as course-materials and sidesteps the
-- storage-RLS behaviour documented in supabase/functions/upload-media/README.md.
--
-- The key is <academy_id>/<uploader user id>/<uuid>.<ext>. The middle segment is
-- what app.assert_own_upload checks before a path may be attached to a thread:
-- the client hands the path to submit_report, so the path is client input.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'student-reports',
  'student-reports',
  false,
  52428800, -- 50 MB, the same cap as course material: a portfolio is not small
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/csv',
    'application/zip',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
