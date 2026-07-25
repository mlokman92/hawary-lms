-- ============================================================================
-- 0006 · Students as academy-managed records.
--   A "student" is a record the academy owns (CRM-style) — it does NOT require
--   an auth account. Optional user_id links a student to an app login later.
--   Personal details + a generated 8-char student_no + a student_status.
--   Enrollments are repointed from profiles -> students and become staff-managed.
-- ============================================================================

create type public.student_status as enum ('active','trial','inactive','withdrawn','unenrolled');
create type public.gender as enum ('male','female');

-- Human-friendly 8-char code (excludes ambiguous chars I/O/0/1).
create or replace function app.gen_student_no()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i int;
begin
  for i in 1..8 loop
    result := result || substr(chars, (floor(random() * length(chars)))::int + 1, 1);
  end loop;
  return result;
end;
$$;

create table public.students (
  id            uuid primary key default gen_random_uuid(),
  academy_id    uuid not null references public.academies(id) on delete cascade,
  student_no    text not null,
  full_name     text,
  gender        public.gender,
  ic_number     text,
  date_of_birth date,
  phone         text,
  email         text,
  avatar_url    text,
  address       text,
  status        public.student_status not null default 'active',
  user_id       uuid references public.profiles(id) on delete set null,
  archived_at   timestamptz,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (academy_id, student_no),
  unique (academy_id, id)
);
create index students_academy_id_idx on public.students (academy_id);
create index students_user_id_idx    on public.students (user_id);
create index students_created_by_idx on public.students (created_by);
create index students_status_idx     on public.students (academy_id, status);

-- Assign a unique student_no per academy on insert (retry on collision).
create or replace function app.set_student_no()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate text;
  tries int := 0;
begin
  if new.student_no is not null and new.student_no <> '' then
    return new;
  end if;
  loop
    candidate := app.gen_student_no();
    exit when not exists (
      select 1 from public.students s
      where s.academy_id = new.academy_id and s.student_no = candidate
    );
    tries := tries + 1;
    if tries > 25 then
      raise exception 'Could not generate a unique student number';
    end if;
  end loop;
  new.student_no := candidate;
  return new;
end;
$$;
create trigger set_student_no before insert on public.students
  for each row execute function app.set_student_no();
create trigger set_updated_at before update on public.students
  for each row execute function app.set_updated_at();

-- Does the current auth user own this student record (via the app-account link)?
create or replace function app.owns_student(_student_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.students s
    where s.id = _student_id and s.user_id = (select auth.uid())
  );
$$;

alter table public.students enable row level security;

create policy "students: staff manage, student view own"
  on public.students for select to authenticated
  using (app.is_staff(academy_id) or user_id = (select auth.uid()));
create policy "students: staff insert" on public.students for insert to authenticated
  with check (app.is_staff(academy_id));
create policy "students: staff update" on public.students for update to authenticated
  using (app.is_staff(academy_id)) with check (app.is_staff(academy_id));
create policy "students: admins delete" on public.students for delete to authenticated
  using (app.is_admin(academy_id));

-- ---------------------------------------------------------------------------
-- Repoint enrollments.student_id: profiles -> students. Enrollment is now
-- staff-managed; a linked student app-user may view their own rows.
-- ---------------------------------------------------------------------------
drop trigger if exists guard_enrollment_update on public.enrollments;
drop function if exists app.guard_enrollment_update();

drop policy if exists "enrollments: staff view all, students view own" on public.enrollments;
drop policy if exists "enrollments: staff enroll or student self-enroll" on public.enrollments;
drop policy if exists "enrollments: staff update, student withdraw own" on public.enrollments;
drop policy if exists "enrollments: staff can delete" on public.enrollments;

alter table public.enrollments drop constraint enrollments_student_id_fkey;
alter table public.enrollments
  add constraint enrollments_academy_id_student_id_fkey
  foreign key (academy_id, student_id)
  references public.students (academy_id, id) on delete cascade;
create index enrollments_academy_student_idx on public.enrollments (academy_id, student_id);

create policy "enrollments: staff view all, student view own"
  on public.enrollments for select to authenticated
  using (app.is_staff(academy_id) or app.owns_student(student_id));
create policy "enrollments: staff insert" on public.enrollments for insert to authenticated
  with check (app.is_staff(academy_id));
create policy "enrollments: staff update" on public.enrollments for update to authenticated
  using (app.is_staff(academy_id)) with check (app.is_staff(academy_id));
create policy "enrollments: staff delete" on public.enrollments for delete to authenticated
  using (app.is_staff(academy_id));

-- Keep app.is_enrolled() coherent: map the auth user to their student record,
-- then check for an active enrollment (used by content RLS as features land).
create or replace function app.is_enrolled(_course_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.enrollments e
    join public.students s on s.id = e.student_id
    where e.course_id = _course_id
      and s.user_id = (select auth.uid())
      and e.status = 'active'
  );
$$;
