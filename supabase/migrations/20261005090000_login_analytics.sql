-- ============================================================================
-- Login analytics: a durable log of who came into the LMS, and when
-- ----------------------------------------------------------------------------
-- The owner's ask (2026-10-05): a page for Directors with logins per day, the
-- number of distinct users in a month, and every user's last login.
--
-- Supabase Auth keeps none of that in a form that can be charted:
--
--   * `auth.audit_log_entries` is empty — this project does not write it;
--   * `auth.sessions` loses its row the moment the account signs out (47
--     accounts had signed in and had no session left), so it forgets the past;
--   * `auth.users.last_sign_in_at` is one timestamp, and it only moves when a
--     password is typed. A session lasts until sign-out, so somebody who signed
--     in on 28 September and has opened the LMS every day since still reads
--     "28 September" — and by that measure is not an October user at all. Five
--     days into October it counted 34 people where 72 had been in.
--
-- So a login is recorded here as it happens, and it is one of two things:
--
--   a sign-in   a new `auth.sessions` row;
--   a return    a session renewed after at least an hour away. The access token
--               lives one hour and the client renews it at about 58 minutes
--               while the app is open, so a renewal a full hour or more after
--               the last one means the app had been closed and somebody came
--               back. The 58-minute renewals of an open tab are not logins and
--               are not recorded — in two months they were 71 of 2,345.
--
-- The one-hour test leans on the project's JWT expiry being 3600s (the Supabase
-- default). A shorter expiry only merges returns inside the hour into the visit
-- before them; a much longer one would hide returns altogether, because nothing
-- is renewed until the token runs out. See docs/analytics.md.
--
-- Who may read it: `app.can_view_analytics` — the academy's Directors, and the
-- owner's own account by address, at the owner's request.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- The log. Global to the account, not to an academy: a login is not made *to*
-- a branch, so the readers below attribute it through `academy_members`.
-- ----------------------------------------------------------------------------
create table if not exists public.login_events (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  -- Not a foreign key: the session is deleted on sign-out, and outliving that
  -- is the whole reason this table exists.
  session_id  uuid,
  is_sign_in  boolean not null,
  created_at  timestamptz not null default now()
);

comment on table public.login_events is
  'One row per login: a sign-in, or a return on a session that was still signed in. Written only by the auth.sessions trigger; read only through login_analytics / list_user_logins.';

create index if not exists login_events_user_created_idx
  on public.login_events (user_id, created_at desc);
create index if not exists login_events_created_idx
  on public.login_events (created_at);

-- No policies on purpose: no client reads or writes this table. The trigger and
-- the two RPCs are SECURITY DEFINER and run as its owner.
alter table public.login_events enable row level security;
revoke all on public.login_events from anon, authenticated;

-- ----------------------------------------------------------------------------
-- The writer. It sits on the sign-in path of a live system, so it must never
-- be the reason somebody cannot sign in: any failure is a warning in the log
-- and the session is created regardless.
-- ----------------------------------------------------------------------------
create or replace function app.record_login()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  seen_at timestamptz;
  last_at timestamptz;
begin
  begin
    if tg_op = 'INSERT' then
      insert into public.login_events (user_id, session_id, is_sign_in, created_at)
        values (new.user_id, new.id, true, coalesce(new.created_at, now()));
    elsif new.refreshed_at is distinct from old.refreshed_at then
      -- `refreshed_at` is a timestamp without time zone, written in UTC.
      seen_at := coalesce(new.refreshed_at at time zone 'UTC', now());
      last_at := coalesce(old.refreshed_at at time zone 'UTC', old.created_at);
      if last_at is null or seen_at - last_at >= interval '1 hour' then
        insert into public.login_events (user_id, session_id, is_sign_in, created_at)
          values (new.user_id, new.id, false, seen_at);
      end if;
    end if;
  exception when others then
    raise warning 'app.record_login: %', sqlerrm;
  end;
  return new;
end;
$function$;

revoke all on function app.record_login() from public, anon, authenticated;

-- On `auth.sessions` rather than `auth.refresh_tokens`: the session row is
-- touched by a renewal whichever way the refresh token itself is stored.
drop trigger if exists on_auth_session_login on auth.sessions;
create trigger on_auth_session_login
  after insert or update of refreshed_at on auth.sessions
  for each row execute function app.record_login();

-- ----------------------------------------------------------------------------
-- History, as far as it survives. Every refresh token still on file is a
-- sign-in (no parent) or a renewal, so the same rule replays over them. What
-- cannot be recovered: sessions that were signed out before today, of which
-- only the account's last sign-in remains — the second insert keeps that one.
-- Nothing is on file from before 2 August 2026.
--
-- Guarded on an empty table so re-running the file cannot count history twice.
-- CREATE TRIGGER above holds its lock on `auth.sessions` until this commits,
-- so no session is both replayed here and recorded by the trigger.
-- ----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from public.login_events) then
    return;
  end if;

  insert into public.login_events (user_id, session_id, is_sign_in, created_at)
  select s.user_id, t.session_id, t.parent is null, t.created_at
  from auth.refresh_tokens t
    join auth.sessions s on s.id = t.session_id
    left join auth.refresh_tokens p
      on p.token = t.parent and p.session_id = t.session_id
  where t.parent is null
     or p.created_at is null
     or t.created_at - p.created_at >= interval '1 hour';

  insert into public.login_events (user_id, is_sign_in, created_at)
  select u.id, true, u.last_sign_in_at
  from auth.users u
  where u.last_sign_in_at is not null
    and not exists (
      select 1
      from public.login_events e
      where e.user_id = u.id
        and e.created_at >= u.last_sign_in_at - interval '1 minute'
    );
end $$;

-- ----------------------------------------------------------------------------
-- Who may read it.
-- ----------------------------------------------------------------------------
create or replace function app.can_view_analytics(_academy_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select app.is_director(_academy_id)
    or exists (
      select 1
      from auth.users u
      where u.id = (select auth.uid())
        and u.email_confirmed_at is not null
        and lower(u.email) = 'muhamadlokman92@gmail.com'
    );
$function$;

comment on function app.can_view_analytics(uuid) is
  'Caller may read the academy''s login analytics: a Director of it, or the owner''s own account (by address, at the owner''s request).';

revoke all on function app.can_view_analytics(uuid) from public, anon;
grant execute on function app.can_view_analytics(uuid) to authenticated, service_role;

-- The same answer for the client, which needs it to decide whether to show the
-- page at all. A hint only — the two readers below check for themselves.
create or replace function public.can_view_analytics(_academy_id uuid)
returns boolean
language sql
stable
set search_path to ''
as $function$
  select app.can_view_analytics(_academy_id);
$function$;

revoke all on function public.can_view_analytics(uuid) from public, anon;
grant execute on function public.can_view_analytics(uuid) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- One month: logins per day, and how many different people they were.
--
-- One call returns the chart, the figure above it and the list of months the
-- selector offers, so the three cannot disagree. Days and months are the
-- academy's calendar (`academies.timezone`), decided here rather than in a
-- browser that may be somewhere else. `_month` is 'YYYY-MM'; null is the
-- current month.
-- ----------------------------------------------------------------------------
create or replace function public.login_analytics(_academy_id uuid, _month text default null)
returns json
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  tz          text;
  this_month  date;
  first_month date;
  month_start date;
  result      json;
begin
  if not app.can_view_analytics(_academy_id) then
    raise exception 'Only a Director can view analytics';
  end if;

  select a.timezone into tz from public.academies a where a.id = _academy_id;
  if not found then
    raise exception 'Academy not found';
  end if;

  this_month := date_trunc('month', now() at time zone tz)::date;

  if _month is null then
    month_start := this_month;
  elsif _month !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Month must be YYYY-MM';
  else
    month_start := to_date(_month || '-01', 'YYYY-MM-DD');
  end if;

  select coalesce(
      date_trunc('month', min(e.created_at) at time zone tz)::date,
      this_month
    )
    into first_month
  from public.login_events e
    join public.academy_members m on m.user_id = e.user_id
  where m.academy_id = _academy_id;

  with ev as (
    select e.user_id, (e.created_at at time zone tz)::date as day
    from public.login_events e
      join public.academy_members m
        on m.user_id = e.user_id and m.academy_id = _academy_id
    where e.created_at >= (month_start::timestamp at time zone tz)
      and e.created_at < ((month_start + interval '1 month')::timestamp at time zone tz)
  ),
  days as (
    select d::date as day
    from generate_series(
      month_start::timestamp,
      (month_start + interval '1 month' - interval '1 day')::timestamp,
      interval '1 day'
    ) d
  ),
  per_day as (
    select ev.day, count(*) as n from ev group by ev.day
  )
  select json_build_object(
    'month', to_char(month_start, 'YYYY-MM'),
    'months', (
      select json_agg(to_char(g, 'YYYY-MM') order by g desc)
      from generate_series(
        least(first_month, this_month)::timestamp,
        this_month::timestamp,
        interval '1 month'
      ) g
    ),
    'active_users', (select count(distinct ev.user_id) from ev),
    'logins', (select count(*) from ev),
    'days', (
      select json_agg(
        json_build_object('day', days.day, 'logins', coalesce(per_day.n, 0))
        order by days.day
      )
      from days left join per_day on per_day.day = days.day
    )
  ) into result;

  return result;
end;
$function$;

revoke all on function public.login_analytics(uuid, text) from public, anon;
grant execute on function public.login_analytics(uuid, text) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Every account in the academy, most recently seen first.
--
-- `greatest`, because the two sources cover different ground: the log knows
-- about returns, and `last_sign_in_at` reaches back before the log began.
-- ----------------------------------------------------------------------------
create or replace function public.list_user_logins(_academy_id uuid)
returns table (
  user_id uuid, role app.user_role, status public.member_status,
  is_director boolean, full_name text, email text,
  last_login_at timestamp with time zone, student_id uuid, instructor_id uuid
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if not app.can_view_analytics(_academy_id) then
    raise exception 'Only a Director can view analytics';
  end if;

  return query
  select
    m.user_id,
    m.role,
    m.status,
    (m.is_director and m.role = 'admin'),
    coalesce(nullif(btrim(p.full_name), ''), i.full_name, s.full_name),
    u.email::text,
    greatest(u.last_sign_in_at, l.at),
    s.id,
    i.id
  from public.academy_members m
    left join public.profiles p on p.id = m.user_id
    left join auth.users u on u.id = m.user_id
    left join public.instructors i
      on i.academy_id = m.academy_id
     and i.user_id = m.user_id
     and i.archived_at is null
    left join public.students s
      on s.academy_id = m.academy_id
     and s.user_id = m.user_id
     and s.archived_at is null
    left join lateral (
      select max(e.created_at) as at
      from public.login_events e
      where e.user_id = m.user_id
    ) l on true
  where m.academy_id = _academy_id
  order by 7 desc nulls last, 5 nulls last, m.joined_at;
end;
$function$;

revoke all on function public.list_user_logins(uuid) from public, anon;
grant execute on function public.list_user_logins(uuid) to authenticated, service_role;
