-- ============================================================================
-- 0007 · Account linking (invitations + reconciliation) and avatar storage.
--   Identity is global (one profile per email); roles/records are per-academy.
--   Invitations are anchored to a specific student_id so linking is unambiguous
--   even when student emails are duplicated (guardian-shared, etc.). Accepting
--   links that student record to the accepting profile.
-- ============================================================================

create type public.invitation_status as enum ('pending', 'accepted', 'revoked', 'expired');

-- One login can back at most one student record per academy.
create unique index students_academy_user_key
  on public.students (academy_id, user_id) where user_id is not null;

create table public.academy_invitations (
  id               uuid primary key default gen_random_uuid(),
  academy_id       uuid not null references public.academies(id) on delete cascade,
  student_id       uuid,
  email            text not null,
  role             app.user_role not null default 'student',
  token            text not null unique,
  status           public.invitation_status not null default 'pending',
  invited_by       uuid references public.profiles(id) on delete set null,
  accepted_user_id uuid references public.profiles(id) on delete set null,
  accepted_at      timestamptz,
  expires_at       timestamptz not null default (now() + interval '14 days'),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  foreign key (academy_id, student_id)
    references public.students (academy_id, id) on delete cascade
);
create index academy_invitations_academy_id_idx on public.academy_invitations (academy_id);
create index academy_invitations_student_id_idx on public.academy_invitations (student_id);
create index academy_invitations_email_idx      on public.academy_invitations (lower(email));
create trigger set_updated_at before update on public.academy_invitations
  for each row execute function app.set_updated_at();

alter table public.academy_invitations enable row level security;
-- Staff read/revoke their academy's invitations. Creation + acceptance go
-- through the SECURITY DEFINER RPCs below (invitees never read this table).
create policy "invitations: staff view" on public.academy_invitations
  for select to authenticated using (app.is_staff(academy_id));
create policy "invitations: staff update" on public.academy_invitations
  for update to authenticated using (app.is_staff(academy_id)) with check (app.is_staff(academy_id));
create policy "invitations: staff delete" on public.academy_invitations
  for delete to authenticated using (app.is_staff(academy_id));

-- ---------------------------------------------------------------------------
-- RPC: staff creates an invitation for a specific student record.
-- Returns the token so the app can build a shareable accept link.
-- ---------------------------------------------------------------------------
create or replace function public.create_invitation(_student_id uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.students;
  new_token text;
  inv_id uuid;
begin
  select * into s from public.students where id = _student_id;
  if not found then raise exception 'Student not found'; end if;
  if not app.is_staff(s.academy_id) then raise exception 'Not authorized'; end if;
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
revoke execute on function public.create_invitation(uuid) from public;
grant execute on function public.create_invitation(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: the invited person accepts. Links their profile to the student record
-- and grants the membership. Idempotent; email must match the invite.
-- ---------------------------------------------------------------------------
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
  else
    insert into public.students (academy_id, email, user_id, student_no, status)
      values (inv.academy_id, inv.email, caller, '', 'active');
  end if;

  insert into public.academy_members (academy_id, user_id, role, status)
    values (inv.academy_id, caller, inv.role, 'active')
    on conflict (academy_id, user_id) do nothing;

  update public.academy_invitations
    set status = 'accepted', accepted_user_id = caller, accepted_at = now()
    where id = inv.id;

  return json_build_object('academy_id', inv.academy_id, 'status', 'accepted');
end;
$$;
revoke execute on function public.accept_invitation(text) from public;
grant execute on function public.accept_invitation(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Avatar storage: public bucket, staff-scoped writes (path = <academy_id>/...).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
  values ('avatars', 'avatars', true)
  on conflict (id) do nothing;

create policy "avatars: staff insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and app.is_staff(nullif((storage.foldername(name))[1], '')::uuid)
  );
create policy "avatars: staff update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and app.is_staff(nullif((storage.foldername(name))[1], '')::uuid)
  )
  with check (
    bucket_id = 'avatars'
    and app.is_staff(nullif((storage.foldername(name))[1], '')::uuid)
  );
create policy "avatars: staff delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and app.is_staff(nullif((storage.foldername(name))[1], '')::uuid)
  );
