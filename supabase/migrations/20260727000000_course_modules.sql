-- ============================================================================
-- 0020 · Course modules — one hierarchy for all course content.
--   - course_modules sits between a course and its notes / assessments /
--     assignments. Every content row belongs to exactly one module
--     (module_id NOT NULL): there is no course-level "loose" content.
--   - Notes lose their folder tree (parent_id + the 3-level depth trigger).
--     A module IS the grouping now, so a note is a flat item under a module.
--     Existing nested notes are flattened in pre-order so reading order
--     survives the change.
--   - reorder_module_items() replaces reorder_notes(): one RPC reorders — and
--     moves between modules — notes, assessments or assignments.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Modules
-- ---------------------------------------------------------------------------
create table public.course_modules (
  id           uuid primary key default gen_random_uuid(),
  academy_id   uuid not null references public.academies(id) on delete cascade,
  course_id    uuid not null,
  title        text not null,
  description  text,
  sort_order   integer not null default 0,
  -- Opt-out, not opt-in: a new module is visible and the item's own
  -- is_published still governs, so nothing is hidden unexpectedly.
  is_published boolean not null default true,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (academy_id, id),
  -- Composite target: a module's content must live in the same course.
  unique (course_id, id),
  foreign key (academy_id, course_id)
    references public.courses (academy_id, id) on delete cascade
);
create index course_modules_course_id_idx  on public.course_modules (course_id);
create index course_modules_academy_id_idx on public.course_modules (academy_id);
create index course_modules_created_by_idx on public.course_modules (created_by);

create trigger set_updated_at before update on public.course_modules
  for each row execute function app.set_updated_at();

-- Backfill: one module per course that already has content. Courses with no
-- content get none — they start empty and prompt for a first module.
insert into public.course_modules (academy_id, course_id, title, sort_order)
select c.academy_id, c.id, 'Module 1', 0
from public.courses c
where exists (select 1 from public.notes       n where n.course_id = c.id)
   or exists (select 1 from public.assessments a where a.course_id = c.id)
   or exists (select 1 from public.assignments a where a.course_id = c.id);

-- ---------------------------------------------------------------------------
-- 2. Notes: flatten the tree
-- ---------------------------------------------------------------------------
-- Re-sequence sort_order as a depth-first pre-order walk before parent_id is
-- dropped, so a nested note keeps its position relative to its former parent.
-- The int[] path compares element-wise, and a parent's path is a prefix of its
-- children's — so ordering by it yields pre-order. created_at/id break ties
-- between siblings that share a sort_order.
with recursive walk as (
  select n.id, n.course_id, n.created_at,
         array[n.sort_order] as path
  from public.notes n
  where n.parent_id is null
  union all
  select c.id, c.course_id, c.created_at,
         w.path || c.sort_order
  from public.notes c
  join walk w on c.parent_id = w.id
)
update public.notes n
set sort_order = r.rn
from (
  select id,
         (row_number() over (
            partition by course_id order by path, created_at, id
          ))::int - 1 as rn
  from walk
) r
where n.id = r.id
  and n.sort_order is distinct from r.rn;

drop trigger if exists notes_enforce_depth on public.notes;
drop function if exists app.notes_enforce_depth();
alter table public.notes drop constraint if exists notes_course_id_parent_id_fkey;
alter table public.notes drop column parent_id;
drop function if exists public.reorder_notes(uuid, uuid, uuid[]);

-- ---------------------------------------------------------------------------
-- 3. Re-parent content onto modules
-- ---------------------------------------------------------------------------
-- Each content table gets module_id (nullable → backfilled → NOT NULL) and a
-- composite FK that pins the module to the row's own course. Exactly one
-- module per course exists at this point, so the backfill join is unambiguous.

-- notes ---------------------------------------------------------------------
alter table public.notes add column module_id uuid;
update public.notes n
set module_id = m.id
from public.course_modules m
where m.course_id = n.course_id;
alter table public.notes alter column module_id set not null;
alter table public.notes
  add constraint notes_course_id_module_id_fkey
  foreign key (course_id, module_id)
  references public.course_modules (course_id, id) on delete cascade;
create index notes_module_id_idx on public.notes (module_id);

-- assessments ---------------------------------------------------------------
alter table public.assessments add column module_id uuid;
alter table public.assessments add column sort_order integer not null default 0;
update public.assessments a
set module_id = m.id
from public.course_modules m
where m.course_id = a.course_id;
alter table public.assessments alter column module_id set not null;
alter table public.assessments
  add constraint assessments_course_id_module_id_fkey
  foreign key (course_id, module_id)
  references public.course_modules (course_id, id) on delete cascade;
create index assessments_module_id_idx on public.assessments (module_id);

update public.assessments a
set sort_order = r.rn
from (
  select id,
         (row_number() over (partition by module_id order by created_at, id))::int - 1 as rn
  from public.assessments
) r
where a.id = r.id;

-- assignments ---------------------------------------------------------------
alter table public.assignments add column module_id uuid;
alter table public.assignments add column sort_order integer not null default 0;
update public.assignments a
set module_id = m.id
from public.course_modules m
where m.course_id = a.course_id;
alter table public.assignments alter column module_id set not null;
alter table public.assignments
  add constraint assignments_course_id_module_id_fkey
  foreign key (course_id, module_id)
  references public.course_modules (course_id, id) on delete cascade;
create index assignments_module_id_idx on public.assignments (module_id);

update public.assignments a
set sort_order = r.rn
from (
  select id,
         (row_number() over (partition by module_id order by created_at, id))::int - 1 as rn
  from public.assignments
) r
where a.id = r.id;

-- ---------------------------------------------------------------------------
-- 4. Visibility helper + RLS
-- ---------------------------------------------------------------------------
-- A module is visible to a student when it is published and they are enrolled
-- in its course. Content now gates on this instead of app.is_enrolled directly,
-- so unpublishing a module hides everything under it.
create or replace function app.module_visible(_module_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.course_modules m
    where m.id = _module_id
      and m.is_published
      and app.is_enrolled(m.course_id)
  );
$$;

alter table public.course_modules enable row level security;

create policy "course_modules: staff all, enrolled students see published"
  on public.course_modules for select to authenticated
  using (app.is_staff(academy_id) or (is_published and app.is_enrolled(course_id)));
create policy "course_modules: staff insert" on public.course_modules for insert to authenticated
  with check (app.is_staff(academy_id));
create policy "course_modules: staff update" on public.course_modules for update to authenticated
  using (app.is_staff(academy_id)) with check (app.is_staff(academy_id));
create policy "course_modules: staff delete" on public.course_modules for delete to authenticated
  using (app.is_staff(academy_id));

-- Repoint the student SELECT branch of each content table at the module.
drop policy "notes: staff all, enrolled students see published" on public.notes;
create policy "notes: staff all, enrolled students see published"
  on public.notes for select to authenticated
  using (app.is_staff(academy_id) or (is_published and app.module_visible(module_id)));

drop policy "assessments: staff all, enrolled students see published" on public.assessments;
create policy "assessments: staff all, enrolled students see published"
  on public.assessments for select to authenticated
  using (app.is_staff(academy_id) or (is_published and app.module_visible(module_id)));

drop policy "assignments: staff all, enrolled students see published" on public.assignments;
create policy "assignments: staff all, enrolled students see published"
  on public.assignments for select to authenticated
  using (app.is_staff(academy_id) or (is_published and app.module_visible(module_id)));

-- ---------------------------------------------------------------------------
-- 5. Reordering
-- ---------------------------------------------------------------------------
-- Both RPCs are SECURITY INVOKER: the caller's RLS ("… staff update") applies,
-- and the composite (course_id, module_id) FK rejects a move into a module that
-- belongs to another course.

create or replace function public.reorder_course_modules(
  p_course_id   uuid,
  p_ordered_ids uuid[]
) returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  update public.course_modules m
  set sort_order = (arr.ord - 1)::int
  from unnest(p_ordered_ids) with ordinality as arr(id, ord)
  where m.id = arr.id
    and m.course_id = p_course_id;
end;
$$;

-- p_ordered_ids is the destination module's full, ordered item list for that
-- kind (the moved item included); each row gets module_id = p_module_id and
-- sort_order by array position.
create or replace function public.reorder_module_items(
  p_module_id   uuid,
  p_kind        text,
  p_ordered_ids uuid[]
) returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if p_kind = 'note' then
    update public.notes n
    set module_id = p_module_id, sort_order = (arr.ord - 1)::int
    from unnest(p_ordered_ids) with ordinality as arr(id, ord)
    where n.id = arr.id;
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
$$;

revoke all on function public.reorder_course_modules(uuid, uuid[]) from public;
grant execute on function public.reorder_course_modules(uuid, uuid[]) to authenticated;
revoke all on function public.reorder_module_items(uuid, text, uuid[]) from public;
grant execute on function public.reorder_module_items(uuid, text, uuid[]) to authenticated;
