-- ============================================================================
-- Withdrawing a KWSP application: the student takes back their own request.
--
-- Only while it is waiting. Once the academy has created the letter the
-- application has been answered, and there is nothing left to withdraw — the
-- row stays, so taking the letter back still leaves it waiting, as before
-- (see docs/documents.md). The caller must be the account the student record
-- is linked to, as in apply_for_kwsp_letter. Withdrawing loses the date;
-- applying again starts a new one. Returns whether a row went.
-- ============================================================================
create or replace function public.withdraw_kwsp_application(_student_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  _uid uuid := (select auth.uid());
begin
  if _uid is null then raise exception 'You must be signed in'; end if;

  if not exists (
    select 1 from public.students s
     where s.id = _student_id and s.user_id = _uid
  ) then
    raise exception 'Student record not found';
  end if;

  if exists (
    select 1 from public.student_kwsp_letters l
     where l.student_id = _student_id
  ) then
    raise exception 'Your KWSP letter has already been prepared';
  end if;

  delete from public.student_kwsp_applications a
   where a.student_id = _student_id;

  return found;
end;
$$;

revoke execute on function public.withdraw_kwsp_application(uuid) from public, anon;
grant  execute on function public.withdraw_kwsp_application(uuid) to authenticated;
