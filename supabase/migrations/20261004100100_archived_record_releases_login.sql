-- ============================================================================
-- An archived record releases its login
-- ----------------------------------------------------------------------------
-- One login backs at most one student (and one instructor) per academy —
-- `unique (academy_id, user_id)`. Archiving a record left `user_id` on it, so
-- the login stayed spent on a record nobody can use:
--
--   * /learn requires an unarchived record, so it said "not linked yet";
--   * `my_pending_invitations` hid every fresh record for that email, because
--     its "already has a record here" test counted the archived one;
--   * accepting the fresh record's emailed link hit the unique constraint.
--
-- Found on 2026-10-04: a test login tied to an archived record could not
-- claim the new record created for it, and the invitation email it received
-- led nowhere. Any real student re-created after an archive was in the same
-- trap.
--
-- The fix keeps archived history intact — attempts, submissions, invoices and
-- payments hang off `student_id`, never the account — and lets a claim move the
-- login: `link_claimed_record` releases the caller's *archived* records in that
-- academy before linking the new one. An unarchived record still blocks, so a
-- login can never silently hop between two live records.
-- ============================================================================

create or replace function app.link_claimed_record(
  _kind text, _record_id uuid, _academy uuid, _role app.user_role, _caller uuid
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if _kind = 'student' then
    -- Free the login from any archived record here, so the unique
    -- (academy_id, user_id) check below only sees live ones.
    update public.students
      set user_id = null
      where academy_id = _academy and user_id = _caller
        and archived_at is not null and id <> _record_id;
    begin
      update public.students
        set user_id = _caller
        where id = _record_id and academy_id = _academy
          and archived_at is null
          and (user_id is null or user_id = _caller);
      if not found then
        raise exception 'This student record is archived or already linked to another account';
      end if;
    exception when unique_violation then
      raise exception 'Your account is already linked to a student in this academy';
    end;
  elsif _kind = 'instructor' then
    update public.instructors
      set user_id = null
      where academy_id = _academy and user_id = _caller
        and archived_at is not null and id <> _record_id;
    begin
      update public.instructors
        set user_id = _caller
        where id = _record_id and academy_id = _academy
          and archived_at is null
          and (user_id is null or user_id = _caller);
      if not found then
        raise exception 'This instructor record is archived or already linked to another account';
      end if;
    exception when unique_violation then
      raise exception 'Your account is already linked to an instructor in this academy';
    end;
  else
    raise exception 'Malformed invitation: no student or instructor';
  end if;

  insert into public.academy_members (academy_id, user_id, role, status)
    values (_academy, _caller, _role, 'active')
    on conflict (academy_id, user_id) do update
      set role = case
        when public.academy_members.role = 'admin'   or excluded.role = 'admin'   then 'admin'::app.user_role
        when public.academy_members.role = 'trainer' or excluded.role = 'trainer' then 'trainer'::app.user_role
        else public.academy_members.role
      end,
      status = case
        when public.academy_members.status = 'suspended' then public.academy_members.status
        else 'active'::public.member_status
      end;
end;
$function$;

-- Offer the fresh record when the only one this login holds here is archived.
create or replace function public.my_pending_invitations()
returns table (
  academy_id uuid, academy_name text, academy_slug text, academy_logo_url text,
  kind text, record_id uuid, role text, invited_at timestamp with time zone
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  caller       uuid := (select auth.uid());
  caller_email text;
begin
  if caller is null then return; end if;

  select lower(u.email) into caller_email
    from auth.users u
    where u.id = caller and u.email_confirmed_at is not null;
  if caller_email is null or caller_email = '' then return; end if;

  return query
    select a.id, a.name, a.slug, a.logo_url,
           'student'::text, s.id, 'student'::text, s.created_at
      from public.students s
      join public.academies a on a.id = s.academy_id
      where s.user_id is null
        and s.archived_at is null
        and lower(s.email) = caller_email
        and not exists (
          select 1 from public.students x
            where x.academy_id = s.academy_id and x.user_id = caller
              and x.archived_at is null
        )
    union all
    select a.id, a.name, a.slug, a.logo_url,
           'instructor'::text, i.id, 'trainer'::text, i.created_at
      from public.instructors i
      join public.academies a on a.id = i.academy_id
      where i.user_id is null
        and i.archived_at is null
        and lower(i.email) = caller_email
        and not exists (
          select 1 from public.instructors y
            where y.academy_id = i.academy_id and y.user_id = caller
              and y.archived_at is null
        )
    order by 8 desc;
end;
$function$;
