-- ============================================================================
-- 0009 · Fix accept_invitation role upgrades.
--   The membership upsert used `on conflict (academy_id, user_id) do nothing`,
--   so a caller who was ALREADY a member of the academy (e.g. a student) and
--   then accepts a staff invite (instructor -> trainer) in the SAME academy kept
--   their old role while the RPC still returned status 'accepted' — the UI said
--   "You're in!" but they never actually became staff.
--   Fix: upsert the membership to the HIGHER-privilege role (admin > trainer >
--   student), never downgrading, and reactivate the membership on accept.
--   Everything else is copied verbatim from migration 0008.
-- ============================================================================

create or replace function public.accept_invitation(_token text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.academy_invitations;
  caller uuid := (select auth.uid());
  caller_email text;
begin
  if caller is null then raise exception 'You must be signed in to accept'; end if;

  select * into inv from public.academy_invitations where token = _token;
  if not found then raise exception 'Invitation not found'; end if;

  if inv.status = 'accepted' and inv.accepted_user_id = caller then
    return json_build_object('academy_id', inv.academy_id, 'status', 'already_accepted');
  end if;
  if inv.status <> 'pending' then raise exception 'This invitation is no longer valid'; end if;
  if inv.expires_at < now() then
    update public.academy_invitations set status = 'expired' where id = inv.id;
    raise exception 'This invitation has expired';
  end if;

  select email into caller_email from auth.users where id = caller;
  if lower(coalesce(caller_email, '')) <> lower(inv.email) then
    raise exception 'Please sign in with the invited email address (%)', inv.email;
  end if;

  if inv.student_id is not null then
    begin
      update public.students
        set user_id = caller
        where id = inv.student_id and academy_id = inv.academy_id
          and (user_id is null or user_id = caller);
      if not found then
        raise exception 'This student record is already linked to another account';
      end if;
    exception when unique_violation then
      raise exception 'Your account is already linked to a student in this academy';
    end;
  elsif inv.instructor_id is not null then
    begin
      update public.instructors
        set user_id = caller
        where id = inv.instructor_id and academy_id = inv.academy_id
          and (user_id is null or user_id = caller);
      if not found then
        raise exception 'This instructor record is already linked to another account';
      end if;
    exception when unique_violation then
      raise exception 'Your account is already linked to an instructor in this academy';
    end;
  else
    insert into public.students (academy_id, email, user_id, student_no, status)
      values (inv.academy_id, inv.email, caller, '', 'active');
  end if;

  -- Upsert membership to the higher-privilege role (admin > trainer > student);
  -- never downgrade an existing role. Do NOT override a deliberate admin
  -- suspension — only (re)activate rows that aren't suspended.
  insert into public.academy_members (academy_id, user_id, role, status)
    values (inv.academy_id, caller, inv.role, 'active')
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

  update public.academy_invitations
    set status = 'accepted', accepted_user_id = caller, accepted_at = now()
    where id = inv.id;

  return json_build_object('academy_id', inv.academy_id, 'status', 'accepted');
end;
$$;
revoke execute on function public.accept_invitation(text) from public, anon;
grant execute on function public.accept_invitation(text) to authenticated;
