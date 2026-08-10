-- Staff-side availability.
--
-- get_booking_options is the learner's door and starts by resolving
-- app.bookable_student, so it raises for anybody in the back office — staff do
-- not have a student record. Booking somebody in from /appointments still needs
-- to see free slots, and it needs to see them *with* the instructor named
-- whatever the assignment mode is: `instructors` is staff-readable, and the
-- office is exactly who is allowed to override the rota.
--
-- Same generator underneath, so the two doors cannot drift.
create or replace function public.get_academy_availability(
  _academy_id uuid,
  _from date,
  _to date
)
returns json
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_slots json;
begin
  if not app.is_staff(_academy_id) then
    raise exception 'Not authorised';
  end if;

  if _to > _from + 62 then _to := _from + 62; end if;

  with s as (
    select * from app.booking_slots(_academy_id, _from, _to)
  ),
  grouped as (
    select s.starts_at, min(s.ends_at) as ends_at, array_agg(s.instructor_id) as ids
    from s group by s.starts_at
  )
  select coalesce(json_agg(json_build_object(
    'starts_at', g.starts_at,
    'ends_at',   g.ends_at,
    'instructors', (
      select coalesce(json_agg(json_build_object(
        'id', i.id, 'full_name', i.full_name, 'avatar_url', i.avatar_url
      ) order by i.full_name), '[]'::json)
      from public.instructors i where i.id = any(g.ids)
    )
  ) order by g.starts_at), '[]'::json)
  into v_slots
  from grouped g;

  return json_build_object('slots', v_slots);
end;
$$;

revoke all on function public.get_academy_availability(uuid, date, date) from public, anon;
grant execute on function public.get_academy_availability(uuid, date, date) to authenticated;
