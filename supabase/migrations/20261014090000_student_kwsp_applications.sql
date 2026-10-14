-- ============================================================================
-- The KWSP application: a student asks the academy for the KWSP letter.
--
-- Until now the letter was the academy's alone — an admin decided who had one
-- (see docs/documents.md). A student now asks for it from their own page, and
-- an admin reviews who has asked on /documents/kwsp-letters and creates the
-- letter, which is the answer. Creating one unasked works as it did.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. One row per student who has applied.
--
--    A table of its own rather than a state on `student_kwsp_letters`: a row
--    there keeps meaning "the academy has prepared one", so create_kwsp_letters
--    and remove_kwsp_letters do exactly what they did — for the build already
--    deployed as well. An application with no letter is waiting; with one, it
--    has been answered. Taking a letter back leaves the application waiting
--    again.
--
--    Read by an admin and by the student whose it is, as an IC copy is. Clients
--    never write it: `apply_for_kwsp_letter` does, for the caller's own record.
-- ---------------------------------------------------------------------------
create table if not exists public.student_kwsp_applications (
  student_id uuid primary key references public.students(id) on delete cascade,
  academy_id uuid not null references public.academies(id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.student_kwsp_applications is
  'The students who have asked for a KWSP letter, one row each. Waiting while the student has no row in student_kwsp_letters. Clients have no DML: apply_for_kwsp_letter / remove_kwsp_applications.';

create index if not exists student_kwsp_applications_academy_idx
  on public.student_kwsp_applications (academy_id);

alter table public.student_kwsp_applications enable row level security;

create policy "kwsp applications: admin or own read"
  on public.student_kwsp_applications for select to authenticated
  using (app.is_admin(academy_id) or app.owns_student(student_id));

revoke all on public.student_kwsp_applications from anon, authenticated;
grant select on public.student_kwsp_applications to authenticated;

-- ---------------------------------------------------------------------------
-- 2. The student may now see that their letter has been prepared.
--
--    It was admin-only while the student had no part in it. Having applied,
--    they need the answer. The row says only that a letter exists and since
--    when; the letter itself is still drawn, printed and signed by the academy.
-- ---------------------------------------------------------------------------
alter policy "kwsp letters: admin read"
  on public.student_kwsp_letters
  using (app.is_admin(academy_id) or app.owns_student(student_id));

alter policy "kwsp letters: admin read"
  on public.student_kwsp_letters
  rename to "kwsp letters: admin or own read";

comment on table public.student_kwsp_letters is
  'The students the academy has prepared a KWSP letter for, one row each. Read by an admin and the student; clients have no DML: create_kwsp_letters / remove_kwsp_letters.';

-- ---------------------------------------------------------------------------
-- 3. Applying.
--
--    The caller must be the account the student record is linked to, as in
--    sign_offer_letter. Staff do not apply for a student — an admin who wants
--    one to have a letter creates it.
--
--    An IC number is asked for because the letter is two lines of it: without
--    one there is nothing for the admin to prepare. Applying twice keeps the
--    first date. Returns the moment on record.
-- ---------------------------------------------------------------------------
create or replace function public.apply_for_kwsp_letter(_student_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  _uid     uuid := (select auth.uid());
  _academy uuid;
  _ic      text;
  _at      timestamptz;
begin
  if _uid is null then raise exception 'You must be signed in'; end if;

  select s.academy_id, s.ic_number into _academy, _ic
    from public.students s
   where s.id = _student_id
     and s.user_id = _uid
     and s.archived_at is null;
  if not found then raise exception 'Student record not found'; end if;

  if nullif(btrim(_ic), '') is null then
    raise exception 'Add your IC number before applying';
  end if;

  insert into public.student_kwsp_applications (student_id, academy_id)
  values (_student_id, _academy)
  on conflict (student_id) do nothing;

  select a.created_at into _at
    from public.student_kwsp_applications a
   where a.student_id = _student_id;

  return _at;
end;
$$;

revoke execute on function public.apply_for_kwsp_letter(uuid) from public, anon;
grant  execute on function public.apply_for_kwsp_letter(uuid) to authenticated;
