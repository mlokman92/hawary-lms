-- ============================================================================
-- Turning a KWSP application away.
--
-- An admin answers an application by creating the letter. This is the other
-- answer: the application is taken off the list, and the student reads "not
-- applied" again and may ask once more. Rows of an academy the caller does not
-- administer are passed over, as in remove_kwsp_letters. Returns how many went.
-- ============================================================================
create or replace function public.remove_kwsp_applications(_student_ids uuid[])
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

  delete from public.student_kwsp_applications a
   where a.student_id = any(_student_ids)
     and app.is_admin(a.academy_id);
  get diagnostics _removed = row_count;

  return _removed;
end;
$$;

revoke execute on function public.remove_kwsp_applications(uuid[]) from public, anon;
grant  execute on function public.remove_kwsp_applications(uuid[]) to authenticated;
