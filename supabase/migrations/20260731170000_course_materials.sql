-- Materials: the fourth thing a module can hold. Slides, PDFs, worksheets —
-- a file to download rather than something to read or answer in the app.
--
-- Shaped exactly like `notes` (same FK chain, same four policies) so it inherits
-- the tenancy and visibility rules already proven there: deleting a module
-- cascades, and a student sees a row only when it is published AND its module
-- is visible.
--
-- The FILE is the part that differs. It lives in a PRIVATE bucket: course
-- material is the thing the academy is selling, and in a public bucket the URL
-- is the product. Rows carry the object path; a URL is minted on demand, and
-- only for someone entitled to it — see supabase/functions/material-url.
-- Full note: docs/course-materials.md

create table if not exists public.course_materials (
  id          uuid primary key default gen_random_uuid(),
  academy_id  uuid not null,
  course_id   uuid not null,
  module_id   uuid not null,
  title       text not null,
  -- Storage object key: <academy_id>/<course_id>/<uuid>.<ext>. Written only by
  -- the upload Edge Function, which builds it from verified identity.
  file_path   text not null,
  -- What the browser should call it on download. The stored object is named by
  -- uuid so a title can be edited without touching storage.
  file_name   text not null,
  mime_type   text,
  size_bytes  bigint,
  is_published boolean not null default false,
  sort_order  integer not null default 0,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint course_materials_academy_id_fkey
    foreign key (academy_id) references public.academies(id) on delete cascade,
  constraint course_materials_academy_id_course_id_fkey
    foreign key (academy_id, course_id)
    references public.courses(academy_id, id) on delete cascade,
  constraint course_materials_course_id_module_id_fkey
    foreign key (course_id, module_id)
    references public.course_modules(course_id, id) on delete cascade,
  constraint course_materials_size_check check (size_bytes is null or size_bytes >= 0)
);

create index if not exists course_materials_academy_id_idx
  on public.course_materials (academy_id);
create index if not exists course_materials_course_id_idx
  on public.course_materials (course_id);
create index if not exists course_materials_module_id_idx
  on public.course_materials (module_id);
create index if not exists course_materials_created_by_idx
  on public.course_materials (created_by);
-- One row per stored object is NOT enforced: duplicate_course deliberately
-- points a copy at the same file (see docs/course-materials.md).
create index if not exists course_materials_file_path_idx
  on public.course_materials (file_path);

alter table public.course_materials enable row level security;

create policy "materials: staff all, enrolled students see published"
  on public.course_materials for select to authenticated
  using (
    app.is_staff(academy_id)
    or (is_published and app.module_visible(module_id))
  );

create policy "materials: staff insert"
  on public.course_materials for insert to authenticated
  with check (app.is_staff(academy_id));

create policy "materials: staff update"
  on public.course_materials for update to authenticated
  using (app.is_staff(academy_id))
  with check (app.is_staff(academy_id));

create policy "materials: staff delete"
  on public.course_materials for delete to authenticated
  using (app.is_staff(academy_id));

drop trigger if exists set_updated_at on public.course_materials;
create trigger set_updated_at
  before update on public.course_materials
  for each row execute function app.set_updated_at();
