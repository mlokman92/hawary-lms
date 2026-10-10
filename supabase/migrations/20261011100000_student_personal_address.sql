-- ============================================================================
-- A student has a personal address, and may write it themselves.
--
--   `students.address` is already taken: it is the block the invoice and the
--   receipt print under "Bill to", beneath the organization, and for nearly
--   every record that has one it sits beside an organization. Where the
--   student lives is a different fact, so it gets its own column rather than a
--   second meaning for that one. It prints on neither document.
--
--   Staff write it through "students: staff update" like every other column.
--   The student writes it through update_my_student_details, which gains a
--   fifth argument — as an OVERLOAD, not a replacement: the Student app builds
--   already installed call the four-argument function, PostgREST resolves an
--   RPC by its argument names, and neither signature has a default, so a call
--   can only ever match one of them. The four-argument function leaves
--   personal_address alone. Drop it, and update_my_billing_details, once no
--   installed build is older than the one carrying this field.
-- ============================================================================

-- No length check on the column, like `address` beside it: the 500-character
-- cap is the function's, for the one writer that is not staff.
alter table public.students
  add column personal_address text;

create or replace function public.update_my_student_details(
  _student_id       uuid,
  _ic_number        text,
  _organization     text,
  _address          text,
  _personal_address text
)
returns public.students
language plpgsql
security definer
set search_path = ''
as $$
declare
  _uid  uuid := (select auth.uid());
  _ic   text := nullif(upper(regexp_replace(coalesce(_ic_number, ''), '[\s-]', '', 'g')), '');
  _org  text := nullif(btrim(_organization), '');
  _adr  text := nullif(btrim(_address), '');
  _padr text := nullif(btrim(_personal_address), '');
  _row  public.students;
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
  if char_length(_padr) > 500 then
    raise exception 'Personal address is too long (500 characters at most)';
  end if;

  update public.students
     set ic_number        = _ic,
         organization     = _org,
         address          = _adr,
         personal_address = _padr
   where id = _student_id
     and user_id = _uid
     and archived_at is null
  returning * into _row;

  if not found then raise exception 'Student record not found'; end if;
  return _row;
end;
$$;

revoke execute on function public.update_my_student_details(uuid, text, text, text, text) from public, anon;
grant  execute on function public.update_my_student_details(uuid, text, text, text, text) to authenticated;
