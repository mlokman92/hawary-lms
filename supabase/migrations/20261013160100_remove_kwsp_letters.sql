-- ============================================================================
-- Taking a KWSP letter back.
--
-- A bulk create is one click over a whole course, so its undo has to exist.
-- Nothing is lost by it: the letter is drawn on demand and the row holds only
-- the date it was prepared. Rows of an academy the caller does not administer
-- are passed over — this cannot reach them — and an archived student's row may
-- be removed like any other. Returns how many went.
-- ============================================================================
create or replace function public.remove_kwsp_letters(_student_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  _removed integer;
begin
  if (select auth.uid()) is null then
    raise exception 'You must be signed in';
  end if;

  delete from public.student_kwsp_letters k
   where k.student_id = any(_student_ids)
     and app.is_admin(k.academy_id);
  get diagnostics _removed = row_count;

  return _removed;
end;
$$;

revoke execute on function public.remove_kwsp_letters(uuid[]) from public, anon;
grant  execute on function public.remove_kwsp_letters(uuid[]) to authenticated;
