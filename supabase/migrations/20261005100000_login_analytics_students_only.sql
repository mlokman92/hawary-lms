-- ============================================================================
-- Login analytics counts students only
-- ----------------------------------------------------------------------------
-- The owner's follow-up (2026-10-05): the page is about whether *students* are
-- using the LMS. Staff are in it all day as part of the job, and eleven staff
-- accounts logging in daily say nothing about that.
--
-- Both readers now attribute a login through a `student` membership only. The
-- log itself is unchanged — it still records every account, so the rule can be
-- widened again without losing history.
--
-- `list_user_logins` loses the columns that only described staff (`role`,
-- `is_director`, `instructor_id`) and `status`, which the page never showed. A
-- RETURNS TABLE change cannot be replaced in place, so it is dropped and
-- recreated and its grants re-issued.
-- ============================================================================

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
  where m.academy_id = _academy_id
    and m.role = 'student';

  with ev as (
    select e.user_id, (e.created_at at time zone tz)::date as day
    from public.login_events e
      join public.academy_members m
        on m.user_id = e.user_id
       and m.academy_id = _academy_id
       and m.role = 'student'
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

drop function if exists public.list_user_logins(uuid);

create function public.list_user_logins(_academy_id uuid)
returns table (
  user_id uuid, full_name text, email text,
  last_login_at timestamp with time zone, student_id uuid
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
    coalesce(nullif(btrim(p.full_name), ''), s.full_name),
    u.email::text,
    greatest(u.last_sign_in_at, l.at),
    s.id
  from public.academy_members m
    left join public.profiles p on p.id = m.user_id
    left join auth.users u on u.id = m.user_id
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
    and m.role = 'student'
  order by 4 desc nulls last, 2 nulls last, m.joined_at;
end;
$function$;

revoke all on function public.list_user_logins(uuid) from public, anon;
grant execute on function public.list_user_logins(uuid) to authenticated, service_role;
