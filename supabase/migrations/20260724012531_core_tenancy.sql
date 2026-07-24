-- ============================================================================
-- 0001 · Core tenancy: app schema, enums, tenancy helpers, academies,
--        profiles, academy_members. Multi-tenant foundation for Hawary LMS.
-- ============================================================================
-- Tenant boundary = academy. Every tenant-scoped table carries academy_id and
-- is protected by RLS. Membership + role live in public.academy_members.
-- Tenancy checks are done by SECURITY DEFINER functions in the `app` schema so
-- that policies which read academy_members do NOT recurse through RLS.
-- ============================================================================

create schema if not exists app;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type app.user_role   as enum ('admin', 'trainer', 'student');
create type public.member_status  as enum ('active', 'invited', 'suspended');
create type public.academy_status as enum ('active', 'suspended', 'cancelled');

-- ---------------------------------------------------------------------------
-- Shared trigger helpers
-- ---------------------------------------------------------------------------
create or replace function app.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- Academies (tenants)
create table public.academies (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  slug             text not null,
  registration_no  text,                 -- SSM / business registration number
  email            text,
  phone            text,
  address          text,
  city             text,
  state            text,                  -- Malaysian state
  postcode         text,
  country          text not null default 'MY',
  currency         text not null default 'MYR',
  timezone         text not null default 'Asia/Kuala_Lumpur',
  sst_registered   boolean not null default false,
  sst_number       text,
  logo_url         text,
  status           public.academy_status not null default 'active',
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index academies_slug_key on public.academies (lower(slug));
create index academies_created_by_idx on public.academies (created_by);

-- Profiles (1:1 with auth.users). Global identity; role is per-academy.
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  phone       text,
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Membership: which user belongs to which academy, with which role.
create table public.academy_members (
  id          uuid primary key default gen_random_uuid(),
  academy_id  uuid not null references public.academies(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  role        app.user_role not null,
  status      public.member_status not null default 'active',
  student_no  text,                        -- academy-issued student id (optional)
  joined_at   timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (academy_id, user_id)
);
create index academy_members_academy_id_idx on public.academy_members (academy_id);
create index academy_members_user_id_idx     on public.academy_members (user_id);

-- ---------------------------------------------------------------------------
-- Tenancy helper functions (SECURITY DEFINER → bypass RLS, avoid recursion)
-- ---------------------------------------------------------------------------
create or replace function app.is_member(_academy_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.academy_members m
    where m.academy_id = _academy_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  );
$$;

create or replace function app.has_role(_academy_id uuid, _role app.user_role)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.academy_members m
    where m.academy_id = _academy_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role = _role
  );
$$;

create or replace function app.is_admin(_academy_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.academy_members m
    where m.academy_id = _academy_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role = 'admin'
  );
$$;

-- Staff = admin or trainer.
create or replace function app.is_staff(_academy_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.academy_members m
    where m.academy_id = _academy_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role in ('admin', 'trainer')
  );
$$;

-- Does the current user share an active academy membership with _user_id?
create or replace function app.shares_academy(_user_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.academy_members me
    join public.academy_members them on them.academy_id = me.academy_id
    where me.user_id = (select auth.uid())
      and me.status = 'active'
      and them.user_id = _user_id
      and them.status = 'active'
  );
$$;

-- ---------------------------------------------------------------------------
-- Auth / academy provisioning triggers
-- ---------------------------------------------------------------------------

-- Create a profile row automatically for every new auth user.
create or replace function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, phone, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'phone',
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();

-- When an academy is created by an authenticated user, make that user its admin.
create or replace function app.handle_new_academy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.created_by is not null then
    insert into public.academy_members (academy_id, user_id, role, status)
    values (new.id, new.created_by, 'admin', 'active')
    on conflict (academy_id, user_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger on_academy_created
  after insert on public.academies
  for each row execute function app.handle_new_academy();

-- updated_at triggers
create trigger set_updated_at before update on public.academies
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.profiles
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.academy_members
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.academies       enable row level security;
alter table public.profiles        enable row level security;
alter table public.academy_members enable row level security;

-- academies -----------------------------------------------------------------
create policy "academies: members can view"
  on public.academies for select to authenticated
  using (app.is_member(id));

create policy "academies: authenticated can create"
  on public.academies for insert to authenticated
  with check (created_by = (select auth.uid()));

create policy "academies: admins can update"
  on public.academies for update to authenticated
  using (app.is_admin(id))
  with check (app.is_admin(id));

create policy "academies: admins can delete"
  on public.academies for delete to authenticated
  using (app.is_admin(id));

-- profiles ------------------------------------------------------------------
create policy "profiles: self or co-member can view"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or app.shares_academy(id));

create policy "profiles: user can insert own"
  on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));

create policy "profiles: user can update own"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- academy_members -----------------------------------------------------------
create policy "members: self or staff can view"
  on public.academy_members for select to authenticated
  using (user_id = (select auth.uid()) or app.is_staff(academy_id));

create policy "members: admins can add"
  on public.academy_members for insert to authenticated
  with check (app.is_admin(academy_id));

create policy "members: admins can update"
  on public.academy_members for update to authenticated
  using (app.is_admin(academy_id))
  with check (app.is_admin(academy_id));

create policy "members: admins can remove"
  on public.academy_members for delete to authenticated
  using (app.is_admin(academy_id));
