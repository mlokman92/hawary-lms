-- ============================================================================
-- 0008 · Notes as a per-course folder tree with block content.
--   - parent_id makes notes hierarchical (folders / subnotes), scoped to the
--     same course via a self composite FK.
--   - body jsonb holds an ordered array of content blocks (text / image /
--     youtube). Replaces the old free-text content + single attachment_url.
--   - note-media storage bucket for images inside notes.
-- ============================================================================

alter table public.notes drop column content;
alter table public.notes drop column attachment_url;
alter table public.notes add column parent_id uuid;
alter table public.notes add column body jsonb not null default '[]'::jsonb;

-- Unique target so a note's parent must live in the same course.
alter table public.notes add constraint notes_course_id_id_key unique (course_id, id);
alter table public.notes
  add constraint notes_course_id_parent_id_fkey
  foreign key (course_id, parent_id)
  references public.notes (course_id, id) on delete cascade;
create index notes_parent_id_idx on public.notes (parent_id);

-- Media for images embedded in notes (public read; staff-scoped writes by
-- <academy_id>/... path, same pattern as avatars).
insert into storage.buckets (id, name, public)
  values ('note-media', 'note-media', true)
  on conflict (id) do nothing;

create policy "note-media: staff insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'note-media'
    and app.is_staff(nullif((storage.foldername(name))[1], '')::uuid)
  );
create policy "note-media: staff update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'note-media'
    and app.is_staff(nullif((storage.foldername(name))[1], '')::uuid)
  )
  with check (
    bucket_id = 'note-media'
    and app.is_staff(nullif((storage.foldername(name))[1], '')::uuid)
  );
create policy "note-media: staff delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'note-media'
    and app.is_staff(nullif((storage.foldername(name))[1], '')::uuid)
  );
