-- ============================================================================
-- 0002 · Courses, instructor assignment, and enrollment.
-- ============================================================================

create type public.course_status     as enum ('draft', 'published', 'archived');
create type public.enrollment_status as enum ('active', 'pending', 'completed', 'dropped', 'cancelled');

-- ---------------------------------------------------------------------------
-- Courses
-- ---------------------------------------------------------------------------
create table public.courses (
  id           uuid primary key default gen_random_uuid(),
  academy_id   uuid not null references public.academies(id) on delete cascade,
  title        text not null,
  code         text,
  description  text,
  status       public.course_status not null default 'draft',
  price_sen    integer not null default 0 check (price_sen >= 0),
  currency     text not null default 'MYR',
  cover_url    text,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- Tenant-composite target for child tables:
  unique (academy_id, id)
);
create index courses_academy_id_idx on public.courses (academy_id);
create index courses_created_by_idx on public.courses (created_by);
create unique index courses_academy_code_key
  on public.courses (academy_id, lower(code)) where code is not null;

create trigger set_updated_at before update on public.courses
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- Course instructors (trainers assigned to a course)
-- ---------------------------------------------------------------------------
create table public.course_instructors (
  id          uuid primary key default gen_random_uuid(),
  academy_id  uuid not null references public.academies(id) on delete cascade,
  course_id   uuid not null,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (course_id, user_id),
  foreign key (academy_id, course_id)
    references public.courses (academy_id, id) on delete cascade
);
create index course_instructors_course_id_idx on public.course_instructors (course_id);
create index course_instructors_user_id_idx    on public.course_instructors (user_id);
create index course_instructors_academy_id_idx on public.course_instructors (academy_id);

-- ---------------------------------------------------------------------------
-- Enrollments
-- ---------------------------------------------------------------------------
create table public.enrollments (
  id            uuid primary key default gen_random_uuid(),
  academy_id    uuid not null references public.academies(id) on delete cascade,
  course_id     uuid not null,
  student_id    uuid not null references public.profiles(id) on delete cascade,
  status        public.enrollment_status not null default 'active',
  enrolled_at   timestamptz not null default now(),
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (course_id, student_id),
  unique (academy_id, id),
  foreign key (academy_id, course_id)
    references public.courses (academy_id, id) on delete cascade
);
create index enrollments_academy_id_idx on public.enrollments (academy_id);
create index enrollments_course_id_idx  on public.enrollments (course_id);
create index enrollments_student_id_idx on public.enrollments (student_id);

create trigger set_updated_at before update on public.enrollments
  for each row execute function app.set_updated_at();

-- Immutability guard: a non-staff end user may not re-point their enrollment to
-- another academy/course/student, nor escalate status. They may only withdraw
-- (status -> 'dropped'). WITH CHECK cannot see OLD, so this trigger is required.
-- Service-role writes (auth.uid() is null) bypass the guard.
create or replace function app.guard_enrollment_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and not app.is_staff(new.academy_id) then
    if new.academy_id is distinct from old.academy_id
    or new.course_id  is distinct from old.course_id
    or new.student_id is distinct from old.student_id then
      raise exception 'Students may not change the academy, course, or student of an enrollment';
    end if;
    if new.status is distinct from old.status and new.status <> 'dropped' then
      raise exception 'Students may only withdraw (set enrollment status to dropped)';
    end if;
  end if;
  return new;
end;
$$;
create trigger guard_enrollment_update before update on public.enrollments
  for each row execute function app.guard_enrollment_update();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.courses            enable row level security;
alter table public.course_instructors enable row level security;
alter table public.enrollments        enable row level security;

-- courses -------------------------------------------------------------------
-- Staff see all academy courses; students see published courses in their academy.
create policy "courses: staff view all, students view published"
  on public.courses for select to authenticated
  using (
    app.is_staff(academy_id)
    or (status = 'published' and app.is_member(academy_id))
  );

create policy "courses: staff can create"
  on public.courses for insert to authenticated
  with check (app.is_staff(academy_id));

create policy "courses: staff can update"
  on public.courses for update to authenticated
  using (app.is_staff(academy_id))
  with check (app.is_staff(academy_id));

create policy "courses: admins can delete"
  on public.courses for delete to authenticated
  using (app.is_admin(academy_id));

-- course_instructors --------------------------------------------------------
create policy "course_instructors: members can view"
  on public.course_instructors for select to authenticated
  using (app.is_member(academy_id));

create policy "course_instructors: staff can manage (insert)"
  on public.course_instructors for insert to authenticated
  with check (app.is_staff(academy_id));

create policy "course_instructors: staff can manage (delete)"
  on public.course_instructors for delete to authenticated
  using (app.is_staff(academy_id));

-- enrollments ---------------------------------------------------------------
create policy "enrollments: staff view all, students view own"
  on public.enrollments for select to authenticated
  using (app.is_staff(academy_id) or student_id = (select auth.uid()));

-- Staff may enroll anyone; a student may self-enroll into a published course.
create policy "enrollments: staff enroll or student self-enroll"
  on public.enrollments for insert to authenticated
  with check (
    app.is_staff(academy_id)
    or (
      student_id = (select auth.uid())
      and exists (
        select 1 from public.courses c
        where c.id = course_id
          and c.academy_id = enrollments.academy_id
          and c.status = 'published'
      )
    )
  );

-- Immutability of academy/course/student and status escalation is enforced by
-- app.guard_enrollment_update(); this policy adds the membership requirement so
-- a self-update can never target an academy the caller is not a member of.
create policy "enrollments: staff update, student withdraw own"
  on public.enrollments for update to authenticated
  using (
    app.is_staff(academy_id)
    or (student_id = (select auth.uid()) and app.is_member(academy_id))
  )
  with check (
    app.is_staff(academy_id)
    or (student_id = (select auth.uid()) and app.is_member(academy_id))
  );

create policy "enrollments: staff can delete"
  on public.enrollments for delete to authenticated
  using (app.is_staff(academy_id));
