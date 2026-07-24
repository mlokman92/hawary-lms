-- ============================================================================
-- 0003 · Learning content: notes, assessments (+ questions, attempts),
--        assignments (+ submissions).
-- ============================================================================

create type public.assessment_type  as enum ('quiz', 'exam', 'survey');
create type public.question_type    as enum ('single_choice', 'multiple_choice', 'true_false', 'short_text', 'essay');
create type public.attempt_status   as enum ('in_progress', 'submitted', 'graded');
create type public.submission_status as enum ('draft', 'submitted', 'graded', 'returned');

-- Enrollment check helper (SECURITY DEFINER → bypass RLS). Requires the student
-- to have an ACTIVE enrollment AND an active membership of that enrollment's
-- academy — defence-in-depth so a stray/relocated enrollment row cannot by
-- itself grant a non-member access to a tenant's content.
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
    join public.academy_members m
      on m.academy_id = e.academy_id
     and m.user_id    = e.student_id
     and m.status     = 'active'
    where e.course_id  = _course_id
      and e.student_id = (select auth.uid())
      and e.status     = 'active'
  );
$$;

-- ---------------------------------------------------------------------------
-- Notes
-- ---------------------------------------------------------------------------
create table public.notes (
  id             uuid primary key default gen_random_uuid(),
  academy_id     uuid not null references public.academies(id) on delete cascade,
  course_id      uuid not null,
  title          text not null,
  content        text,
  attachment_url text,
  is_published   boolean not null default false,
  sort_order     integer not null default 0,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  foreign key (academy_id, course_id)
    references public.courses (academy_id, id) on delete cascade
);
create index notes_course_id_idx  on public.notes (course_id);
create index notes_academy_id_idx on public.notes (academy_id);
create index notes_created_by_idx on public.notes (created_by);
create trigger set_updated_at before update on public.notes
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- Assessments
-- ---------------------------------------------------------------------------
create table public.assessments (
  id               uuid primary key default gen_random_uuid(),
  academy_id       uuid not null references public.academies(id) on delete cascade,
  course_id        uuid not null,
  title            text not null,
  description      text,
  type             public.assessment_type not null default 'quiz',
  total_points     numeric(7,2) not null default 0 check (total_points >= 0),
  duration_minutes integer check (duration_minutes is null or duration_minutes > 0),
  available_from   timestamptz,
  available_until  timestamptz,
  max_attempts     integer not null default 1 check (max_attempts >= 1),
  is_published     boolean not null default false,
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (academy_id, id),
  foreign key (academy_id, course_id)
    references public.courses (academy_id, id) on delete cascade
);
create index assessments_course_id_idx  on public.assessments (course_id);
create index assessments_academy_id_idx on public.assessments (academy_id);
create index assessments_created_by_idx on public.assessments (created_by);
create trigger set_updated_at before update on public.assessments
  for each row execute function app.set_updated_at();

-- Questions. correct_answer must never reach students → this table is
-- staff-only under RLS; student quiz delivery goes through an Edge Function
-- that strips answers.
create table public.assessment_questions (
  id             uuid primary key default gen_random_uuid(),
  academy_id     uuid not null references public.academies(id) on delete cascade,
  assessment_id  uuid not null,
  question_type  public.question_type not null,
  prompt         text not null,
  points         numeric(7,2) not null default 1 check (points >= 0),
  sort_order     integer not null default 0,
  options        jsonb,           -- choice options (no correctness flags here)
  correct_answer jsonb,           -- STAFF-ONLY. never expose to students.
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  foreign key (academy_id, assessment_id)
    references public.assessments (academy_id, id) on delete cascade
);
create index assessment_questions_assessment_id_idx on public.assessment_questions (assessment_id);
create index assessment_questions_academy_id_idx     on public.assessment_questions (academy_id);
create trigger set_updated_at before update on public.assessment_questions
  for each row execute function app.set_updated_at();

-- Attempts.
create table public.assessment_attempts (
  id             uuid primary key default gen_random_uuid(),
  academy_id     uuid not null references public.academies(id) on delete cascade,
  assessment_id  uuid not null,
  student_id     uuid not null references public.profiles(id) on delete cascade,
  status         public.attempt_status not null default 'in_progress',
  score          numeric(7,2) check (score is null or score >= 0),
  max_score      numeric(7,2),
  answers        jsonb,
  started_at     timestamptz not null default now(),
  submitted_at   timestamptz,
  graded_at      timestamptz,
  graded_by      uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  foreign key (academy_id, assessment_id)
    references public.assessments (academy_id, id) on delete cascade
);
create index assessment_attempts_assessment_id_idx on public.assessment_attempts (assessment_id);
create index assessment_attempts_student_id_idx     on public.assessment_attempts (student_id);
create index assessment_attempts_academy_id_idx     on public.assessment_attempts (academy_id);
create index assessment_attempts_graded_by_idx      on public.assessment_attempts (graded_by);
create trigger set_updated_at before update on public.assessment_attempts
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- Assignments
-- ---------------------------------------------------------------------------
create table public.assignments (
  id           uuid primary key default gen_random_uuid(),
  academy_id   uuid not null references public.academies(id) on delete cascade,
  course_id    uuid not null,
  title        text not null,
  instructions text,
  total_points numeric(7,2) not null default 100 check (total_points >= 0),
  due_at       timestamptz,
  allow_late   boolean not null default false,
  is_published boolean not null default false,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (academy_id, id),
  foreign key (academy_id, course_id)
    references public.courses (academy_id, id) on delete cascade
);
create index assignments_course_id_idx  on public.assignments (course_id);
create index assignments_academy_id_idx on public.assignments (academy_id);
create index assignments_created_by_idx on public.assignments (created_by);
create trigger set_updated_at before update on public.assignments
  for each row execute function app.set_updated_at();

-- Submissions.
create table public.assignment_submissions (
  id             uuid primary key default gen_random_uuid(),
  academy_id     uuid not null references public.academies(id) on delete cascade,
  assignment_id  uuid not null,
  student_id     uuid not null references public.profiles(id) on delete cascade,
  status         public.submission_status not null default 'draft',
  content        text,
  attachment_url text,
  submitted_at   timestamptz,
  grade          numeric(7,2) check (grade is null or grade >= 0),
  feedback       text,
  graded_by      uuid references public.profiles(id) on delete set null,
  graded_at      timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (assignment_id, student_id),
  foreign key (academy_id, assignment_id)
    references public.assignments (academy_id, id) on delete cascade
);
create index assignment_submissions_assignment_id_idx on public.assignment_submissions (assignment_id);
create index assignment_submissions_student_id_idx     on public.assignment_submissions (student_id);
create index assignment_submissions_academy_id_idx     on public.assignment_submissions (academy_id);
create index assignment_submissions_graded_by_idx      on public.assignment_submissions (graded_by);
create trigger set_updated_at before update on public.assignment_submissions
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- Grading guards: a non-staff end user must not set grading fields, even
-- though RLS lets them update their own attempt/submission rows. Service-role
-- writes (auth.uid() is null) bypass the guard.
-- ---------------------------------------------------------------------------
create or replace function app.guard_attempt_grading()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and not app.is_staff(new.academy_id) then
    if new.academy_id    is distinct from old.academy_id
    or new.assessment_id is distinct from old.assessment_id
    or new.student_id    is distinct from old.student_id then
      raise exception 'Students may not change the academy, assessment, or student of an attempt';
    end if;
    if new.score     is distinct from old.score
    or new.max_score is distinct from old.max_score
    or new.graded_by is distinct from old.graded_by
    or new.graded_at is distinct from old.graded_at
    or (new.status = 'graded' and old.status <> 'graded') then
      raise exception 'Only staff may set grading fields on an attempt';
    end if;
  end if;
  return new;
end;
$$;
create trigger guard_attempt_grading before update on public.assessment_attempts
  for each row execute function app.guard_attempt_grading();

create or replace function app.guard_submission_grading()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and not app.is_staff(new.academy_id) then
    if new.academy_id    is distinct from old.academy_id
    or new.assignment_id is distinct from old.assignment_id
    or new.student_id    is distinct from old.student_id then
      raise exception 'Students may not change the academy, assignment, or student of a submission';
    end if;
    if new.grade     is distinct from old.grade
    or new.feedback  is distinct from old.feedback
    or new.graded_by is distinct from old.graded_by
    or new.graded_at is distinct from old.graded_at
    or (new.status in ('graded','returned') and old.status not in ('graded','returned')) then
      raise exception 'Only staff may set grading fields on a submission';
    end if;
  end if;
  return new;
end;
$$;
create trigger guard_submission_grading before update on public.assignment_submissions
  for each row execute function app.guard_submission_grading();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.notes                  enable row level security;
alter table public.assessments            enable row level security;
alter table public.assessment_questions   enable row level security;
alter table public.assessment_attempts    enable row level security;
alter table public.assignments            enable row level security;
alter table public.assignment_submissions enable row level security;

-- notes ---------------------------------------------------------------------
create policy "notes: staff all, enrolled students see published"
  on public.notes for select to authenticated
  using (app.is_staff(academy_id) or (is_published and app.is_enrolled(course_id)));
create policy "notes: staff insert" on public.notes for insert to authenticated
  with check (app.is_staff(academy_id));
create policy "notes: staff update" on public.notes for update to authenticated
  using (app.is_staff(academy_id)) with check (app.is_staff(academy_id));
create policy "notes: staff delete" on public.notes for delete to authenticated
  using (app.is_staff(academy_id));

-- assessments ---------------------------------------------------------------
create policy "assessments: staff all, enrolled students see published"
  on public.assessments for select to authenticated
  using (app.is_staff(academy_id) or (is_published and app.is_enrolled(course_id)));
create policy "assessments: staff insert" on public.assessments for insert to authenticated
  with check (app.is_staff(academy_id));
create policy "assessments: staff update" on public.assessments for update to authenticated
  using (app.is_staff(academy_id)) with check (app.is_staff(academy_id));
create policy "assessments: staff delete" on public.assessments for delete to authenticated
  using (app.is_staff(academy_id));

-- assessment_questions (STAFF ONLY — answers must not leak) ------------------
create policy "questions: staff select" on public.assessment_questions for select to authenticated
  using (app.is_staff(academy_id));
create policy "questions: staff insert" on public.assessment_questions for insert to authenticated
  with check (app.is_staff(academy_id));
create policy "questions: staff update" on public.assessment_questions for update to authenticated
  using (app.is_staff(academy_id)) with check (app.is_staff(academy_id));
create policy "questions: staff delete" on public.assessment_questions for delete to authenticated
  using (app.is_staff(academy_id));

-- assessment_attempts -------------------------------------------------------
create policy "attempts: staff all, student own"
  on public.assessment_attempts for select to authenticated
  using (app.is_staff(academy_id) or student_id = (select auth.uid()));

create policy "attempts: staff or enrolled student can start"
  on public.assessment_attempts for insert to authenticated
  with check (
    app.is_staff(academy_id)
    or (
      student_id = (select auth.uid())
      and exists (
        select 1 from public.assessments a
        where a.id = assessment_id
          and a.academy_id = assessment_attempts.academy_id
          and a.is_published
          and app.is_enrolled(a.course_id)
      )
    )
  );

create policy "attempts: staff or student own can update"
  on public.assessment_attempts for update to authenticated
  using (
    app.is_staff(academy_id)
    or (student_id = (select auth.uid()) and status = 'in_progress')
  )
  with check (app.is_staff(academy_id) or student_id = (select auth.uid()));

create policy "attempts: staff delete" on public.assessment_attempts for delete to authenticated
  using (app.is_staff(academy_id));

-- assignments ---------------------------------------------------------------
create policy "assignments: staff all, enrolled students see published"
  on public.assignments for select to authenticated
  using (app.is_staff(academy_id) or (is_published and app.is_enrolled(course_id)));
create policy "assignments: staff insert" on public.assignments for insert to authenticated
  with check (app.is_staff(academy_id));
create policy "assignments: staff update" on public.assignments for update to authenticated
  using (app.is_staff(academy_id)) with check (app.is_staff(academy_id));
create policy "assignments: staff delete" on public.assignments for delete to authenticated
  using (app.is_staff(academy_id));

-- assignment_submissions ----------------------------------------------------
create policy "submissions: staff all, student own"
  on public.assignment_submissions for select to authenticated
  using (app.is_staff(academy_id) or student_id = (select auth.uid()));

create policy "submissions: staff or enrolled student can create"
  on public.assignment_submissions for insert to authenticated
  with check (
    app.is_staff(academy_id)
    or (
      student_id = (select auth.uid())
      and exists (
        select 1 from public.assignments a
        where a.id = assignment_id
          and a.academy_id = assignment_submissions.academy_id
          and a.is_published
          and app.is_enrolled(a.course_id)
      )
    )
  );

-- Students may edit their own submission only while it is not final ('graded').
-- Together with app.guard_submission_grading (non-staff cannot set graded/returned
-- or alter grade fields) this blocks tampering with — or revert-then-delete of — a
-- graded submission, since a graded row is not selectable by the student's branch.
create policy "submissions: staff or student own can update"
  on public.assignment_submissions for update to authenticated
  using (
    app.is_staff(academy_id)
    or (student_id = (select auth.uid()) and status <> 'graded')
  )
  with check (
    app.is_staff(academy_id)
    or (student_id = (select auth.uid()) and status <> 'graded')
  );

create policy "submissions: staff or student own-draft can delete"
  on public.assignment_submissions for delete to authenticated
  using (app.is_staff(academy_id) or (student_id = (select auth.uid()) and status = 'draft'));
