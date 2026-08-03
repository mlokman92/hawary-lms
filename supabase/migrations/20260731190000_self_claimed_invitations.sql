-- ============================================================================
-- 0038 · Self-claimed invitations.
--
-- Before this, joining an academy required staff to mint a per-record token
-- (create_invitation / create_instructor_invitation) and get the link to the
-- person. A CSV import of 200 students left 200 records nobody could sign in
-- to, and a signed-up invitee with no membership was routed to "create your
-- academy" — the founder form — which is a trap for a student.
--
-- The token was never what authorised acceptance: accept_invitation requires
-- lower(auth email) = lower(invitation email). The email match IS the proof.
-- So a record is now claimable directly by the person whose *confirmed* email
-- it carries, and the token flow survives for what it is actually good at:
-- emailed links, shareable URLs, revocation and audit.
--
--   my_pending_invitations()                 -> academies waiting for you
--   accept_pending_invitation(kind, record)  -> claim one
--
-- Both are gated on auth.users.email_confirmed_at: without a token, a verified
-- email is the entire proof of identity. Do not relax that.
--
-- ACCEPTED RISK (product decision, deliberate): instructor records are
-- claimable on the same terms as students. `instructors` INSERT is app.is_staff
-- but create_instructor_invitation is app.is_admin, an asymmetry migration 0024
-- introduced on purpose. Self-claim bypasses it: a trainer can create an
-- instructor record with an email they control and claim it, minting a second
-- trainer account. That is lateral (trainer -> trainer), not escalation — a
-- trainer cannot reach 'admin' this way, because the role here is derived from
-- the record kind and never read from client input. If this needs closing
-- later, the fix is to tighten the `instructors: staff insert` policy to
-- app.is_admin, not to special-case this function.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Shared link + membership body
-- ---------------------------------------------------------------------------
-- Extracted from accept_invitation so the token path and the claim path cannot
-- drift on the parts that matter: the archived/already-linked guards, the
-- monotonic role upsert, and the suspended-stays-suspended rule. Error text is
-- carried over verbatim — apps/web/src/lib/invite.ts matches on these strings
-- to decide whether a failure is terminal.
create or replace function app.link_claimed_record(
  _kind      text,
  _record_id uuid,
  _academy   uuid,
  _role      app.user_role,
  _caller    uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if _kind = 'student' then
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
$$;

revoke all on function app.link_claimed_record(text, uuid, uuid, app.user_role, uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. accept_invitation: same behaviour, now over the shared body
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

  -- The subject check constraint guarantees exactly one of these is set.
  perform app.link_claimed_record(
    case when inv.student_id is not null then 'student' else 'instructor' end,
    coalesce(inv.student_id, inv.instructor_id),
    inv.academy_id,
    inv.role,
    caller
  );

  update public.academy_invitations
    set status = 'accepted', accepted_user_id = caller, accepted_at = now()
    where id = inv.id;

  return json_build_object('academy_id', inv.academy_id, 'status', 'accepted');
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. my_pending_invitations — academies waiting for the caller
-- ---------------------------------------------------------------------------
-- Derived from the records themselves, not from academy_invitations: the point
-- is that a CSV import creates no invitation rows, so a token-shaped list would
-- be empty exactly when it matters. Rows the caller could not claim anyway are
-- filtered out here rather than surfaced and then failing on accept: one login
-- backs at most one student (and one instructor) record per academy.
--
-- Returning the academy's name/slug/logo to a non-member is the intended
-- disclosure — you are being told who is inviting you — and is reachable only
-- by proving control of an email an academy already typed into a record.
create or replace function public.my_pending_invitations()
returns table (
  academy_id       uuid,
  academy_name     text,
  academy_slug     text,
  academy_logo_url text,
  kind             text,
  record_id        uuid,
  role             text,
  invited_at       timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
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
        )
    order by 8 desc;
end;
$$;

revoke all on function public.my_pending_invitations() from public, anon;
grant execute on function public.my_pending_invitations() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. accept_pending_invitation — claim one record
-- ---------------------------------------------------------------------------
-- Takes the record id, not (academy, kind): a student's email is legitimately
-- duplicated across records (guardian-shared inboxes), which is why invitations
-- were anchored to a student_id in the first place. The caller may only ever
-- name a record carrying their own confirmed email, so the id is not a
-- capability — it is a disambiguator.
--
-- `role` is derived from the record kind here and never taken from the client;
-- that is what keeps this off the admin ladder.
create or replace function public.accept_pending_invitation(
  _kind      text,
  _record_id uuid
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller       uuid := (select auth.uid());
  caller_email text;
  v_academy    uuid;
  v_email      text;
  v_role       app.user_role;
begin
  if caller is null then raise exception 'You must be signed in to accept'; end if;
  if _kind not in ('student', 'instructor') then
    raise exception 'Malformed invitation: no student or instructor';
  end if;

  select lower(u.email) into caller_email
    from auth.users u
    where u.id = caller and u.email_confirmed_at is not null;
  if caller_email is null or caller_email = '' then
    raise exception 'Confirm your email address before joining an academy';
  end if;

  if _kind = 'student' then
    select academy_id, lower(email) into v_academy, v_email
      from public.students
      where id = _record_id and archived_at is null and user_id is null;
    v_role := 'student';
  else
    select academy_id, lower(email) into v_academy, v_email
      from public.instructors
      where id = _record_id and archived_at is null and user_id is null;
    v_role := 'trainer';
  end if;

  -- One message for "gone", "archived" and "someone else got there first": the
  -- caller is not entitled to learn which, and the UI just refreshes the list.
  if v_academy is null then raise exception 'Invitation not found'; end if;
  if v_email is null or v_email <> caller_email then
    raise exception 'Please sign in with the invited email address';
  end if;

  perform app.link_claimed_record(_kind, _record_id, v_academy, v_role, caller);

  -- Close any token invitation for the same record, so staff do not keep
  -- chasing a "pending" invite for someone who has already joined.
  update public.academy_invitations
    set status = 'accepted', accepted_user_id = caller, accepted_at = now()
    where status = 'pending'
      and ((_kind = 'student'    and student_id    = _record_id)
        or (_kind = 'instructor' and instructor_id = _record_id));

  return json_build_object('academy_id', v_academy, 'status', 'accepted');
end;
$$;

revoke all on function public.accept_pending_invitation(text, uuid) from public, anon;
grant execute on function public.accept_pending_invitation(text, uuid) to authenticated;
