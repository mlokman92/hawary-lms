-- ============================================================================
-- System admins, and the annotated copy a checker starts from
-- ----------------------------------------------------------------------------
-- 1. A new access level. A SYSTEM ADMIN is a Director whose
--    `academy_members.is_system_admin` is also true. Because the row is still a
--    Director's, every Director gate already lets them through — nothing that
--    reads `is_director` changes. The flag is the owner's to set, in SQL, the
--    same way the Director flag is.
--
-- 2. Who hears about a report, and when. Until now the assigned checker was
--    told the moment a student sent a report. Now, in an academy that has a
--    system admin:
--
--      student sends (or sends again)   -> the system admins are told
--      a system admin adds a copy       -> the checker is told
--      the checker replies              -> "changes needed"; the student is told
--
--    The copy is an entry on the thread that only staff can read
--    (`report_events.staff_only`). It moves nothing: the report stays "being
--    checked", and from the student's side nothing has happened between
--    sending the report and hearing back from their checker.
--
--    An academy with no system admin keeps the old behaviour — the checker is
--    told at once — so a report can never arrive with nobody told.
--
-- Full note: docs/report-checks.md, docs/single-owner.md
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The flag
-- ---------------------------------------------------------------------------
alter table public.academy_members
  add column if not exists is_system_admin boolean not null default false;

alter table public.academy_members
  add constraint academy_members_system_admin_is_director
  check (not is_system_admin or (role = 'admin' and is_director));

-- The guard that keeps `is_director` the owner's now keeps both flags.
create or replace function app.guard_member_director()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  -- Leaving the admin role ends Director status, whoever makes the change —
  -- and a system admin is a Director first, so that ends with it.
  if tg_op = 'UPDATE' and new.role <> 'admin' then
    if old.is_director then new.is_director := false; end if;
    if old.is_system_admin then new.is_system_admin := false; end if;
  end if;

  if (select auth.uid()) is null then return new; end if;

  if tg_op = 'INSERT' and new.is_director then
    raise exception 'Directors are appointed by the owner, not through the app';
  end if;
  if tg_op = 'INSERT' and new.is_system_admin then
    raise exception 'System admins are appointed by the owner, not through the app';
  end if;
  -- Any other change to either flag from a JWT — granting it, or clearing it
  -- without leaving the admin role — is the owner's.
  if tg_op = 'UPDATE'
     and new.is_director is distinct from old.is_director
     and not (old.is_director and new.role <> 'admin') then
    raise exception 'Directors are appointed by the owner, not through the app';
  end if;
  if tg_op = 'UPDATE'
     and new.is_system_admin is distinct from old.is_system_admin
     and not (old.is_system_admin and new.role <> 'admin') then
    raise exception 'System admins are appointed by the owner, not through the app';
  end if;
  return new;
end;
$function$;

create or replace function app.is_system_admin(_academy_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (
    select 1
    from public.academy_members m
    where m.academy_id = _academy_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role = 'admin'
      and m.is_system_admin
  );
$$;

revoke all on function app.is_system_admin(uuid) from public, anon, authenticated;

-- The owner's appointment. Only where the account is already a Director.
update public.academy_members m
   set is_system_admin = true
  from auth.users u
 where u.id = m.user_id
   and lower(u.email) = 'muhamadlokman92@gmail.com'
   and m.role = 'admin'
   and m.is_director;

-- ---------------------------------------------------------------------------
-- 2. An entry only staff can read
-- ---------------------------------------------------------------------------
alter table public.report_events
  add column if not exists staff_only boolean not null default false;

comment on column public.report_events.staff_only is
  'Staff can read this entry and its files; the student whose report it is cannot.';

-- The policies still follow the report, with one more test: the student does
-- not see a staff-only entry. A staff JWT plus the publishable key reads these
-- tables straight from PostgREST, and so does a student's, so leaving the
-- entry out of get_report alone would have hidden nothing.
alter policy "report events: follow the report" on public.report_events
  using (exists (
    select 1 from public.report_submissions r
    where r.id = report_events.report_id
      and (not report_events.staff_only or not app.owns_student(r.student_id))
  ));

-- A file belongs to its entry, so it is hidden with it. The join is a positive
-- one on purpose: for a student the staff-only entry is not readable either,
-- so no row comes back — a "not exists" over a table the reader cannot see
-- would have said yes.
alter policy "report files: follow the report" on public.report_files
  using (exists (
    select 1
    from public.report_submissions r
    join public.report_events e on e.id = report_files.event_id
    where r.id = report_files.report_id
      and (not e.staff_only or not app.owns_student(r.student_id))
  ));

-- ---------------------------------------------------------------------------
-- Tell the academy's system admins about a submission.
--
-- Written as the checker's notice — the same kind, the same payload, the
-- checker's side of the thread — because it is the same event read by somebody
-- else. Returns how many were told, so the caller can fall back to the checker
-- when the academy has none.
-- ---------------------------------------------------------------------------
create or replace function app.notify_report_system_admins(
  _report_id uuid,
  _actor     uuid
) returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_academy  uuid;
  v_title    text;
  v_status   public.report_status;
  v_course   text;
  v_stu_name text;
  v_user     uuid;
  v_n        integer := 0;
begin
  select r.academy_id, r.title, r.status, c.title, s.full_name
    into v_academy, v_title, v_status, v_course, v_stu_name
  from public.report_submissions r
  join public.students s on s.id = r.student_id
  join public.courses  c on c.id = r.course_id
  where r.id = _report_id;

  if v_academy is null then return 0; end if;

  for v_user in
    select m.user_id
    from public.academy_members m
    where m.academy_id = v_academy
      and m.status = 'active'
      and m.role = 'admin'
      and m.is_system_admin
      and m.user_id is distinct from _actor
  loop
    perform app.notify(v_academy, v_user, 'report_submitted', jsonb_build_object(
      'report_id', _report_id,
      'role',      'instructor',
      'with_name', v_stu_name,
      'course',    v_course,
      'title',     v_title,
      'status',    v_status
    ));
    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$$;

revoke all on function app.notify_report_system_admins(uuid, uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Submit, or submit again. Unchanged but for who is told.
-- ---------------------------------------------------------------------------
create or replace function public.submit_report(
  _academy_id uuid,
  _course_id  uuid,
  _title      text,
  _files      jsonb
) returns json
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_student uuid;
  v_name    text;
  v_report  public.report_submissions;
  v_id      uuid;
  v_version integer;
  v_event   uuid;
  v_cand    uuid;
  v_auto    boolean := false;
  v_file    jsonb;
  v_new     boolean;
begin
  if v_uid is null then raise exception 'You must be signed in'; end if;

  v_student := app.my_active_student(_academy_id);
  if v_student is null then
    raise exception 'You do not have a student record in this academy';
  end if;

  if jsonb_typeof(_files) <> 'array' or jsonb_array_length(_files) = 0 then
    raise exception 'Attach at least one file';
  end if;

  if coalesce(btrim(_title), '') = '' then
    raise exception 'Say what you are sending for checking';
  end if;

  -- The enrolment is the entitlement. 'completed' counts: a student finishing
  -- the course does not stop their final report needing a look.
  if not exists (
    select 1 from public.enrollments e
    where e.academy_id = _academy_id
      and e.course_id  = _course_id
      and e.student_id = v_student
      and e.status in ('active', 'completed')
  ) then
    raise exception 'You are not enrolled on that course';
  end if;

  select * into v_report
  from public.report_submissions r
  where r.academy_id = _academy_id
    and r.student_id = v_student
    and r.course_id  = _course_id;

  v_new := v_report.id is null;

  if v_new then
    -- The pool IS the switch: no checkers means the academy does not run this.
    select c.instructor_id into v_cand
    from app.report_checkers(_academy_id) c
    limit 1;
    if v_cand is null then
      raise exception 'This academy is not accepting reports for checking yet';
    end if;
    v_auto := true;

    insert into public.report_submissions (
      academy_id, student_id, course_id, instructor_id, title,
      status, version, auto_assigned, submitted_at, created_by
    ) values (
      _academy_id, v_student, _course_id, v_cand, btrim(_title),
      'in_review', 1, true, now(), v_uid
    )
    returning id, version into v_id, v_version;
  else
    if v_report.status = 'approved' then
      raise exception 'That report has already been approved';
    end if;
    v_id      := v_report.id;
    v_version := v_report.version + 1;

    update public.report_submissions
       set version      = v_version,
           status       = 'in_review',
           title        = btrim(_title),
           submitted_at = now()
     where id = v_id;
  end if;

  select s.full_name into v_name from public.students s where s.id = v_student;

  insert into public.report_events (
    academy_id, report_id, kind, to_status, version,
    actor_id, actor_name, actor_role
  ) values (
    _academy_id, v_id, 'submitted', 'in_review', v_version,
    v_uid, v_name, 'student'
  )
  returning id into v_event;

  for v_file in select * from jsonb_array_elements(_files) loop
    perform app.assert_own_upload(_academy_id, v_file ->> 'path');
    insert into public.report_files (
      academy_id, report_id, event_id, version,
      file_path, file_name, mime_type, size_bytes
    ) values (
      _academy_id, v_id, v_event, v_version,
      v_file ->> 'path',
      coalesce(nullif(btrim(v_file ->> 'name'), ''), 'document'),
      v_file ->> 'mime',
      nullif(v_file ->> 'size', '')::bigint
    );
  end loop;

  -- In the same transaction as the insert, which is what makes this more
  -- reliable than the email: if the submission exists, so does the notice.
  -- The system admins hear first; the checker is told when the copy is added
  -- (comment_on_report). With no system admin, the checker is told now.
  if app.notify_report_system_admins(v_id, v_uid) = 0 then
    perform app.notify_report(v_id, 'report_submitted', v_uid, false, true);
  end if;

  return json_build_object(
    'id', v_id,
    'version', v_version,
    'is_new', v_new,
    'auto_assigned', v_auto
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Say something, and let the status follow.
-- ---------------------------------------------------------------------------
create or replace function public.comment_on_report(
  _report_id uuid,
  _body      text,
  _to_status public.report_status default null,
  _files     jsonb default null
) returns json
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_report   public.report_submissions;
  v_role     text;
  v_name     text;
  v_explicit public.report_status;
  v_handoff  boolean;
  v_next     public.report_status;
  v_status   public.report_status;
  v_event    uuid;
  v_file     jsonb;
  v_body     text := nullif(btrim(_body), '');
  v_files    boolean := _files is not null
                        and jsonb_typeof(_files) = 'array'
                        and jsonb_array_length(_files) > 0;
begin
  if v_uid is null then raise exception 'You must be signed in'; end if;

  select * into v_report from public.report_submissions where id = _report_id;
  if v_report.id is null then raise exception 'Report not found'; end if;

  v_role := app.report_role(v_report);
  if v_role is null then raise exception 'Report not found'; end if;

  -- Staff may decide; a student's _to_status is dropped on the floor.
  v_explicit := case when v_role = 'student' then null else _to_status end;

  -- A system admin who is not the checker writes for the checker, not for the
  -- student: the copy the checker starts from. It is not a reply, so it moves
  -- nothing, the student is not told and cannot read it — and it is the moment
  -- the checker is told. A decision (approve, reopen) is still a decision.
  v_handoff := v_role = 'admin'
               and v_explicit is null
               and app.is_system_admin(v_report.academy_id);

  -- Where the report stands after this. A decision wins; otherwise the status
  -- follows whoever is speaking, and an approved report stays approved.
  v_next := case
    when v_explicit is not null       then v_explicit
    when v_handoff                    then v_report.status
    when v_report.status = 'approved' then v_report.status
    when v_role = 'student'           then 'in_review'::public.report_status
    else 'changes_requested'::public.report_status
  end;

  -- What the timeline entry records: the move, or nothing if nothing moved.
  v_status := case when v_next is distinct from v_report.status then v_next end;

  -- Only a decision may arrive with nothing said. Without this an empty post
  -- would be a way to flip the status back and forth.
  if v_body is null and not v_files
     and (v_explicit is null or v_status is null) then
    raise exception 'Write something first';
  end if;

  select p.full_name into v_name from public.profiles p where p.id = v_uid;

  insert into public.report_events (
    academy_id, report_id, kind, body, to_status,
    version, actor_id, actor_name, actor_role, staff_only
  ) values (
    v_report.academy_id, _report_id,
    -- Cast explicitly. Both branches are unknown literals, so CASE resolves to
    -- text, and with search_path = '' there is no implicit text -> enum cast to
    -- rescue it: the insert fails at runtime, not at creation.
    case
      when v_body is null and not v_files
        then 'status'::public.report_event_kind
      else 'comment'::public.report_event_kind
    end,
    v_body, v_status,
    v_report.version, v_uid,
    -- The copy carries no name: it is a document for the checker, not a
    -- message from somebody.
    case when v_handoff then null else v_name end,
    case when v_handoff then 'system' else v_role end,
    v_handoff
  )
  returning id into v_event;

  if v_files then
    for v_file in select * from jsonb_array_elements(_files) loop
      perform app.assert_own_upload(v_report.academy_id, v_file ->> 'path');
      insert into public.report_files (
        academy_id, report_id, event_id, version,
        file_path, file_name, mime_type, size_bytes
      ) values (
        v_report.academy_id, _report_id, v_event, v_report.version,
        v_file ->> 'path',
        coalesce(nullif(btrim(v_file ->> 'name'), ''), 'document'),
        v_file ->> 'mime',
        nullif(v_file ->> 'size', '')::bigint
      );
    end loop;
  end if;

  if v_handoff then
    -- Nothing on the report itself changes — not the status, and not
    -- reviewed_at, which the student's own list reads as "last activity".
    -- The checker is told as they would have been when the report came in.
    perform app.notify_report(_report_id, 'report_submitted', v_uid, false, true);
  else
    update public.report_submissions
       set status      = v_next,
           reviewed_at = case when v_role = 'student' then reviewed_at else now() end,
           approved_at = case when v_status = 'approved' then now() else approved_at end
     where id = _report_id;

    -- The other side, whichever that is. A reply that moved the status on its
    -- own is told as a reply — that is what the reader has to go and read.
    -- Only a decision (approve, reopen) is told as a status.
    perform app.notify_report(
      _report_id,
      case
        when v_explicit is not null and v_status is not null
          then 'report_status'::public.notification_kind
        else 'report_comment'::public.notification_kind
      end,
      v_uid,
      v_role <> 'student',
      v_role = 'student'
    );
  end if;

  return json_build_object(
    'id', v_event,
    'status', v_next,
    'role', v_role
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- The whole thread, for whoever may read it. A student's copy leaves the
-- staff-only entries out, and does not carry the flag at all.
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
      'status', r.status,
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

-- ---------------------------------------------------------------------------
-- May the caller download this file? As before, except that the student may
-- not have a file from an entry they cannot read.
-- ---------------------------------------------------------------------------
create or replace function public.report_download(_file_id uuid)
returns table (file_path text, file_name text, mime_type text)
language sql
stable
security definer
set search_path to ''
as $$
  select f.file_path, f.file_name, f.mime_type
  from public.report_files f
  join public.report_submissions r on r.id = f.report_id
  join public.report_events e on e.id = f.event_id
  where f.id = _file_id
    and (
      app.is_admin(r.academy_id)
      or app.owns_instructor(r.instructor_id)
      or (app.owns_student(r.student_id) and not e.staff_only)
    );
$$;
