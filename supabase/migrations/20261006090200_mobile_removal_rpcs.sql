-- The RPCs that take something away, split from 20261006090100 because each
-- contains a DELETE: unregistering a phone on sign-out, deleting an
-- announcement, removing a file from a draft hand-in, and a student deleting
-- their own account. Plus the explicit write revoke on app_min_versions (RLS
-- already denies it; this says so).

-- Signing out. Scoped to the caller, so a token lifted from elsewhere removes
-- nothing.
create or replace function public.unregister_push_device(_token text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_devices
  where token = _token and user_id = (select auth.uid());
$$;

-- The author, or an admin. The notifications stay: they are a record that
-- something was said, and they lead to the list, where it is no longer shown.
create or replace function public.delete_announcement(_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.announcements;
begin
  select * into v_row from public.announcements where id = _id;
  if v_row.id is null
     or not (app.is_admin(v_row.academy_id)
             or (v_row.created_by = (select auth.uid()) and app.is_staff(v_row.academy_id))) then
    raise exception 'Announcement not found';
  end if;
  delete from public.announcements where id = _id;
end;
$$;

-- Removes the row only. The object is left, like a deleted course material:
-- an unreferenced key in a private bucket is unreachable.
create or replace function public.remove_submission_file(_file_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub public.assignment_submissions;
begin
  select s.* into v_sub
  from public.assignment_submission_files f
  join public.assignment_submissions s on s.id = f.submission_id
  where f.id = _file_id;
  if v_sub.id is null or not app.owns_student(v_sub.student_id) then
    raise exception 'File not found';
  end if;
  if v_sub.status <> 'draft' then
    raise exception 'This work has already been handed in';
  end if;
  delete from public.assignment_submission_files where id = _file_id;
end;
$$;

-- A student deleting their own account, from the Student app's profile screen.
-- Apple requires this of any app that lets people create an account.
--
-- What goes is the ACCOUNT: the sign-in, the profile, the memberships, the
-- notifications and the registered phones all cascade from auth.users. What
-- stays is the academy's own record — `students.user_id` is ON DELETE SET
-- NULL, so the student row, its enrolments, invoices and payments remain as
-- an unlinked record, exactly as it was before anybody claimed it. The academy
-- needs those for its books, and the same email can claim the record again.
--
-- Staff are refused. An admin or trainer leaving is a Director's decision
-- (docs/single-owner.md), and the last Director deleting themselves would
-- leave a branch nobody can administer.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'You must be signed in'; end if;
  if exists (
    select 1 from public.academy_members m
    where m.user_id = v_uid and m.role in ('admin', 'trainer')
  ) then
    raise exception 'Staff accounts are removed by a Director';
  end if;
  delete from auth.users where id = v_uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

revoke all on function public.unregister_push_device(text) from public, anon;
revoke all on function public.delete_announcement(uuid) from public, anon;
revoke all on function public.remove_submission_file(uuid) from public, anon;
grant execute on function public.unregister_push_device(text) to authenticated;
grant execute on function public.delete_announcement(uuid) to authenticated;
grant execute on function public.remove_submission_file(uuid) to authenticated;

revoke insert, update, delete on public.app_min_versions from anon, authenticated;
