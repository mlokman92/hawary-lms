-- ============================================================================
-- A student may set the IC number on their own record, as well as the
-- organization and address.
--   188 of the 596 linked students have no IC on file, and the academy needs
--   one for every JPK registration. The person holding the card is the
--   student; until now only staff could type it.
--
--   A new function rather than a fourth argument on update_my_billing_details:
--   the Student app bundle published on 9 Oct calls that one with three, and
--   PostgREST resolves an RPC by its argument names. The old function stays
--   until no installed build calls it.
--
--   The number is normalised here, not trusted from the client. 576 of the 578
--   on file are twelve plain digits, so a MyKad number is stored that way —
--   spaces and dashes stripped — which is also what search and the CSV
--   import's duplicate check compare against. Anything carrying a letter is
--   read as a passport number. Twelve digits is checked because the one
--   malformed number on file today is a thirteen-digit typo.
-- ============================================================================

create or replace function public.update_my_student_details(
  _student_id   uuid,
  _ic_number    text,
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
  _ic  text := nullif(upper(regexp_replace(coalesce(_ic_number, ''), '[\s-]', '', 'g')), '');
  _org text := nullif(btrim(_organization), '');
  _adr text := nullif(btrim(_address), '');
  _row public.students;
begin
  if _uid is null then raise exception 'You must be signed in'; end if;
  if _ic ~ '^\d+$' then
    if char_length(_ic) <> 12 then
      raise exception 'An IC number has 12 digits';
    end if;
  elsif _ic !~ '^[A-Z0-9]{5,20}$' then
    raise exception 'That is not a valid IC or passport number';
  end if;
  if char_length(_org) > 200 then
    raise exception 'Organization is too long (200 characters at most)';
  end if;
  if char_length(_adr) > 500 then
    raise exception 'Address is too long (500 characters at most)';
  end if;

  update public.students
     set ic_number    = _ic,
         organization = _org,
         address      = _adr
   where id = _student_id
     and user_id = _uid
     and archived_at is null
  returning * into _row;

  if not found then raise exception 'Student record not found'; end if;
  return _row;
end;
$$;

revoke execute on function public.update_my_student_details(uuid, text, text, text) from public, anon;
grant  execute on function public.update_my_student_details(uuid, text, text, text) to authenticated;
