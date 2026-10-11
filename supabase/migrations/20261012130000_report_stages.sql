-- ============================================================================
-- Two stages inside "being checked", for staff.
--
--   moderating         -- sent, and nobody on the staff side has added anything
--   pending_approval   -- a system admin has added a copy; the trainer's turn
--
-- They are a READING of the thread, not a stored status. `report_submissions
-- .status` keeps its four values and the student keeps seeing "being checked":
-- a student's JWT reads that column straight from PostgREST, so a stored
-- 'moderating' would have told them the step exists. The reading is built from
-- the staff-only entry, which a student cannot read, and is only ever returned
-- to the staff who can read the report.
--
--   in_review + no staff-only entry on this version   -> moderating
--   in_review + a staff-only entry on this version     -> pending_approval
--   changes_requested / approved                       -> as they are
--
-- An academy with no system admin has no moderation step, so a report that is
-- "being checked" there is waiting on the trainer: pending_approval.
--
-- Full note: docs/report-checks.md -> "Stages staff see"
-- ============================================================================

-- ---------------------------------------------------------------------------
-- The reading. A function over the row, so PostgREST serves it as a computed
-- column: `select=*,report_stage` and `report_stage=eq.moderating` work on the
-- queue the way they would on a column.
--
-- It is also callable as /rpc/report_stage with any row a caller cares to
-- invent, so it trusts only the id: the row is read again, and the caller must
-- be able to read the report. Anyone who cannot gets null; the student whose
-- report it is gets the plain status.
-- ---------------------------------------------------------------------------
create or replace function public.report_stage(_r public.report_submissions)
returns text
language sql
stable
security definer
set search_path to ''
as $$
  select case
    when x.role is null     then null
    when x.role = 'student' then s.status::text
    when s.status in ('changes_requested', 'approved') then s.status::text
    when exists (
      select 1
      from public.report_events e
      where e.report_id = s.id
        and e.staff_only
        and e.version = s.version
    ) then 'pending_approval'
    when exists (
      select 1
      from public.academy_members m
      where m.academy_id = s.academy_id
        and m.status = 'active'
        and m.role = 'admin'
        and m.is_system_admin
    ) then 'moderating'
    else 'pending_approval'
  end
  from public.report_submissions s
  cross join lateral (select app.report_role(s) as role) x
  where s.id = _r.id;
$$;

revoke all on function public.report_stage(public.report_submissions) from public, anon;
grant execute on function public.report_stage(public.report_submissions) to authenticated;

comment on function public.report_stage(public.report_submissions) is
  'Staff reading of a report: moderating / pending_approval / changes_requested / approved. A student, and anyone who cannot read the report, never gets the finer reading.';

-- ---------------------------------------------------------------------------
-- The tiles above the queue, by stage. Its own function: `report_counts`
-- returns a `report_status` column and Student/Academy builds already installed
-- read it, so it is left as it is.
--
-- SECURITY INVOKER like `report_counts`: RLS scopes the rows to the caller's
-- own reports, and `report_stage` reads each one again as a definer.
-- ---------------------------------------------------------------------------
create or replace function public.report_stage_counts(_academy_id uuid)
returns table (stage text, n bigint)
language sql
stable
security invoker
set search_path to ''
as $$
  select public.report_stage(r), count(*)
  from public.report_submissions r
  where r.academy_id = _academy_id
  group by 1;
$$;

revoke all on function public.report_stage_counts(uuid) from public, anon;
grant execute on function public.report_stage_counts(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The thread carries its stage. Everything else is as it was
-- (20261012110000_report_brief.sql); a student's copy has `stage` equal to
-- `status`.
-- ---------------------------------------------------------------------------
create or replace function public.get_report(_report_id uuid)
returns json
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_report public.report_submissions;
  v_role   text;
begin
  select * into v_report from public.report_submissions where id = _report_id;
  if v_report.id is null then raise exception 'Report not found'; end if;

  v_role := app.report_role(v_report);
  if v_role is null then raise exception 'Report not found'; end if;

  return (
    select json_build_object(
      'id', r.id,
      'academy_id', r.academy_id,
      'title', r.title,
      'introduction', r.introduction,
      'objectives', r.objectives,
      'problem_statement', r.problem_statement,
      'status', r.status,
      'stage', public.report_stage(r),
      'version', r.version,
      'auto_assigned', r.auto_assigned,
      'submitted_at', r.submitted_at,
      'reviewed_at', r.reviewed_at,
      'approved_at', r.approved_at,
      'my_role', v_role,
      'student', json_build_object(
        'id', s.id, 'full_name', s.full_name, 'student_no', s.student_no,
        'email', s.email, 'phone', s.phone
      ),
      'course', json_build_object('id', c.id, 'title', c.title, 'code', c.code),
      'instructor', case when i.id is null then null else json_build_object(
        'id', i.id, 'full_name', i.full_name, 'avatar_url', i.avatar_url,
        'email', i.email
      ) end,
      'events', (
        select coalesce(json_agg(
          jsonb_build_object(
            'id', e.id,
            'kind', e.kind,
            'body', e.body,
            'to_status', e.to_status,
            'version', e.version,
            'actor_id', e.actor_id,
            'actor_name', e.actor_name,
            'actor_role', e.actor_role,
            'created_at', e.created_at,
            'files', (
              select coalesce(jsonb_agg(jsonb_build_object(
                'id', f.id, 'file_name', f.file_name,
                'mime_type', f.mime_type, 'size_bytes', f.size_bytes
              ) order by f.created_at), '[]'::jsonb)
              from public.report_files f where f.event_id = e.id
            )
          )
          || case
               when v_role = 'student' then '{}'::jsonb
               else jsonb_build_object('staff_only', e.staff_only)
             end
          order by e.created_at
        ), '[]'::json)
        from public.report_events e
        where e.report_id = r.id
          and (v_role <> 'student' or not e.staff_only)
      )
    )
    from public.report_submissions r
    join public.students s on s.id = r.student_id
    join public.courses  c on c.id = r.course_id
    left join public.instructors i on i.id = r.instructor_id
    where r.id = _report_id
  );
end;
$$;
