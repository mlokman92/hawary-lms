-- ============================================================================
-- Employment letters are reviewed: an admin accepts one, or rejects it with a
-- note, and the student is told so they can send it again.
--
--   pending  — sent, nobody has looked yet. Every upload lands here, including
--              a replacement for a letter that was accepted or rejected.
--   accepted — an admin has looked and it will do.
--   rejected — an admin has looked and wants another; `review_note` says why.
--
-- The 104 letters already on file when this arrived are accepted: they were
-- taken as they came, and the academy did not want them back in a queue. The
-- few it does want again are rejected from the page like any other.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The review, on the letter's own row.
--
--    Added with a default of 'accepted' so every existing row takes it, then
--    the default becomes 'pending' for every upload after. `reviewed_at` and
--    `reviewed_by` stay null on the backfilled rows: nobody reviewed them.
-- ---------------------------------------------------------------------------
alter table public.student_employment_letters
  add column status text not null default 'accepted'
    constraint student_employment_letters_status_check
    check (status in ('pending', 'accepted', 'rejected')),
  add column review_note text,
  add column reviewed_at timestamptz,
  add column reviewed_by uuid references auth.users(id) on delete set null;

alter table public.student_employment_letters
  alter column status set default 'pending';

-- A rejection always says why: it is what the student reads.
alter table public.student_employment_letters
  add constraint student_employment_letters_rejection_note_check
  check (status <> 'rejected' or nullif(btrim(review_note), '') is not null);

create index if not exists student_employment_letters_reviewed_by_idx
  on public.student_employment_letters (reviewed_by);

comment on column public.student_employment_letters.status is
  'pending | accepted | rejected. A new file is always pending (trigger student_employment_letters_new_file).';
comment on column public.student_employment_letters.review_note is
  'Why the letter was rejected, as the student reads it. Null unless rejected.';

-- ---------------------------------------------------------------------------
-- 2. A new file is a new letter to review.
--
--    The employment-letter Edge Function replaces a letter by upserting the
--    row with the new path. Doing the reset here rather than in the function
--    means every way a file arrives — web, the Student app, a build of either
--    that predates this — puts it back in front of an admin.
-- ---------------------------------------------------------------------------
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
  return new;
end;
$$;

create trigger student_employment_letters_new_file
  before update on public.student_employment_letters
  for each row
  when (old.file_path is distinct from new.file_path)
  execute function app.employment_letter_new_file();

-- ---------------------------------------------------------------------------
-- 3. Accepting. An admin of the letter's academy; accepting a rejected one
--    takes the rejection back (the student keeps the notification).
-- ---------------------------------------------------------------------------
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
         reviewed_by = (select auth.uid())
   where l.student_id = _student_id
     and app.is_admin(l.academy_id);

  if not found then
    raise exception 'This employment letter is not available to you.';
  end if;
end;
$$;

revoke execute on function public.accept_employment_letter(uuid) from public, anon;
grant  execute on function public.accept_employment_letter(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Rejecting, with a note, and telling the student in the same transaction:
--    if the rejection is on the row, the notification is in their bell. The
--    file stays, so both sides can still see what was turned away until a new
--    one replaces it. Rejecting again changes the note and tells them again.
-- ---------------------------------------------------------------------------
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
         reviewed_by = (select auth.uid())
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

revoke execute on function public.reject_employment_letter(uuid, text) from public, anon;
grant  execute on function public.reject_employment_letter(uuid, text) to authenticated;
