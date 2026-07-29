-- ============================================================================
-- 0023 · Student answering + instructor grading: DB foundations.
--
-- Both write tables are EMPTY (0 attempts, 0 submissions verified), so the
-- repoint below costs nothing today and cannot be done cheaply once real rows
-- exist. Everything here is the layer the /learn surface and the grading UI sit
-- on; no client code depends on it yet.
--
-- What this closes, beyond the repoint:
--   * app.is_enrolled lost its academy_members join in 20260725154144. Revoking
--     a membership stopped revoking content access. Restored, and extended to
--     honour students.archived_at / students.status.
--   * The grading guards only ever ran BEFORE UPDATE and only policed grading
--     columns, leaving started_at and submitted_at client-writable — every
--     time-based rule (duration_minutes, available_until, due_at/allow_late)
--     was decorative. They are now server-derived.
--   * Students could revert a 'returned' submission to draft and delete it.
--   * max_attempts could only ever be enforced by counting rows, which races.
--     It is now a uniqueness constraint.
--   * Read and write gates disagreed: reads used module_visible(module_id),
--     writes used is_enrolled(course_id), so an UNPUBLISHED module was a read
--     boundary but not a write boundary. Both now share one predicate.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Enrolment / ownership predicates
-- ---------------------------------------------------------------------------

-- Restores the academy_members join and adds the student-record conditions.
-- 'trial' counts as enrolled; inactive / withdrawn / unenrolled do not.
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
    join public.students s
      on s.id         = e.student_id
     and s.academy_id = e.academy_id
    join public.academy_members m
      on m.academy_id = e.academy_id
     and m.user_id    = s.user_id
     and m.status     = 'active'
    where e.course_id  = _course_id
      and e.status     = 'active'
      and s.user_id    = (select auth.uid())
      and s.archived_at is null
      and s.status in ('active', 'trial')
  );
$$;

-- One predicate for BOTH the read policies and the write paths, so an
-- unpublished module can never be writable-but-invisible.
create or replace function app.assessment_open(_assessment_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.assessments a
    where a.id = _assessment_id
      and a.is_published
      and app.module_visible(a.module_id)
  );
$$;

create or replace function app.assignment_open(_assignment_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.assignments a
    where a.id = _assignment_id
      and a.is_published
      and app.module_visible(a.module_id)
  );
$$;

-- ---------------------------------------------------------------------------
-- 2. Grading authority
-- ---------------------------------------------------------------------------
-- Phase 5 narrows ONLY app.can_grade_course; every policy and trigger below
-- goes through it, so trainer course-scoping becomes a one-function change.
-- app.is_staff is deliberately NOT touched: 58 policies depend on it.

create or replace function app.teaches_course(_course_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.course_instructors ci
    join public.instructors i
      on i.id         = ci.instructor_id
     and i.academy_id = ci.academy_id
    where ci.course_id = _course_id
      and i.user_id    = (select auth.uid())
      and i.archived_at is null
  );
$$;

-- Single argument on purpose: a two-argument (academy, course) form can be
-- called with a mismatched pair from SECURITY DEFINER code, where RLS is not
-- consulted. Deriving the academy from the course removes that class of bug.
create or replace function app.can_grade_course(_course_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.courses c
    where c.id = _course_id
      and app.is_staff(c.academy_id)
  );
$$;

create or replace function app.can_grade_assessment(_assessment_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.assessments a
    where a.id = _assessment_id and app.can_grade_course(a.course_id)
  );
$$;

create or replace function app.can_grade_assignment(_assignment_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.assignments a
    where a.id = _assignment_id and app.can_grade_course(a.course_id)
  );
$$;

-- ---------------------------------------------------------------------------
-- 3. Repoint student_id: profiles -> students
-- ---------------------------------------------------------------------------
-- The COMPOSITE (academy_id, student_id) FK is mandatory, not decoration:
-- app.owns_student is not academy-scoped, so without it a user holding student
-- records in two academies could attach an academy-A row to their academy-B
-- student and still satisfy the WITH CHECK.

alter table public.assessment_attempts
  drop constraint assessment_attempts_student_id_fkey;
alter table public.assessment_attempts
  add constraint assessment_attempts_academy_id_student_id_fkey
  foreign key (academy_id, student_id)
  references public.students (academy_id, id) on delete cascade;
create index assessment_attempts_academy_student_idx
  on public.assessment_attempts (academy_id, student_id);

alter table public.assignment_submissions
  drop constraint assignment_submissions_student_id_fkey;
alter table public.assignment_submissions
  add constraint assignment_submissions_academy_id_student_id_fkey
  foreign key (academy_id, student_id)
  references public.students (academy_id, id) on delete cascade;
create index assignment_submissions_academy_student_idx
  on public.assignment_submissions (academy_id, student_id);

-- graded_by stays -> profiles on both tables: the grader is an auth user, not
-- a students CRM record.

-- ---------------------------------------------------------------------------
-- 4. Attempt limits as constraints, not counts
-- ---------------------------------------------------------------------------
alter table public.assessment_attempts
  add column attempt_no integer not null default 1
  check (attempt_no >= 1);

-- max_attempts is enforced by this unique key (start_attempt computes the next
-- attempt_no and lets a unique violation win the race), not by select count(*).
alter table public.assessment_attempts
  add constraint assessment_attempts_assessment_student_no_key
  unique (assessment_id, student_id, attempt_no);

-- At most one open attempt per student per assessment, so "resume" is
-- idempotent under concurrency.
create unique index assessment_attempts_one_open
  on public.assessment_attempts (assessment_id, student_id)
  where status = 'in_progress';

-- ---------------------------------------------------------------------------
-- 5. Write guards (INSERT + UPDATE, TG_OP-aware)
-- ---------------------------------------------------------------------------
-- The old guards were BEFORE UPDATE only and dereferenced OLD unconditionally,
-- so they could not simply be re-pointed at INSERT.
--
-- Service-role callers (auth.uid() is null) still bypass, as before.
--
-- Auto-grading capability: submit_attempt sets a TRANSACTION-LOCAL GUC naming
-- the attempt it may score. PostgREST can only set request.* / role, so a
-- client cannot forge it, and is_local = true means it dies with the
-- transaction. This is what lets a SECURITY DEFINER RPC score an attempt while
-- auth.uid() is still the student (SECURITY DEFINER changes the ROLE, not the
-- JWT claim).

create or replace function app.guard_attempt_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_grader    boolean;
  v_autograde boolean;
begin
  if (select auth.uid()) is null then return new; end if;

  v_grader := app.can_grade_assessment(new.assessment_id);
  v_autograde := coalesce(current_setting('app.autograde_attempt', true), '')
                 = new.id::text;

  if TG_OP = 'INSERT' then
    if not v_grader then
      new.status       := 'in_progress';
      new.score        := null;
      new.max_score    := null;
      new.graded_by    := null;
      new.graded_at    := null;
      new.started_at   := now();
      new.submitted_at := null;
    end if;
    return new;
  end if;

  if not v_grader then
    if new.academy_id    is distinct from old.academy_id
    or new.assessment_id is distinct from old.assessment_id
    or new.student_id    is distinct from old.student_id
    or new.attempt_no    is distinct from old.attempt_no then
      raise exception 'Students may not change the academy, assessment, student or number of an attempt';
    end if;

    -- The exam clock is server-owned; letting a client rewrite it makes
    -- duration_minutes and available_until unenforceable.
    if new.started_at is distinct from old.started_at then
      raise exception 'started_at is set by the server';
    end if;

    if not v_autograde and (
         new.score     is distinct from old.score
      or new.max_score is distinct from old.max_score
      or new.graded_by is distinct from old.graded_by
      or new.graded_at is distinct from old.graded_at
      or (new.status = 'graded' and old.status <> 'graded')
    ) then
      raise exception 'Only staff may set grading fields on an attempt';
    end if;

    if v_autograde then
      new.graded_by := null;            -- scored by the system, not a person
      new.graded_at := now();
    end if;

    -- Derived, never accepted from the client.
    new.submitted_at := case
      when new.status = 'submitted' and old.status <> 'submitted' then now()
      else old.submitted_at
    end;
  else
    if new.score     is distinct from old.score
    or new.max_score is distinct from old.max_score
    or (new.status = 'graded' and old.status <> 'graded') then
      new.graded_by := (select auth.uid());
      new.graded_at := now();
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists guard_attempt_grading on public.assessment_attempts;
drop function if exists app.guard_attempt_grading();
create trigger guard_attempt_write
  before insert or update on public.assessment_attempts
  for each row execute function app.guard_attempt_write();

create or replace function app.guard_submission_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_grader boolean;
  v_due    timestamptz;
  v_late   boolean;
begin
  if (select auth.uid()) is null then return new; end if;

  v_grader := app.can_grade_assignment(new.assignment_id);

  if TG_OP = 'INSERT' then
    if not v_grader then
      new.status       := 'draft';
      new.grade        := null;
      new.feedback     := null;
      new.graded_by    := null;
      new.graded_at    := null;
      new.submitted_at := null;
    end if;
    return new;
  end if;

  if not v_grader then
    if new.academy_id    is distinct from old.academy_id
    or new.assignment_id is distinct from old.assignment_id
    or new.student_id    is distinct from old.student_id then
      raise exception 'Students may not change the academy, assignment, or student of a submission';
    end if;

    if new.grade     is distinct from old.grade
    or new.feedback  is distinct from old.feedback
    or new.graded_by is distinct from old.graded_by
    or new.graded_at is distinct from old.graded_at
    or (new.status in ('graded', 'returned') and old.status not in ('graded', 'returned')) then
      raise exception 'Only staff may set grading fields on a submission';
    end if;

    -- Due date is enforced here, against a server clock, because a client that
    -- can write submitted_at can otherwise backdate its way past any deadline.
    if new.status = 'submitted' and old.status <> 'submitted' then
      select a.due_at, a.allow_late into v_due, v_late
      from public.assignments a where a.id = new.assignment_id;
      if v_due is not null and not coalesce(v_late, false) and now() > v_due then
        raise exception 'This assignment is past its due date';
      end if;
      new.submitted_at := now();
    else
      new.submitted_at := old.submitted_at;
    end if;
  else
    if new.grade    is distinct from old.grade
    or new.feedback is distinct from old.feedback
    or (new.status in ('graded', 'returned') and old.status not in ('graded', 'returned')) then
      new.graded_by := (select auth.uid());
      new.graded_at := now();
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists guard_submission_grading on public.assignment_submissions;
drop function if exists app.guard_submission_grading();
create trigger guard_submission_write
  before insert or update on public.assignment_submissions
  for each row execute function app.guard_submission_write();

-- ---------------------------------------------------------------------------
-- 6. RLS: ownership via app.owns_student, grading via app.can_grade_*
-- ---------------------------------------------------------------------------
-- Attempts are written ONLY through the Phase-4 RPCs, so the student branches
-- of INSERT/UPDATE are removed entirely rather than tightened. The RPCs are
-- SECURITY DEFINER and bypass RLS, so they re-assert every predicate in their
-- own bodies.

drop policy "attempts: staff all, student own"                on public.assessment_attempts;
drop policy "attempts: staff or enrolled student can start"   on public.assessment_attempts;
drop policy "attempts: staff or student own can update"       on public.assessment_attempts;
drop policy "attempts: staff delete"                          on public.assessment_attempts;

create policy "attempts: graders all, student own" on public.assessment_attempts
  for select to authenticated
  using (app.can_grade_assessment(assessment_id) or app.owns_student(student_id));
create policy "attempts: graders insert" on public.assessment_attempts
  for insert to authenticated
  with check (app.can_grade_assessment(assessment_id));
create policy "attempts: graders update" on public.assessment_attempts
  for update to authenticated
  using (app.can_grade_assessment(assessment_id))
  with check (app.can_grade_assessment(assessment_id));
create policy "attempts: graders delete" on public.assessment_attempts
  for delete to authenticated
  using (app.can_grade_assessment(assessment_id));

drop policy "submissions: staff all, student own"              on public.assignment_submissions;
drop policy "submissions: staff or enrolled student can create" on public.assignment_submissions;
drop policy "submissions: staff or student own can update"      on public.assignment_submissions;
drop policy "submissions: staff or student own-draft can delete" on public.assignment_submissions;

create policy "submissions: graders all, student own" on public.assignment_submissions
  for select to authenticated
  using (app.can_grade_assignment(assignment_id) or app.owns_student(student_id));

create policy "submissions: grader or enrolled student can create" on public.assignment_submissions
  for insert to authenticated
  with check (
    app.can_grade_assignment(assignment_id)
    or (app.owns_student(student_id) and app.assignment_open(assignment_id))
  );

-- USING sees OLD: a student may only edit a row that is still a draft, which
-- also closes the returned -> draft -> delete path. WITH CHECK sees NEW and so
-- must permit the draft -> submitted transition.
create policy "submissions: grader or student own draft can update" on public.assignment_submissions
  for update to authenticated
  using (
    app.can_grade_assignment(assignment_id)
    or (app.owns_student(student_id) and status = 'draft')
  )
  with check (
    app.can_grade_assignment(assignment_id)
    or (app.owns_student(student_id) and status in ('draft', 'submitted'))
  );

create policy "submissions: grader or student own draft can delete" on public.assignment_submissions
  for delete to authenticated
  using (
    app.can_grade_assignment(assignment_id)
    or (app.owns_student(student_id) and status = 'draft')
  );

-- ---------------------------------------------------------------------------
-- 7. Admin account linking (unblocks testing without SMTP)
-- ---------------------------------------------------------------------------
-- accept_invitation is otherwise the ONLY writer of students.user_id /
-- instructors.user_id, which makes every downstream phase untestable until
-- transactional email is configured.

create or replace function public.link_student_account(_student_id uuid, _email text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student public.students;
  v_user    uuid;
begin
  select * into v_student from public.students where id = _student_id;
  if not found then raise exception 'Student not found'; end if;
  if not app.is_admin(v_student.academy_id) then
    raise exception 'Only an academy admin can link accounts';
  end if;
  if v_student.archived_at is not null then
    raise exception 'This student record is archived';
  end if;

  select id into v_user from auth.users where lower(email) = lower(_email);
  if v_user is null then raise exception 'No account exists for %', _email; end if;

  update public.students set user_id = v_user
    where id = _student_id and (user_id is null or user_id = v_user);
  if not found then
    raise exception 'This student record is already linked to another account';
  end if;

  insert into public.academy_members (academy_id, user_id, role, status)
    values (v_student.academy_id, v_user, 'student', 'active')
    on conflict (academy_id, user_id) do update
      set status = case
        when public.academy_members.status = 'suspended'
          then public.academy_members.status
        else 'active'::public.member_status
      end;

  return json_build_object('student_id', _student_id, 'user_id', v_user);
end;
$$;

create or replace function public.link_instructor_account(_instructor_id uuid, _email text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_instructor public.instructors;
  v_user       uuid;
begin
  select * into v_instructor from public.instructors where id = _instructor_id;
  if not found then raise exception 'Instructor not found'; end if;
  if not app.is_admin(v_instructor.academy_id) then
    raise exception 'Only an academy admin can link accounts';
  end if;
  if v_instructor.archived_at is not null then
    raise exception 'This instructor record is archived';
  end if;

  select id into v_user from auth.users where lower(email) = lower(_email);
  if v_user is null then raise exception 'No account exists for %', _email; end if;

  update public.instructors set user_id = v_user
    where id = _instructor_id and (user_id is null or user_id = v_user);
  if not found then
    raise exception 'This instructor record is already linked to another account';
  end if;

  insert into public.academy_members (academy_id, user_id, role, status)
    values (v_instructor.academy_id, v_user, 'trainer', 'active')
    on conflict (academy_id, user_id) do update
      set role = case
        when public.academy_members.role = 'admin' then 'admin'::app.user_role
        else 'trainer'::app.user_role
      end,
      status = case
        when public.academy_members.status = 'suspended'
          then public.academy_members.status
        else 'active'::public.member_status
      end;

  return json_build_object('instructor_id', _instructor_id, 'user_id', v_user);
end;
$$;

revoke all on function public.link_student_account(uuid, text) from public, anon;
grant execute on function public.link_student_account(uuid, text) to authenticated;
revoke all on function public.link_instructor_account(uuid, text) from public, anon;
grant execute on function public.link_instructor_account(uuid, text) to authenticated;
