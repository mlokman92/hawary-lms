-- ============================================================================
-- Login analytics: accounts left out by name
-- ----------------------------------------------------------------------------
-- The owner's ask (2026-10-05): broadcastimedia@gmail.com holds a student
-- membership but is not a learner, and its logins should not count towards
-- student activity or appear in the list.
--
-- The addresses live in one helper so the next one is a one-line change here,
-- and both readers apply it. Nothing else about the account changes: it still
-- signs in, and the log still records it.
-- ============================================================================

create or replace function app.is_analytics_excluded(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from auth.users u
    where u.id = _user_id
      and lower(u.email) = any (array[
        'broadcastimedia@gmail.com'
      ])
  );
$function$;

comment on function app.is_analytics_excluded(uuid) is
  'Account is left out of login analytics by address, at the owner''s request. Add an address to the array to exclude another.';

revoke all on function app.is_analytics_excluded(uuid) from public, anon, authenticated;

-- Loud on purpose: a typo in the address would otherwise exclude nobody.
do $$
begin
  if not exists (
    select 1
    from auth.users u
      join public.academy_members m on m.user_id = u.id
    where lower(u.email) = 'broadcastimedia@gmail.com'
      and m.role = 'student'
  ) then
    raise exception 'expected a student membership for broadcastimedia@gmail.com';
  end if;
end $$;

-- The two readers: same bodies, one condition added beside the student filter.
-- Rewritten from the live definitions rather than retyped; the assertion makes
-- a changed body fail loudly instead of silently staying unfiltered.
do $$
declare
  f    text;
  def  text;
  old  constant text := 'and m.role = ''student''';
  new  constant text := old || ' and not app.is_analytics_excluded(m.user_id)';
begin
  foreach f in array array[
    'public.login_analytics(uuid, text)',
    'public.list_user_logins(uuid)'
  ] loop
    def := pg_get_functiondef(f::regprocedure);
    if position(old in def) = 0 then
      raise exception 'expected the student filter in %', f;
    end if;
    if position('is_analytics_excluded' in def) > 0 then
      raise exception '% already applies the exclusion', f;
    end if;
    execute replace(def, old, new);
  end loop;
end $$;
