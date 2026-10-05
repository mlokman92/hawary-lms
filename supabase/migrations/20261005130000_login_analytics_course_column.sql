-- ============================================================================
-- Login analytics: the list says which course each student is on
-- ----------------------------------------------------------------------------
-- The owner's ask (2026-10-05): Student | Course | Last logged in.
--
-- `list_user_logins` returns the title of the student's course — every
-- enrolment that is not cancelled, the same test `app.analytics_in_course`
-- applies, so the column and the course filter can never disagree. The rule is
-- one student, one course; where a record breaks it the titles are joined
-- rather than one being picked silently.
--
-- A RETURNS TABLE change cannot be replaced in place, so the function is
-- dropped and recreated and its grants re-issued. Same rows, same order.
-- ============================================================================

drop function if exists public.list_user_logins(uuid, uuid);

create function public.list_user_logins(_academy_id uuid, _course_id uuid default null)
returns table (
  user_id uuid, full_name text, email text,
  last_login_at timestamp with time zone, student_id uuid, course text
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
    s.id,
    c.titles
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
    left join lateral (
      select string_agg(distinct co.title, ', ' order by co.title) as titles
      -- Through any record this account backs, archived or not — the same
      -- reach as app.analytics_in_course, so a row the filter lets in is
      -- never shown without the course that let it in.
      from public.students st
        join public.enrollments en
          on en.student_id = st.id and en.academy_id = st.academy_id
        join public.courses co on co.id = en.course_id
      where st.academy_id = m.academy_id
        and st.user_id = m.user_id
        and en.status <> 'cancelled'
    ) c on true
  where m.academy_id = _academy_id
    and m.role = 'student' and not app.is_analytics_excluded(m.user_id) and app.analytics_in_course(m.academy_id, m.user_id, _course_id)
  order by 4 desc nulls last, 2 nulls last, m.joined_at;
end;
$function$;

revoke all on function public.list_user_logins(uuid, uuid) from public, anon;
grant execute on function public.list_user_logins(uuid, uuid) to authenticated, service_role;
