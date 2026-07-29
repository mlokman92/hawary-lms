-- ============================================================================
-- 0008 · Instructors as academy-managed records (parallel to students).
--   An "instructor" is a record the academy owns (CRM-style) — it does NOT
--   require an auth account. Optional user_id links an instructor to an app
--   login, granted the `trainer` role when the invite is accepted.
--   Also: repoint course_instructors from profiles -> instructors (the table was
--   empty with no UI), and extend the invitation flow to cover instructors.
-- ============================================================================

create type public.instructor_status as enum ('active', 'on_leave', 'inactive');

create table public.instructors (
  id             uuid primary key default gen_random_uuid(),
  academy_id     uuid not null references public.academies(id) on delete cascade,
  instructor_no  text not null,
  full_name      text,
  gender         public.gender,
  ic_number      text,
  date_of_birth  date,
  phone          text,
  email          text,
  avatar_url     text,
  address        text,
  specialization text,
  bio            text,
  status         public.instructor_status not null default 'active',
  user_id        uuid references public.profiles(id) on delete set null,
  archived_at    timestamptz,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (academy_id, instructor_no),
  unique (academy_id, id)
);
create index instructors_academy_id_idx on public.instructors (academy_id);
create index instructors_user_id_idx    on public.instructors (user_id);
create index instructors_created_by_idx on public.instructors (created_by);
create index instructors_status_idx     on public.instructors (academy_id, status);
-- One login can back at most one instructor record per academy.
create unique index instructors_academy_user_key
  on public.instructors (academy_id, user_id) where user_id is not null;

-- Assign a unique instructor_no per academy on insert (reuses the shared code
-- generator app.gen_student_no(); it only produces a random 8-char code).
create or replace function app.set_instructor_no()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate text;
  tries int := 0;
begin
  if new.instructor_no is not null and new.instructor_no <> '' then
    return new;
  end if;
  loop
    candidate := app.gen_student_no();
    exit when not exists (
      select 1 from public.instructors i
      where i.academy_id = new.academy_id and i.instructor_no = candidate
    );
    tries := tries + 1;
    if tries > 25 then
      raise exception 'Could not generate a unique instructor number';
    end if;
  end loop;
  new.instructor_no := candidate;
  return new;
end;
$$;
create trigger set_instructor_no before insert on public.instructors
  for each row execute function app.set_instructor_no();
create trigger set_updated_at before update on public.instructors
  for each row execute function app.set_updated_at();

-- Does the current auth user own this instructor record (via the app-account link)?
create or replace function app.owns_instructor(_instructor_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.instructors i
    where i.id = _instructor_id and i.user_id = (select auth.uid())
  );
$$;

alter table public.instructors enable row level security;

create policy "instructors: staff manage, instructor view own"
  on public.instructors for select to authenticated
  using (app.is_staff(academy_id) or user_id = (select auth.uid()));
create policy "instructors: staff insert" on public.instructors for insert to authenticated
  with check (app.is_staff(academy_id));
create policy "instructors: staff update" on public.instructors for update to authenticated
  using (app.is_staff(academy_id)) with check (app.is_staff(academy_id));
create policy "instructors: admins delete" on public.instructors for delete to authenticated
  using (app.is_admin(academy_id));

-- ---------------------------------------------------------------------------
-- Repoint course_instructors: profiles -> instructors. The table was empty and
-- had no UI, so no data migration is needed. RLS policies are on the table and
-- don't reference the column, so they survive the rename.
-- ---------------------------------------------------------------------------
alter table public.course_instructors drop constraint if exists course_instructors_user_id_fkey;
alter table public.course_instructors drop constraint if exists course_instructors_course_id_user_id_key;
drop index if exists course_instructors_user_id_idx;
alter table public.course_instructors rename column user_id to instructor_id;
alter table public.course_instructors
  add constraint course_instructors_academy_id_instructor_id_fkey
  foreign key (academy_id, instructor_id)
  references public.instructors (academy_id, id) on delete cascade;
alter table public.course_instructors
  add constraint course_instructors_course_id_instructor_id_key unique (course_id, instructor_id);
create index course_instructors_instructor_id_idx on public.course_instructors (instructor_id);

-- ---------------------------------------------------------------------------
-- Extend invitations to cover instructor records (accepting grants `trainer`).
-- ---------------------------------------------------------------------------
alter table public.academy_invitations
  add column instructor_id uuid,
  add constraint academy_invitations_academy_id_instructor_id_fkey
    foreign key (academy_id, instructor_id)
    references public.instructors (academy_id, id) on delete cascade;
create index academy_invitations_instructor_id_idx on public.academy_invitations (instructor_id);

-- RPC: staff creates an invitation for a specific instructor record.
create or replace function public.create_instructor_invitation(_instructor_id uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  ins public.instructors;
  new_token text;
  inv_id uuid;
begin
  select * into ins from public.instructors where id = _instructor_id;
  if not found then raise exception 'Instructor not found'; end if;
  if not app.is_staff(ins.academy_id) then raise exception 'Not authorized'; end if;
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
revoke execute on function public.create_instructor_invitation(uuid) from public, anon;
grant execute on function public.create_instructor_invitation(uuid) to authenticated;

-- RPC: the invited person accepts. Now handles student OR instructor records
-- (and the email-only fallback that creates a student). Idempotent.
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

  insert into public.academy_members (academy_id, user_id, role, status)
    values (inv.academy_id, caller, inv.role, 'active')
    on conflict (academy_id, user_id) do nothing;

  update public.academy_invitations
    set status = 'accepted', accepted_user_id = caller, accepted_at = now()
    where id = inv.id;

  return json_build_object('academy_id', inv.academy_id, 'status', 'accepted');
end;
$$;
revoke execute on function public.accept_invitation(text) from public, anon;
grant execute on function public.accept_invitation(text) to authenticated;
