-- ============================================================================
-- 0024 · Invitation hardening + instructor role revocation.
--
-- Closes a verified privilege-escalation path: `authenticated` held table-wide
-- UPDATE on academy_invitations, the "invitations: staff update" policy had no
-- column restriction, and accept_invitation takes inv.role verbatim into a
-- monotonic role ladder. So any TRAINER could rewrite a pending invitation to
-- role='admin' with an email they control, accept it, and become an admin.
-- Exposure was nil only because no trainer exists yet — which is exactly what
-- the grading work introduces.
--
-- Fix shape: clients get NO direct DML on academy_invitations. Every mutation
-- goes through a SECURITY DEFINER RPC that can only touch status / token /
-- expires_at, never role, email, academy_id, student_id or instructor_id.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Take direct DML away from clients
-- ---------------------------------------------------------------------------
-- No client code writes this table today: apps/web only SELECTs it (the
-- dashboard tile) and calls create_invitation / create_instructor_invitation /
-- accept_invitation, all SECURITY DEFINER. So this breaks nothing.
drop policy if exists "invitations: staff update" on public.academy_invitations;
drop policy if exists "invitations: staff delete" on public.academy_invitations;

revoke insert, update, delete on public.academy_invitations from authenticated, anon;

-- Exactly one of student_id / instructor_id. Both RPCs already guarantee this;
-- the constraint stops a future writer from inventing a third shape (and makes
-- accept_invitation's else-branch provably dead).
alter table public.academy_invitations
  add constraint academy_invitations_subject_check
  check (num_nonnulls(student_id, instructor_id) = 1);

-- ---------------------------------------------------------------------------
-- 2. Narrow mutation RPCs
-- ---------------------------------------------------------------------------
create or replace function public.revoke_invitation(_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.academy_invitations;
begin
  select * into inv from public.academy_invitations where id = _invitation_id;
  if not found then raise exception 'Invitation not found'; end if;
  if not app.is_staff(inv.academy_id) then raise exception 'Not authorized'; end if;
  if inv.status <> 'pending' then
    raise exception 'Only a pending invitation can be revoked';
  end if;

  update public.academy_invitations
    set status = 'revoked'
    where id = _invitation_id;
end;
$$;

-- Re-issues the SAME invitation with a fresh token and expiry. create_invitation
-- revokes any prior pending invite, so using it to "resend" silently kills the
-- link already sitting in the invitee's inbox; this does not.
create or replace function public.resend_invitation(_invitation_id uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv       public.academy_invitations;
  new_token text;
begin
  select * into inv from public.academy_invitations where id = _invitation_id;
  if not found then raise exception 'Invitation not found'; end if;
  if not app.is_staff(inv.academy_id) then raise exception 'Not authorized'; end if;
  if inv.status not in ('pending', 'expired') then
    raise exception 'This invitation can no longer be resent';
  end if;

  new_token := encode(extensions.gen_random_bytes(24), 'hex');

  update public.academy_invitations
    set token      = new_token,
        status     = 'pending',
        expires_at = now() + interval '14 days'
    where id = _invitation_id;

  return json_build_object('id', _invitation_id, 'token', new_token);
end;
$$;

revoke all on function public.revoke_invitation(uuid) from public, anon;
grant execute on function public.revoke_invitation(uuid) to authenticated;
revoke all on function public.resend_invitation(uuid) from public, anon;
grant execute on function public.resend_invitation(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Creation RPCs: admin-gated instructors, archived records rejected
-- ---------------------------------------------------------------------------
-- create_instructor_invitation moves from is_staff to is_admin: on the old gate
-- a trainer could create an instructor record with an email they control and
-- invite it, minting a second trainer. Self-service staff growth.
create or replace function public.create_instructor_invitation(_instructor_id uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  ins       public.instructors;
  new_token text;
  inv_id    uuid;
begin
  select * into ins from public.instructors where id = _instructor_id;
  if not found then raise exception 'Instructor not found'; end if;
  if not app.is_admin(ins.academy_id) then
    raise exception 'Only an academy admin can invite an instructor';
  end if;
  if ins.archived_at is not null then
    raise exception 'This instructor record is archived';
  end if;
  if ins.email is null or ins.email = '' then
    raise exception 'This instructor has no email to invite';
  end if;
  if ins.user_id is not null then
    raise exception 'This instructor already has a linked account';
  end if;

  new_token := encode(extensions.gen_random_bytes(24), 'hex');

  update public.academy_invitations
    set status = 'revoked'
    where instructor_id = _instructor_id and status = 'pending';

  insert into public.academy_invitations (academy_id, instructor_id, email, role, token, invited_by)
    values (ins.academy_id, ins.id, ins.email, 'trainer', new_token, (select auth.uid()))
    returning id into inv_id;

  return json_build_object('id', inv_id, 'token', new_token);
end;
$$;

create or replace function public.create_invitation(_student_id uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  s         public.students;
  new_token text;
  inv_id    uuid;
begin
  select * into s from public.students where id = _student_id;
  if not found then raise exception 'Student not found'; end if;
  if not app.is_staff(s.academy_id) then raise exception 'Not authorized'; end if;
  if s.archived_at is not null then
    raise exception 'This student record is archived';
  end if;
  if s.email is null or s.email = '' then
    raise exception 'This student has no email to invite';
  end if;
  if s.user_id is not null then
    raise exception 'This student already has a linked account';
  end if;

  new_token := encode(extensions.gen_random_bytes(24), 'hex');

  update public.academy_invitations
    set status = 'revoked'
    where student_id = _student_id and status = 'pending';

  insert into public.academy_invitations (academy_id, student_id, email, role, token, invited_by)
    values (s.academy_id, s.id, s.email, 'student', new_token, (select auth.uid()))
    returning id into inv_id;

  return json_build_object('id', inv_id, 'token', new_token);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. accept_invitation: reject archived records, kill the dead else-branch
-- ---------------------------------------------------------------------------
create or replace function public.accept_invitation(_token text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv          public.academy_invitations;
  caller       uuid := (select auth.uid());
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
          and archived_at is null
          and (user_id is null or user_id = caller);
      if not found then
        raise exception 'This student record is archived or already linked to another account';
      end if;
    exception when unique_violation then
      raise exception 'Your account is already linked to a student in this academy';
    end;
  elsif inv.instructor_id is not null then
    begin
      update public.instructors
        set user_id = caller
        where id = inv.instructor_id and academy_id = inv.academy_id
          and archived_at is null
          and (user_id is null or user_id = caller);
      if not found then
        raise exception 'This instructor record is archived or already linked to another account';
      end if;
    exception when unique_violation then
      raise exception 'Your account is already linked to an instructor in this academy';
    end;
  else
    -- Unreachable given academy_invitations_subject_check; fail loudly rather
    -- than fabricating a students row with student_no = '' as before.
    raise exception 'Malformed invitation: no student or instructor';
  end if;

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

-- ---------------------------------------------------------------------------
-- 5. Trainer role revocation
-- ---------------------------------------------------------------------------
-- Nothing linked academy_members back to instructors, so archiving, unlinking
-- or deleting an instructor left role='trainer' status='active' forever and
-- app.is_staff kept returning true. Demote when the last active linked
-- instructor record for that user goes away. Admins are never demoted.
create or replace function app.sync_instructor_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user    uuid := old.user_id;
  v_academy uuid := old.academy_id;
begin
  if v_user is null then return null; end if;

  if not exists (
    select 1 from public.instructors i
    where i.academy_id = v_academy
      and i.user_id    = v_user
      and i.archived_at is null
  ) then
    update public.academy_members
      set role = 'student'::app.user_role
      where academy_id = v_academy
        and user_id    = v_user
        and role       = 'trainer';
  end if;

  return null;
end;
$$;

create trigger sync_instructor_membership
  after update of user_id, archived_at or delete on public.instructors
  for each row execute function app.sync_instructor_membership();
