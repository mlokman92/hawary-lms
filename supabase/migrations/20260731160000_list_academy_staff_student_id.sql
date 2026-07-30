-- Add `student_id` to the staff roster.
--
-- A member row now navigates to the person's *record* — their instructor
-- profile, or their student profile — instead of a members-only detail page. A
-- staff member is usually an instructor, but not always: someone enrolled as a
-- student and later made a trainer keeps their student record, and that is the
-- only page they have. Without this the row would be a dead end for them.
--
-- Return type changes need a drop first; the body is otherwise the migration
-- 20260731120000 one.

drop function if exists public.list_academy_staff(uuid);

create function public.list_academy_staff(_academy_id uuid)
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
  courses_taught    bigint,
  student_id        uuid,
  student_no        text
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
    coalesce(ci.n, 0),
    s.id,
    s.student_no
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
    left join public.students s
      on s.academy_id = m.academy_id
     and s.user_id = m.user_id
     and s.archived_at is null
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

-- A dropped function loses its grants, and `revoke from public` does not cover
-- the anon grant Supabase's default privileges hand out — see migration
-- 20260731120100.
revoke all on function public.list_academy_staff(uuid) from public, anon;
grant execute on function public.list_academy_staff(uuid) to authenticated;

comment on function public.list_academy_staff(uuid) is
  'Admin-only staff roster for an academy: membership, profile, account email '
  '(from auth.users) and the linked instructor / student records, if any.';
