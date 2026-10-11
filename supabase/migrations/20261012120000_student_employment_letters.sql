-- ============================================================================
-- Employment letters: the Surat Pengesahan Tempoh Bekerja a student uploads.
--
-- The IC copy again (20261011110000_student_ic_copies.sql), for a second
-- document: the student holds it, the student sends it, the academy reads it.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Where the files live.
--
--    Private, PDF only, 10 MB — the IC copies' bucket, for the same reasons.
--    A letter from an employer is not the academy's to publish. No
--    storage.objects policies: only the `employment-letter` Edge Function
--    reaches it, with the service role.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('employment-letters', 'employment-letters', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. One letter per student.
--
--    `student_id` is the primary key: uploading again replaces. Its own table,
--    so that who may read it is a policy on the letter and not a carve-out
--    from the student record.
--
--    Clients never write it. The Edge Function does, with the service role,
--    after checking the caller is the student the record belongs to and
--    copying `academy_id` from the record itself.
-- ---------------------------------------------------------------------------
create table if not exists public.student_employment_letters (
  student_id  uuid primary key references public.students(id) on delete cascade,
  academy_id  uuid not null references public.academies(id) on delete cascade,
  file_path   text not null,
  file_name   text not null,
  size_bytes  bigint not null,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

comment on table public.student_employment_letters is
  'The PDF of a student''s Surat Pengesahan Tempoh Bekerja, one per student. Written only by the employment-letter Edge Function.';

create index if not exists student_employment_letters_academy_idx
  on public.student_employment_letters (academy_id);

alter table public.student_employment_letters enable row level security;

-- Admins, and the student whose letter it is. Not `app.is_staff`: a trainer
-- reads students and has no use for anybody's employment papers.
create policy "employment letters: admin or own read"
  on public.student_employment_letters for select to authenticated
  using (app.is_admin(academy_id) or app.owns_student(student_id));

revoke all on public.student_employment_letters from anon, authenticated;
grant select on public.student_employment_letters to authenticated;
