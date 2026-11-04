-- ============================================================================
-- The employment letter roster says who accepted or rejected a letter, and
-- when. `reviewed_by` and `reviewed_at` were already written; the name is a
-- snapshot beside them, as `payment_receipts.confirmed_by_name` is: the page
-- reads it without a join to an account, and it still reads right after the
-- admin renames themselves or leaves.
--
-- The letters accepted when the review arrived (2026-10-22) have no reviewer
-- and keep none: nobody reviewed them.
-- ============================================================================

alter table public.student_employment_letters
  add column if not exists reviewed_by_name text;

comment on column public.student_employment_letters.reviewed_by_name is
  'The reviewing admin''s name (or email) when they accepted or rejected. Snapshot; null until reviewed.';

-- The one letter reviewed so far.
update public.student_employment_letters l
   set reviewed_by_name = coalesce(
         (select nullif(btrim(pf.full_name), '')
            from public.profiles pf where pf.id = l.reviewed_by),
         (select u.email from auth.users u where u.id = l.reviewed_by))
 where l.reviewed_by is not null
   and l.reviewed_by_name is null;

-- The reviewer's name as it reads now: the profile's, else the sign-in email.
create or replace function app.reviewer_name()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select nullif(btrim(pf.full_name), '')
       from public.profiles pf where pf.id = (select auth.uid())),
    (select auth.jwt() ->> 'email'));
$$;

revoke execute on function app.reviewer_name() from public, anon;
grant  execute on function app.reviewer_name() to authenticated;

-- A new file is a new letter to review: the name goes with the rest.
create or replace function app.employment_letter_new_file()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.status := 'pending';
  new.review_note := null;
  new.reviewed_at := null;
  new.reviewed_by := null;
  new.reviewed_by_name := null;
  return new;
end;
$$;

create or replace function public.accept_employment_letter(_student_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'You must be signed in';
  end if;

  update public.student_employment_letters l
     set status = 'accepted',
         review_note = null,
         reviewed_at = now(),
         reviewed_by = (select auth.uid()),
         reviewed_by_name = app.reviewer_name()
   where l.student_id = _student_id
     and app.is_admin(l.academy_id);

  if not found then
    raise exception 'This employment letter is not available to you.';
  end if;
end;
$$;

create or replace function public.reject_employment_letter(
  _student_id uuid,
  _note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  _note_clean text := nullif(btrim(coalesce(_note, '')), '');
  _academy uuid;
  _user uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'You must be signed in';
  end if;
  if _note_clean is null then
    raise exception 'Say why the letter is rejected.';
  end if;
  if length(_note_clean) > 1000 then
    raise exception 'The note is longer than 1000 characters.';
  end if;

  update public.student_employment_letters l
     set status = 'rejected',
         review_note = _note_clean,
         reviewed_at = now(),
         reviewed_by = (select auth.uid()),
         reviewed_by_name = app.reviewer_name()
   where l.student_id = _student_id
     and app.is_admin(l.academy_id)
  returning l.academy_id into _academy;

  if _academy is null then
    raise exception 'This employment letter is not available to you.';
  end if;

  select s.user_id into _user from public.students s where s.id = _student_id;

  -- A record nobody has claimed has no inbox; app.notify passes it over.
  perform app.notify(
    _academy,
    _user,
    'employment_letter_rejected',
    jsonb_build_object('student_id', _student_id, 'note', _note_clean)
  );
end;
$$;
