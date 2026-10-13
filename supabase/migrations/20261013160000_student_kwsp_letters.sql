-- ============================================================================
-- The KWSP letter: which students the academy has prepared one for.
--
-- Surat Pengesahan Pendaftaran Pelajar, addressed to KWSP, is drawn on demand
-- like the offer letter (see docs/documents.md) — but unlike the offer letter
-- not every student has one. What is kept is only that: who has one, and since
-- when.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. One row per student who has a letter.
--
--    `student_id` is the primary key. Nothing of the letter is stored: it is
--    drawn from the student and the course as they read on the day.
--
--    Academy side only. The student does not read it — the policy is
--    `app.is_admin` and nothing else, so it is narrower than the IC copy's —
--    and clients never write it: `create_kwsp_letters` does.
-- ---------------------------------------------------------------------------
create table if not exists public.student_kwsp_letters (
  student_id uuid primary key references public.students(id) on delete cascade,
  academy_id uuid not null references public.academies(id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.student_kwsp_letters is
  'The students the academy has prepared a KWSP letter for, one row each. Admin read only; clients have no DML: create_kwsp_letters / remove_kwsp_letters.';

create index if not exists student_kwsp_letters_academy_idx
  on public.student_kwsp_letters (academy_id);

alter table public.student_kwsp_letters enable row level security;

create policy "kwsp letters: admin read"
  on public.student_kwsp_letters for select to authenticated
  using (app.is_admin(academy_id));

revoke all on public.student_kwsp_letters from anon, authenticated;
grant select on public.student_kwsp_letters to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Creating, for one student or for many.
--
--    Every id must be a live student of an academy the caller administers, or
--    nothing is written: a partial bulk would leave the admin guessing which
--    rows took. A student who already has one is left as they are, so the date
--    of an existing letter does not move. Returns how many were added.
-- ---------------------------------------------------------------------------
create or replace function public.create_kwsp_letters(_student_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  _ids   uuid[];
  _found integer;
  _added integer;
begin
  if (select auth.uid()) is null then
    raise exception 'You must be signed in';
  end if;

  select coalesce(array_agg(distinct i), '{}') into _ids
    from unnest(_student_ids) as i
   where i is not null;
  if cardinality(_ids) = 0 then return 0; end if;

  select count(*) into _found
    from public.students s
   where s.id = any(_ids)
     and s.archived_at is null
     and app.is_admin(s.academy_id);
  if _found <> cardinality(_ids) then
    raise exception 'Student record not found';
  end if;

  insert into public.student_kwsp_letters (student_id, academy_id)
  select s.id, s.academy_id
    from public.students s
   where s.id = any(_ids)
  on conflict (student_id) do nothing;
  get diagnostics _added = row_count;

  return _added;
end;
$$;

revoke execute on function public.create_kwsp_letters(uuid[]) from public, anon;
grant  execute on function public.create_kwsp_letters(uuid[]) to authenticated;
