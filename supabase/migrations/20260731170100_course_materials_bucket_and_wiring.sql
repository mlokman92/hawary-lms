-- 1. The bucket. PRIVATE, unlike avatars/note-media: those are decoration,
-- this is the product. No storage.objects policies are added — nothing reaches
-- this bucket except the two Edge Functions holding the service role, which is
-- the same shape as upload-media and sidesteps the storage-RLS behaviour
-- documented in supabase/functions/upload-media/README.md.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'course-materials',
  'course-materials',
  false,
  52428800, -- 50 MB; slide decks are bigger than the 10 MB image cap
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

-- 2. Materials join the reorder/move machinery as a fourth kind.
create or replace function public.reorder_module_items(
  p_module_id uuid,
  p_kind text,
  p_ordered_ids uuid[]
)
returns void
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  if p_kind = 'note' then
    update public.notes n
    set module_id = p_module_id, sort_order = (arr.ord - 1)::int
    from unnest(p_ordered_ids) with ordinality as arr(id, ord)
    where n.id = arr.id;
  elsif p_kind = 'material' then
    update public.course_materials m
    set module_id = p_module_id, sort_order = (arr.ord - 1)::int
    from unnest(p_ordered_ids) with ordinality as arr(id, ord)
    where m.id = arr.id;
  elsif p_kind = 'assessment' then
    update public.assessments a
    set module_id = p_module_id, sort_order = (arr.ord - 1)::int
    from unnest(p_ordered_ids) with ordinality as arr(id, ord)
    where a.id = arr.id;
  elsif p_kind = 'assignment' then
    update public.assignments a
    set module_id = p_module_id, sort_order = (arr.ord - 1)::int
    from unnest(p_ordered_ids) with ordinality as arr(id, ord)
    where a.id = arr.id;
  else
    raise exception 'Unknown item kind: %', p_kind;
  end if;
end;
$function$;

-- 3. May the caller download this file?
--
-- The Edge Function that mints the signed URL runs with the service role, so it
-- has no RLS to lean on. This is the single place that decides, and it is the
-- same rule the SELECT policy uses — staff of the tenant, or a student for whom
-- the row is published and its module visible. Zero rows means "not yours",
-- which is indistinguishable from "does not exist" and should stay that way.
create or replace function public.material_download(_material_id uuid)
returns table (file_path text, file_name text, mime_type text)
language sql
stable security definer
set search_path to ''
as $function$
  select m.file_path, m.file_name, m.mime_type
  from public.course_materials m
  where m.id = _material_id
    and (
      app.is_staff(m.academy_id)
      or (m.is_published and app.module_visible(m.module_id))
    );
$function$;

revoke all on function public.material_download(uuid) from public, anon;
grant execute on function public.material_download(uuid) to authenticated;
