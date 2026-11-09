-- ============================================================================
-- The student sees the copy once their checker has answered it (owner, 2026-11-09).
-- ----------------------------------------------------------------------------
-- A staff-only entry (the "Hawary Academy LMS" copy, 20261009100000) was hidden
-- from the student for good. The owner reversed that: the corrected document is
-- for the student, and hiding it left trainers telling students their report had
-- been corrected while the student had nothing to open.
--
-- The entry stays staff-only while the report is pending trainer approval, so
-- the trainer still sees it first. It opens to the student the moment a staff
-- member (the checker, or an admin) writes a visible entry on the same version
-- after it - a reply, or Approve / Reopen. A student's own reply does not count,
-- and a later version does not hide it again.
--
-- One rule, four places that read it, so none can drift:
--   report_events / report_files SELECT policies (a student's JWT reads them
--   straight from PostgREST), get_report (which now carries `staff_only` to the
--   student too, so the entry reads "Hawary Academy LMS"), report_download.
-- report_stage, comment_on_report and the notices are unchanged.
-- ============================================================================

create or replace function app.report_copy_answered(
  _report_id uuid, _version integer, _staff_only boolean, _created_at timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not _staff_only or exists (
    select 1 from public.report_events x
    where x.report_id = _report_id
      and x.version is not distinct from _version
      and not x.staff_only
      and x.actor_role in ('instructor', 'admin')
      and x.created_at > _created_at
  );
$$;

comment on function app.report_copy_answered(uuid, integer, boolean, timestamptz) is
  'True for an ordinary entry, and for a staff-only entry once a staff member wrote a visible entry after it on the same version. The test that lets a student read the copy.';

alter policy "report events: follow the report" on public.report_events
  using (exists (
    select 1 from public.report_submissions r
    where r.id = report_events.report_id
      and (not report_events.staff_only
           or not app.owns_student(r.student_id)
           or app.report_copy_answered(report_events.report_id, report_events.version,
                                       report_events.staff_only, report_events.created_at))
  ));

alter policy "report files: follow the report" on public.report_files
  using (exists (
    select 1 from public.report_submissions r
    join public.report_events e on e.id = report_files.event_id
    where r.id = report_files.report_id
      and (not e.staff_only
           or not app.owns_student(r.student_id)
           or app.report_copy_answered(e.report_id, e.version, e.staff_only, e.created_at))
  ));

create or replace function public.report_download(_file_id uuid)
returns table(file_path text, file_name text, mime_type text)
language sql
stable
security definer
set search_path = ''
as $$
  select f.file_path, f.file_name, f.mime_type
  from public.report_files f
  join public.report_submissions r on r.id = f.report_id
  join public.report_events e on e.id = f.event_id
  where f.id = _file_id
    and (
      app.is_admin(r.academy_id)
      or app.owns_instructor(r.instructor_id)
      or (app.owns_student(r.student_id)
          and app.report_copy_answered(e.report_id, e.version, e.staff_only, e.created_at))
    );
$$;

create or replace function public.get_report(_report_id uuid)
returns json
language plpgsql
stable
security definer
set search_path = ''
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
      'lpkc_stage', r.lpkc_stage,
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
            'staff_only', e.staff_only,
            'files', (
              select coalesce(jsonb_agg(jsonb_build_object(
                'id', f.id, 'file_name', f.file_name,
                'mime_type', f.mime_type, 'size_bytes', f.size_bytes
              ) order by f.created_at), '[]'::jsonb)
              from public.report_files f where f.event_id = e.id
            )
          )
          order by e.created_at
        ), '[]'::json)
        from public.report_events e
        where e.report_id = r.id
          and (v_role <> 'student'
               or app.report_copy_answered(e.report_id, e.version, e.staff_only, e.created_at))
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
