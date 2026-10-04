-- ============================================================================
-- The Director flag follows the role
-- ----------------------------------------------------------------------------
-- Two loose ends of 20261004100000_director_grants_staff:
--
-- 1. Demoting a Director to trainer or student left `is_director = true` on the
--    row, merely dormant (`app.is_director` also requires role = 'admin'). A
--    later "Make admin" from the app revived it — so the app could re-appoint a
--    Director, which only the owner may do. Leaving the admin role now clears
--    the flag. This is the one change to it a JWT may make: it can only ever
--    remove the power, never grant it. Suspension keeps the flag — it is
--    temporary, and restoring the membership restores the Director.
--
-- 2. `handle_new_academy` made the founder of a new academy its admin but not
--    its Director, so a freshly opened branch had nobody who could open
--    Settings or grant staff access. Whoever the owner names in `created_by`
--    now starts as that branch's Director.
-- ============================================================================

create or replace function app.guard_member_director()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  -- Leaving the admin role ends Director status, whoever makes the change.
  if tg_op = 'UPDATE' and new.role <> 'admin' and old.is_director then
    new.is_director := false;
  end if;

  if (select auth.uid()) is null then return new; end if;

  if tg_op = 'INSERT' and new.is_director then
    raise exception 'Directors are appointed by the owner, not through the app';
  end if;
  -- Any other change to the flag from a JWT — granting it, or clearing it
  -- without leaving the admin role — is the owner's.
  if tg_op = 'UPDATE'
     and new.is_director is distinct from old.is_director
     and not (old.is_director and new.role <> 'admin') then
    raise exception 'Directors are appointed by the owner, not through the app';
  end if;
  return new;
end;
$function$;

create or replace function app.handle_new_academy()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.created_by is not null then
    insert into public.academy_members (academy_id, user_id, role, status, is_director)
    values (new.id, new.created_by, 'admin', 'active', true)
    on conflict (academy_id, user_id) do nothing;
  end if;
  return new;
end;
$function$;

-- Rows that were demoted before this migration and still carry the flag.
update public.academy_members
  set is_director = false
  where is_director and role <> 'admin';
