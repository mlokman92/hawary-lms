-- Which part of the LPKC a course's students are working on.
--
-- The LPKC is produced in three parts, in this order: a summary (title,
-- introduction, objectives, problem statement), the report itself, and the
-- slides it is presented from. An intake moves through them together, so the
-- stage is a fact about the COURSE, not about a student's thread: Siri 1 and
-- Siri 2 are on their slides while Siri 3 is still writing summaries.
--
-- Not to be confused with public.report_stage(report_submissions), which is
-- where one report sits in the checking queue (moderating / pending approval).
-- Superseded the same day by 20261013110000: a course takes a SET of parts.
-- Full note: docs/report-checks.md -> "The parts of an LPKC".

create type public.lpkc_stage as enum ('summary', 'report', 'slide');

alter table public.courses
  add column lpkc_stage public.lpkc_stage not null default 'summary';

comment on column public.courses.lpkc_stage is
  'Which part of the LPKC this course''s students are on. Set by an admin.';

-- `courses` is writable by every staff member, because a trainer builds the
-- course they teach. Moving a whole intake on to its next stage is the
-- academy's call, so this one column is an admin's — and hiding the control
-- from a trainer would not have been a boundary, since their JWT writes the
-- table straight through PostgREST.
create function app.guard_course_lpkc_stage()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  -- The owner in SQL, and SECURITY DEFINER work with no JWT behind it.
  if (select auth.uid()) is null then return new; end if;

  if app.is_admin(new.academy_id) then return new; end if;

  -- A course a trainer creates (or duplicates) starts at the first stage.
  if tg_op = 'INSERT' and new.lpkc_stage <> 'summary' then
    raise exception 'Only an admin can set a course''s LPKC stage';
  end if;
  if tg_op = 'UPDATE' and new.lpkc_stage is distinct from old.lpkc_stage then
    raise exception 'Only an admin can set a course''s LPKC stage';
  end if;
  return new;
end;
$$;

revoke all on function app.guard_course_lpkc_stage() from public, anon, authenticated;

create trigger guard_course_lpkc_stage
  before insert or update on public.courses
  for each row execute function app.guard_course_lpkc_stage();

-- Where the three intakes are today. Every other course keeps the default.
update public.courses c
   set lpkc_stage = 'slide'
  from public.academies a
 where a.id = c.academy_id
   and a.slug = 'hawary-academy'
   and c.title in ('DKM Prasekolah Siri 1/2026', 'DKM Prasekolah Siri 2/2026');
