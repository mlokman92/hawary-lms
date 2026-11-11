-- LPKC: no "Approved" (Nov 2026, the owner). A part ends at "Correction
-- complete" (`changes_requested`); staff can no longer approve, so the Approve /
-- Reopen button is gone from the clients and the server refuses an explicit
-- `approved`. The enum value stays (dropping one is a table rewrite) and the
-- few rows already approved — all in the App Store demo academy — are left.
-- See docs/report-checks.md.

create or replace function public.comment_on_report(
  _report_id uuid,
  _body text,
  _to_status public.report_status default null,
  _files jsonb default null
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_report   public.report_submissions;
  v_role     text;
  v_name     text;
  v_explicit public.report_status;
  v_handoff  boolean;
  v_waiting  boolean;
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

  -- One send per part: a student's document came with the send, never later.
  if v_role = 'student' and v_files then
    raise exception 'Documents are sent once, with the LPKC itself';
  end if;

  v_explicit := case when v_role = 'student' then null else _to_status end;

  -- There is no approval: a part ends at "Correction complete".
  if v_explicit = 'approved' then
    raise exception 'LPKC parts are not approved; the correction completes them';
  end if;

  v_handoff := v_role = 'admin'
               and v_explicit is null
               and app.is_system_admin(v_report.academy_id);

  v_waiting := v_role = 'student'
               and v_report.status = 'in_review'
               and not exists (
                 select 1 from public.report_events e
                 where e.report_id = _report_id
                   and e.version   = v_report.version
                   and e.staff_only
               );

  -- A student's reply never moves the status: a question after the
  -- correction is complete leaves it complete.
  v_next := case
    when v_explicit is not null       then v_explicit
    when v_handoff                    then v_report.status
    when v_report.status = 'approved' then v_report.status
    when v_role = 'student'           then v_report.status
    else 'changes_requested'::public.report_status
  end;

  v_status := case when v_next is distinct from v_report.status then v_next end;

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
    case
      when v_body is null and not v_files
        then 'status'::public.report_event_kind
      else 'comment'::public.report_event_kind
    end,
    v_body, v_status,
    v_report.version, v_uid,
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
    perform app.notify_report(_report_id, 'report_submitted', v_uid, false, true);
  else
    update public.report_submissions
       set status      = v_next,
           reviewed_at = case when v_role = 'student' then reviewed_at else now() end,
           approved_at = case when v_status = 'approved' then now() else approved_at end
     where id = _report_id;

    -- Two IFs, not one AND: SQL does not promise to stop at a false v_waiting.
    if v_waiting then
      v_waiting := app.notify_report_admins(_report_id, v_uid, 'report_comment') > 0;
    end if;

    if not v_waiting then
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
  end if;

  return json_build_object(
    'id', v_event,
    'status', v_next,
    'role', v_role
  );
end;
$$;
