-- ============================================================================
-- IC copies: the scan of a student's identity card, uploaded by the student.
--
-- The academy needs one for every JPK registration and the student is the one
-- holding the card — the same reasoning that let them type their own IC number.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Where the files live.
--
--    Private: an identity card is the most sensitive document the academy
--    holds about anyone. Read only through a signed URL minted by the
--    `ic-copy` Edge Function. PDF only, because that is what was asked for and
--    one format is one thing to open; 10 MB, the cap a receipt has.
--
--    No storage.objects policies, like every other private bucket here: only
--    the Edge Function reaches it, with the service role.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ic-copies', 'ic-copies', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. One copy per student.
--
--    `student_id` is the primary key: uploading again replaces. A table of its
--    own rather than columns on `students`, so that who may read a scan is a
--    policy on the scan and not a carve-out from the student record — a
--    trainer reads students, and has no use for anybody's identity card.
--
--    Clients never write it. The Edge Function does, with the service role,
--    after checking the caller is the student the record belongs to and
--    copying `academy_id` from the record itself.
-- ---------------------------------------------------------------------------
create table if not exists public.student_ic_copies (
  student_id  uuid primary key references public.students(id) on delete cascade,
  academy_id  uuid not null references public.academies(id) on delete cascade,
  file_path   text not null,
  file_name   text not null,
  size_bytes  bigint not null,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

comment on table public.student_ic_copies is
  'The PDF copy of a student''s identity card, one per student. Written only by the ic-copy Edge Function.';

create index if not exists student_ic_copies_academy_idx
  on public.student_ic_copies (academy_id);

alter table public.student_ic_copies enable row level security;

-- Admins, and the student whose card it is. Not `app.is_staff`: see above.
create policy "ic copies: admin or own read"
  on public.student_ic_copies for select to authenticated
  using (app.is_admin(academy_id) or app.owns_student(student_id));

revoke all on public.student_ic_copies from anon, authenticated;
grant select on public.student_ic_copies to authenticated;
