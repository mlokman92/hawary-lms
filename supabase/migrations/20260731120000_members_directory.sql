-- Members directory: the back-office needs to show *who* a member is, not just
-- what role they hold.
--
-- Two things make that impossible with a plain select:
--   1. an account's email lives in auth.users, which no client may read;
--   2. profiles is exposed to every co-member (`app.shares_academy`), so adding
--      an email column there would hand every student the staff address book.
--      RLS is row-level, not column-level, so there is no narrower policy to
--      write.
--
-- Hence one admin-guarded SECURITY DEFINER reader that joins auth.users behind
-- the guard and returns an explicit column list. The members page is already
-- admin-only, so nothing is lost by making the data admin-only too.

create or replace function public.list_academy_staff(_academy_id uuid)
returns table (
  user_id           uuid,
  role              app.user_role,
  status            public.member_status,
  joined_at         timestamptz,
  full_name         text,
  email             text,
  phone             text,
  avatar_url        text,
  is_creator        boolean,
  instructor_id     uuid,
  instructor_no     text,
  instructor_status public.instructor_status,
  courses_taught    bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.is_admin(_academy_id) then
    raise exception 'Only an academy admin can list members';
  end if;

  return query
  select
    m.user_id,
    m.role,
    m.status,
    m.joined_at,
    p.full_name,
    u.email::text,
    -- The profile is the person's own phone; the instructor record is the one
    -- the academy keyed in. Prefer theirs, fall back to ours.
    coalesce(p.phone, i.phone),
    p.avatar_url,
    (a.created_by is not null and a.created_by = m.user_id),
    i.id,
    i.instructor_no,
    i.status,
    coalesce(ci.n, 0)
  from public.academy_members m
    join public.academies a on a.id = m.academy_id
    left join public.profiles p on p.id = m.user_id
    left join auth.users u on u.id = m.user_id
    -- The second axis: "is this person also an instructor?" is a linked
    -- instructors record, not a role. That is what lets one account be both an
    -- admin and an instructor at the same time.
    left join public.instructors i
      on i.academy_id = m.academy_id
     and i.user_id = m.user_id
     and i.archived_at is null
    left join lateral (
      select count(*) as n
      from public.course_instructors c
      where c.instructor_id = i.id
    ) ci on true
  where m.academy_id = _academy_id
    -- Staff only. Students are an academy record with their own page; listing
    -- them here made the roster unusable once an academy had real enrolment.
    and m.role in ('admin', 'trainer')
  order by
    (a.created_by = m.user_id) desc nulls last,
    m.role,
    p.full_name nulls last,
    m.joined_at;
end;
$$;

revoke all on function public.list_academy_staff(uuid) from public;
grant execute on function public.list_academy_staff(uuid) to authenticated;

comment on function public.list_academy_staff(uuid) is
  'Admin-only staff roster for an academy: membership, profile, account email '
  '(from auth.users) and the linked instructor record, if any.';

-- The inverse of link_instructor_account. Without it, attaching an instructor
-- record to an account is a one-way door and a mis-link needs database access
-- to repair.
create or replace function public.unlink_instructor_account(_instructor_id uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_instructor public.instructors;
begin
  select * into v_instructor
  from public.instructors
  where id = _instructor_id;

  if not found then
    raise exception 'Instructor not found';
  end if;

  if not app.is_admin(v_instructor.academy_id) then
    raise exception 'Only an academy admin can unlink accounts';
  end if;

  update public.instructors
    set user_id = null
    where id = _instructor_id;

  -- academy_members is deliberately untouched. Detaching a teaching record is
  -- not the same statement as revoking back-office access, and silently
  -- demoting an admin here would be a privilege change nobody asked for. Use
  -- the role/suspend controls for that.
  return json_build_object('instructor_id', _instructor_id);
end;
$$;

revoke all on function public.unlink_instructor_account(uuid) from public;
grant execute on function public.unlink_instructor_account(uuid) to authenticated;

comment on function public.unlink_instructor_account(uuid) is
  'Admin-only: detach an instructor record from its account. Leaves the '
  'academy_members row (role and status) alone.';
