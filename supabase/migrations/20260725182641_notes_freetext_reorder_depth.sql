-- ============================================================================
-- 0011 · Notes: free-text (markdown) content, drag-to-reorder, 3-level cap.
--   - content text: replaces the block editor for notes. Backfilled from the
--     jsonb `body` blocks (text kept as-is, images -> markdown image, youtube
--     -> its URL). `body` is retained (deprecated) so nothing is lost; only
--     the notes editor stops using it — assessments/assignments still use blocks.
--   - reorder_notes(): atomic sibling reorder + reparent, writing sort_order.
--   - depth/cycle trigger: a note tree is at most 3 levels deep and acyclic,
--     enforced in the DB (defence in depth behind the UI guard).
-- ============================================================================

-- 1. Free-text content -------------------------------------------------------
alter table public.notes add column content text not null default '';

update public.notes n
set content = coalesce((
  select string_agg(
    case b ->> 'type'
      when 'text'  then coalesce(b ->> 'text', '')
      when 'image' then
        '![' || coalesce(nullif(b ->> 'caption', ''), 'image') || '](' ||
        coalesce(b ->> 'url', '') || ')'
      when 'youtube' then coalesce(b ->> 'url', '')
      else ''
    end,
    E'\n\n' order by ord
  )
  from jsonb_array_elements(n.body) with ordinality as t(b, ord)
), '')
where jsonb_typeof(n.body) = 'array'
  and jsonb_array_length(n.body) > 0;

-- 2. Depth (<= 3) + acyclic enforcement -------------------------------------
-- SECURITY DEFINER so the ancestor/subtree walks see every row regardless of
-- the writer's RLS view; search_path is pinned. Runs on insert and whenever
-- parent_id is (re)assigned, so both new notes and moves are validated.
create or replace function app.notes_enforce_depth()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ancestors int;
  v_cycle     boolean;
  v_height    int;
  v_level     int;
begin
  if new.parent_id is null then
    v_ancestors := 0;
    v_cycle := false;
  else
    with recursive anc(id, depth) as (
      select new.parent_id, 1
      union all
      select n.parent_id, a.depth + 1
      from public.notes n
      join anc a on n.id = a.id
      where n.parent_id is not null and a.depth < 20
    )
    select count(*), coalesce(bool_or(id = new.id), false)
    into v_ancestors, v_cycle
    from anc;
  end if;

  if v_cycle or new.parent_id = new.id then
    raise exception 'A note cannot be nested under itself';
  end if;

  -- Level of NEW (root = 1).
  v_level := v_ancestors + 1;

  -- Height of NEW's existing subtree (leaf = 1). On insert this is 1; on a
  -- move it accounts for descendants that ride along with the dragged note.
  with recursive sub(id, depth) as (
    select new.id, 1
    union all
    select n.id, s.depth + 1
    from public.notes n
    join sub s on n.parent_id = s.id
    where s.depth < 20 and n.id <> new.id
  )
  select max(depth) into v_height from sub;

  if v_level + coalesce(v_height, 1) - 1 > 3 then
    raise exception 'Notes can be nested at most 3 levels deep';
  end if;

  return new;
end;
$$;

create trigger notes_enforce_depth
  before insert or update of parent_id on public.notes
  for each row execute function app.notes_enforce_depth();

-- 3. Atomic reorder + reparent ----------------------------------------------
-- Sets sort_order (0-based, by array position) and parent_id for every id in
-- p_ordered_ids -- i.e. the destination parent's full, ordered child list.
-- SECURITY INVOKER: the caller's RLS ("notes: staff update") applies and the
-- depth trigger above still fires. Course scoping guards cross-course writes;
-- the (course_id, parent_id) self-FK guards a cross-course parent.
create or replace function public.reorder_notes(
  p_course_id   uuid,
  p_parent_id   uuid,
  p_ordered_ids uuid[]
) returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  update public.notes n
  set parent_id  = p_parent_id,
      sort_order = (arr.ord - 1)::int
  from unnest(p_ordered_ids) with ordinality as arr(id, ord)
  where n.id = arr.id
    and n.course_id = p_course_id;
end;
$$;

revoke all on function public.reorder_notes(uuid, uuid, uuid[]) from public;
grant execute on function public.reorder_notes(uuid, uuid, uuid[]) to authenticated;
