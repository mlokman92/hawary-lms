-- ---------------------------------------------------------------------------
-- How many instructors a slot has free.
--
-- Both availability RPCs already group `app.booking_slots` by `starts_at` and
-- carry the free instructor ids in `g.ids` — the number was there all along and
-- was simply never sent. "10:00" and "10:00 (3 free)" are different answers to
-- "when shall I come in": the second says which times are safe to sit on and
-- which are about to go, without anybody having to tap and find out.
--
-- A COUNT is not the instructor list, which is why this is returned in both
-- assignment modes. Under round robin `get_booking_options` still withholds
-- `instructors` — naming the free teachers would leak a table students cannot
-- read and defeat the point of the mode — but "three people can take you at
-- 10:00" names nobody and is exactly what the student is choosing between.
--
-- `array_agg(distinct …)`: two overlapping `booking_hours` rows on one weekday
-- would emit the same (instructor, starts_at) twice, and a capacity of 4 drawn
-- from a pool of 2 is worse than no number at all. `= any(ids)` is unchanged by
-- the dedupe.
-- ---------------------------------------------------------------------------

create or replace function public.get_booking_options(
  _academy_id uuid,
  _from       date,
  _to         date
) returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_student uuid := app.bookable_student(_academy_id);
  v_cfg     public.academy_booking_settings;
  v_tz      text;
  v_open    integer;
  v_slots   json;
begin
  if v_student is null then
    raise exception 'You do not have a student record in this academy';
  end if;

  select * into v_cfg
  from public.academy_booking_settings where academy_id = _academy_id;

  if v_cfg.academy_id is null or not v_cfg.is_open then
    return json_build_object('is_open', false, 'slots', '[]'::json);
  end if;

  -- A client asking for ten years of slots is asking the database to generate a
  -- million rows. horizon_days caps the future; this caps one call.
  if _to > _from + 62 then _to := _from + 62; end if;

  select a.timezone into v_tz from public.academies a where a.id = _academy_id;

  select count(*) into v_open
  from public.appointments
  where student_id = v_student and status = 'booked' and starts_at > now();

  with s as (
    select * from app.booking_slots(_academy_id, _from, _to)
  ),
  grouped as (
    select s.starts_at, min(s.ends_at) as ends_at,
           array_agg(distinct s.instructor_id) as ids
    from s group by s.starts_at
  ),
  filled as (
    -- Weeks this student has already used up, counted over every session they
    -- hold, not only the ones inside the requested range: the range is a page
    -- of the calendar, the cap is about the week.
    select date_trunc('week', (a.starts_at at time zone v_tz)) as wk, count(*) as n
    from public.appointments a
    where a.student_id  = v_student
      and a.academy_id  = _academy_id
      and a.status in ('booked', 'completed')
    group by 1
  )
  select coalesce(json_agg(json_build_object(
    'starts_at', g.starts_at,
    'ends_at',   g.ends_at,
    'capacity',  cardinality(g.ids),
    'instructors', case when v_cfg.assignment_mode = 'student_choice' then (
      select coalesce(json_agg(json_build_object(
        'id', i.id, 'full_name', i.full_name, 'avatar_url', i.avatar_url
      ) order by i.full_name), '[]'::json)
      from public.instructors i where i.id = any(g.ids)
    ) end
  ) order by g.starts_at), '[]'::json)
  into v_slots
  from grouped g
  where v_cfg.max_per_week_per_student is null
     or coalesce((
       select f.n from filled f
       where f.wk = date_trunc('week', (g.starts_at at time zone v_tz))
     ), 0) < v_cfg.max_per_week_per_student;

  return json_build_object(
    'is_open', true,
    'assignment_mode', v_cfg.assignment_mode,
    'slot_minutes', v_cfg.slot_minutes,
    'max_open_per_student', v_cfg.max_open_per_student,
    'max_per_week_per_student', v_cfg.max_per_week_per_student,
    'open_count', v_open,
    'slots', v_slots
  );
end;
$$;

create or replace function public.get_academy_availability(
  _academy_id uuid,
  _from       date,
  _to         date
) returns json
language plpgsql
stable
security definer
set search_path = ''
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
    select s.starts_at, min(s.ends_at) as ends_at,
           array_agg(distinct s.instructor_id) as ids
    from s group by s.starts_at
  )
  select coalesce(json_agg(json_build_object(
    'starts_at', g.starts_at,
    'ends_at',   g.ends_at,
    'capacity',  cardinality(g.ids),
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
