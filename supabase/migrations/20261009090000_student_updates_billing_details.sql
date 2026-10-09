-- ============================================================================
-- A student may set the organization and address on their own record.
--   Both print in the "Bill to" block of the invoice and the receipt, and a
--   receipt is what a student hands to an employer or a sponsor to be
--   reimbursed — so the person who knows what it must say is the student, and
--   until now only staff could type it (`students: staff update`).
--
--   An RPC rather than a student UPDATE policy: RLS is row-level, so a policy
--   that let a student update their own row would let them rewrite `status`,
--   `student_no`, `email` and `user_id` along with it. This writes exactly two
--   columns, on exactly the caller's own live record.
--
--   `full_name` stays out on purpose. It is what ToyyibPay locks onto the FPX
--   page and what a certificate will carry; a wrong name is corrected by staff
--   (docs/account-claiming.md, "Fill blanks, never rename").
-- ============================================================================

create or replace function public.update_my_billing_details(
  _student_id   uuid,
  _organization text,
  _address      text
)
returns public.students
language plpgsql
security definer
set search_path = ''
as $$
declare
  _uid uuid := (select auth.uid());
  _org text := nullif(btrim(_organization), '');
  _adr text := nullif(btrim(_address), '');
  _row public.students;
begin
  if _uid is null then raise exception 'You must be signed in'; end if;
  if char_length(_org) > 200 then
    raise exception 'Organization is too long (200 characters at most)';
  end if;
  if char_length(_adr) > 500 then
    raise exception 'Address is too long (500 characters at most)';
  end if;

  update public.students
     set organization = _org,
         address      = _adr
   where id = _student_id
     and user_id = _uid
     and archived_at is null
  returning * into _row;

  if not found then raise exception 'Student record not found'; end if;
  return _row;
end;
$$;

revoke execute on function public.update_my_billing_details(uuid, text, text) from public, anon;
grant  execute on function public.update_my_billing_details(uuid, text, text) to authenticated;
