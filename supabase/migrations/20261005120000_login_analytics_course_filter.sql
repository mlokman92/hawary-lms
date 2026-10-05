-- ============================================================================
-- Login analytics: narrow to one course
-- ----------------------------------------------------------------------------
-- The owner's ask (2026-10-05): a course filter on /analytics. A course is an
-- intake ("Siri"), so this is "how is Siri 2 doing" — the chart, the head count
-- and the list all narrow together.
--
-- Both readers take an optional `_course_id`; null is every course, as before.
-- A student is on a course through an enrolment that is not cancelled, matched
-- by the student record their account backs. A course from another academy
-- matches nobody, because the enrolment is looked up inside the caller's
-- academy.
--
-- Adding a parameter makes a new function rather than replacing the old one,
-- and two overloads would leave PostgREST unable to choose. So each reader is
-- recreated from its live definition with the new signature and the extra
-- condition, and the old signature is dropped.
-- ============================================================================

create or replace function app.analytics_in_course(_academy_id uuid, _user_id uuid, _course_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select _course_id is null
    or exists (
      select 1
      from public.students s
        join public.enrollments e
          on e.student_id = s.id and e.academy_id = s.academy_id
      where s.academy_id = _academy_id
        and s.user_id = _user_id
        and e.course_id = _course_id
        and e.status <> 'cancelled'
    );
$function$;

revoke all on function app.analytics_in_course(uuid, uuid, uuid) from public, anon, authenticated;

do $$
declare
  r    record;
  def  text;
  cond constant text := 'and not app.is_analytics_excluded(m.user_id)';
begin
  for r in
    select *
    from (values
      ('public.login_analytics(uuid, text)',
       '_month text DEFAULT NULL::text)',
       '_month text DEFAULT NULL::text, _course_id uuid DEFAULT NULL::uuid)'),
      ('public.list_user_logins(uuid)',
       'list_user_logins(_academy_id uuid)',
       'list_user_logins(_academy_id uuid, _course_id uuid DEFAULT NULL::uuid)')
    ) as v(old_sig, old_args, new_args)
  loop
    def := pg_get_functiondef(r.old_sig::regprocedure);
    if position(r.old_args in def) = 0 then
      raise exception 'expected the argument list % in %', r.old_args, r.old_sig;
    end if;
    if position(cond in def) = 0 then
      raise exception 'expected the exclusion filter in %', r.old_sig;
    end if;
    def := replace(def, r.old_args, r.new_args);
    def := replace(
      def, cond,
      cond || ' and app.analytics_in_course(m.academy_id, m.user_id, _course_id)'
    );
    execute def;
    execute 'drop function ' || r.old_sig;
  end loop;
end $$;

revoke all on function public.login_analytics(uuid, text, uuid) from public, anon;
grant execute on function public.login_analytics(uuid, text, uuid) to authenticated, service_role;
revoke all on function public.list_user_logins(uuid, uuid) from public, anon;
grant execute on function public.list_user_logins(uuid, uuid) to authenticated, service_role;
