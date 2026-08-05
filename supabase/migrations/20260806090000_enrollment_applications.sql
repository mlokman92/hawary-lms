-- Course enrollment: a prospect asks for a seat, staff decide.
--
-- Why an application is its own record rather than enrollments.status='pending':
-- enrollments.student_id is NOT NULL, so a person with no student record cannot
-- hold a pending enrollment — and the whole point is that the applicant does not
-- have one yet. Letting the public write `students` directly would instead make
-- the roster a spam target. So the application is the third thing, and APPROVAL
-- is what converts it into students + enrollments + academy_members.
--
-- Approval is deliberately not automatic anywhere: this is not an online course,
-- a seat is subject to availability. Full note: docs/course-enrollment.md

create type public.enrollment_application_status as enum (
  'pending', 'approved', 'rejected', 'withdrawn'
);

-- ---------------------------------------------------------------------------
-- Per-course settings. A separate 1:1 table rather than columns on `courses`,
-- shaped like academy_payment_settings: it keeps `courses` clean, and it keeps
-- duplicate_course's explicit column list honest (a new column there would be
-- silently copied or silently dropped, and both are wrong).
-- ---------------------------------------------------------------------------
create table if not exists public.course_enrollment_settings (
  course_id   uuid primary key,
  academy_id  uuid not null,
  -- The master switch. Default false: publishing a course must not quietly open
  -- a public form on it.
  is_open     boolean not null default false,
  -- Whether it appears on the academy directory page. false = the link still
  -- works, so a private intake is shareable without being listed.
  is_listed   boolean not null default true,
  -- null = unlimited. Capacity does NOT close the form; see app.enrollment_open.
  capacity    integer,
  closes_at   timestamptz,
  intro       text,
  -- Which of the student-detail fields the applicant must fill in. Names match
  -- `students` columns 1:1 so approval is a straight copy.
  required_fields text[] not null default array['full_name', 'phone'],
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint course_enrollment_settings_academy_id_fkey
    foreign key (academy_id) references public.academies(id) on delete cascade,
  constraint course_enrollment_settings_academy_id_course_id_fkey
    foreign key (academy_id, course_id)
    references public.courses(academy_id, id) on delete cascade,
  constraint course_enrollment_settings_capacity_check
    check (capacity is null or capacity > 0),
  -- An application with no name is not reviewable, so full_name is not optional.
  constraint course_enrollment_settings_required_fields_check
    check (
      'full_name' = any (required_fields)
      and required_fields <@ array[
        'full_name', 'email', 'phone', 'ic_number',
        'date_of_birth', 'gender', 'address', 'organization'
      ]::text[]
    )
);

create index if not exists course_enrollment_settings_academy_id_idx
  on public.course_enrollment_settings (academy_id);

alter table public.course_enrollment_settings enable row level security;

-- Read is is_staff (the whole back-office needs to know whether a course is
-- open); write is can_grade_course, the same "a course you are responsible for"
-- test duplicate_course uses.
create policy "course enrollment settings: staff read"
  on public.course_enrollment_settings for select to authenticated
  using (app.is_staff(academy_id));

create policy "course enrollment settings: graders insert"
  on public.course_enrollment_settings for insert to authenticated
  with check (app.can_grade_course(course_id));

create policy "course enrollment settings: graders update"
  on public.course_enrollment_settings for update to authenticated
  using (app.can_grade_course(course_id))
  with check (app.can_grade_course(course_id));

create policy "course enrollment settings: admins delete"
  on public.course_enrollment_settings for delete to authenticated
  using (app.is_admin(academy_id));

create trigger set_updated_at
  before update on public.course_enrollment_settings
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- The applications themselves.
-- ---------------------------------------------------------------------------
create table if not exists public.enrollment_applications (
  id          uuid primary key default gen_random_uuid(),
  academy_id  uuid not null,
  course_id   uuid not null,
  -- The applying auth account. Required: "sign up, then enrol" is the model, and
  -- it is what lets the applicant be told the decision without any email being
  -- sent — they come back and see it.
  user_id     uuid not null,
  -- Set on approval: the student record this became.
  student_id  uuid,
  status      public.enrollment_application_status not null default 'pending',

  -- Submitted detail. Mirrors `students` columns 1:1.
  full_name    text not null,
  email        text not null,
  phone        text,
  ic_number    text,
  date_of_birth date,
  gender       public.gender,
  address      text,
  organization text,
  notes        text,

  review_note  text,
  reviewed_by  uuid,
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint enrollment_applications_academy_id_fkey
    foreign key (academy_id) references public.academies(id) on delete cascade,
  constraint enrollment_applications_academy_id_course_id_fkey
    foreign key (academy_id, course_id)
    references public.courses(academy_id, id) on delete cascade,
  constraint enrollment_applications_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete cascade,
  -- Single-column on purpose: a multi-column SET NULL would try to null
  -- academy_id too. Tenancy of student_id is checked in the review RPC.
  constraint enrollment_applications_student_id_fkey
    foreign key (student_id) references public.students(id) on delete set null,
  constraint enrollment_applications_reviewed_by_fkey
    foreign key (reviewed_by) references public.profiles(id) on delete set null
);

-- One LIVE application per person per course. Partial on purpose: a rejected
-- applicant may apply again for the next intake.
create unique index if not exists enrollment_applications_open_key
  on public.enrollment_applications (course_id, user_id)
  where status = 'pending';

create index if not exists enrollment_applications_academy_status_idx
  on public.enrollment_applications (academy_id, status);
create index if not exists enrollment_applications_course_id_idx
  on public.enrollment_applications (course_id);
create index if not exists enrollment_applications_user_id_idx
  on public.enrollment_applications (user_id);
create index if not exists enrollment_applications_student_id_idx
  on public.enrollment_applications (student_id);

alter table public.enrollment_applications enable row level security;

-- Read: whoever may grade the course (admin academy-wide, trainer their own),
-- plus the applicant. There is deliberately NO insert/update/delete policy —
-- every write goes through a SECURITY DEFINER RPC. The writer here is a
-- NON-MEMBER, the widest audience any table in this schema has; the
-- academy_invitations lesson (docs/account-claiming.md) applies with interest.
create policy "enrollment applications: graders and applicant read"
  on public.enrollment_applications for select to authenticated
  using (app.can_grade_course(course_id) or user_id = (select auth.uid()));

create trigger set_updated_at
  before update on public.enrollment_applications
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- Helpers. Both SECURITY DEFINER so the public (anon) page functions can call
-- them without any table being readable by anon.
-- ---------------------------------------------------------------------------

-- The same predicate as the course_enrollment_stats view, extracted so the
-- public page and the approval RPC can never disagree about what "full" means.
create or replace function app.course_seats_taken(_course_id uuid)
returns integer
language sql
stable
security definer
set search_path to ''
as $$
  select count(*)::integer
  from public.enrollments e
  join public.students s
    on s.academy_id = e.academy_id
   and s.id         = e.student_id
  where e.course_id = _course_id
    and e.status    = 'active'
    and s.archived_at is null;
$$;

-- Capacity is deliberately NOT part of this. Full does not mean closed: a queue
-- of people who want the next seat is exactly why approval exists.
create or replace function app.enrollment_open(_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (
    select 1
    from public.course_enrollment_settings s
    join public.courses c on c.id = s.course_id
    where s.course_id = _course_id
      and s.is_open
      and c.status = 'published'
      and (s.closes_at is null or s.closes_at > now())
  );
$$;

comment on table public.enrollment_applications is
  'A request for a seat on a course, from an account that may not be a member yet. Approval creates the students/enrollments/academy_members rows.';
comment on table public.course_enrollment_settings is
  'Per-course public enrollment form configuration. Absent row = the course has no enrollment page.';
