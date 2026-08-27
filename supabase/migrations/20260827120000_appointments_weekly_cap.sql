-- Appointments: a weekly cap per student, and no "Where".
--
-- `location` went the whole way out. It was one text box on the booking policy,
-- copied onto every appointment at insert; nobody set it (zero academies, zero
-- appointments), and a per-session place is a per-session field, not an academy
-- default. Both columns go rather than leaving one nothing can write and one
-- nothing can fill.
--
-- In its place, `max_per_week_per_student`: how many sessions one student may
-- hold in a week. It answers a different question from `max_open_per_student` —
-- that one bounds the *queue* (how much of the future one student may hold at
-- once), this one bounds the *rate* (how often they may come). An academy that
-- lets a student keep four sessions open still may not want all four in one
-- week. NULL is no limit, which is the default, so nothing changes for an
-- academy that does not set it.
--
-- The week is the academy's own week (Monday-start, in `academies.timezone`),
-- because "twice a week" is a thing the office says about its own calendar, not
-- about UTC.

alter table public.academy_booking_settings
  drop column location,
  add column max_per_week_per_student integer,
  add constraint academy_booking_settings_max_week_check
    check (max_per_week_per_student is null or max_per_week_per_student > 0);

alter table public.appointments drop column location;

comment on column public.academy_booking_settings.max_per_week_per_student is
  'Sessions one student may hold in a Monday-start week, in the academy''s own timezone. NULL = no limit. Counts booked + completed; a cancelled session frees its week.';

-- --- book_appointment -------------------------------------------------------
-- Unchanged but for the two edits: no location on the insert, and the weekly
-- cap checked beside the open-sessions cap (students only — the office is
-- looking at the diary and has already decided).
create or replace function public.book_appointment(
  _academy_id   uuid,
  _starts_at    timestamptz,
  _instructor_id uuid default null,
  _note         text default null,
  _student_id   uuid default null
) returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_staff   boolean;
  v_student uuid;
  v_cfg     public.academy_booking_settings;
  v_tz      text;
  v_day     date;
  v_ends    timestamptz;
  v_open    integer;
  v_week    integer;
  v_cands   uuid[];
  v_cand    uuid;
  v_id      uuid;
  v_auto    boolean;
begin
  if v_uid is null then raise exception 'You must be signed in to book'; end if;

  v_staff := app.is_staff(_academy_id);

  if _student_id is not null then
    if not v_staff then
      raise exception 'Only staff can book on behalf of a student';
    end if;
    select s.id into v_student
    from public.students s
    where s.id = _student_id
      and s.academy_id = _academy_id
      and s.archived_at is null;
    if v_student is null then
      raise exception 'That student is not in this academy';
    end if;
  else
    v_student := app.bookable_student(_academy_id);
    if v_student is null then
      raise exception 'You do not have a student record in this academy';
    end if;
  end if;

  select * into v_cfg
  from public.academy_booking_settings where academy_id = _academy_id;

  if v_cfg.academy_id is null or not v_cfg.is_open then
    raise exception 'Booking is not open for this academy';
  end if;

  select a.timezone into v_tz from public.academies a where a.id = _academy_id;
  v_day  := (_starts_at at time zone v_tz)::date;
  v_ends := _starts_at + make_interval(mins => v_cfg.slot_minutes);

  -- Checked up front rather than left to appointments_student_no_overlap: the
  -- constraint fires per candidate instructor, so under round robin the loop
  -- would try all five and report "just taken", which is not what happened.
  if exists (
    select 1 from public.appointments a
    where a.student_id = v_student
      and a.status in ('booked', 'completed')
      and tstzrange(a.starts_at, a.ends_at) && tstzrange(_starts_at, v_ends)
  ) then
    raise exception 'That student already has a session at that time';
  end if;

  -- The caps are rules for students, not rules for the office: staff booking
  -- somebody in are looking at the diary and have already decided.
  if not v_staff and v_cfg.max_open_per_student is not null then
    select count(*) into v_open
    from public.appointments
    where student_id = v_student and status = 'booked' and starts_at > now();
    if v_open >= v_cfg.max_open_per_student then
      raise exception 'You already have % upcoming session(s) booked', v_open;
    end if;
  end if;

  -- The week the session falls in, not the week it is being booked in: a cap of
  -- two means two sessions in that week, whenever they were arranged.
  if not v_staff and v_cfg.max_per_week_per_student is not null then
    select count(*) into v_week
    from public.appointments a
    where a.student_id = v_student
      and a.academy_id = _academy_id
      and a.status in ('booked', 'completed')
      and date_trunc('week', (a.starts_at at time zone v_tz))
        = date_trunc('week', (_starts_at at time zone v_tz));
    if v_week >= v_cfg.max_per_week_per_student then
      raise exception 'You already have % session(s) that week', v_week;
    end if;
  end if;

  -- Candidates come from the same generator the availability page reads, so a
  -- slot that was offered is a slot that can be taken — notice period, horizon,
  -- time off and existing bookings all applied once, in one place.
  --
  -- Ordered here, not in the loop: fewest sessions first so a teacher who
  -- joined late catches up, then longest since last assigned, then id. It is
  -- fully deterministic, so two simultaneous bookings walk the list in the same
  -- order and the exclusion constraint decides the tie — not the planner.
  select array_agg(x.instructor_id order by x.n, x.last_at asc nulls first, x.instructor_id)
    into v_cands
  from (
    select s.instructor_id, coalesce(k.n, 0) as n, k.last_at
    from app.booking_slots(_academy_id, v_day, v_day) s
    left join lateral (
      select count(*) as n, max(a.created_at) as last_at
      from public.appointments a
      where a.instructor_id = s.instructor_id
        and a.academy_id    = _academy_id
        and a.status in ('booked', 'completed')
        and a.starts_at >= now() - interval '30 days'
    ) k on true
    where s.starts_at = _starts_at
  ) x;

  if v_cands is null or cardinality(v_cands) = 0 then
    raise exception 'That time is no longer available';
  end if;

  if _instructor_id is not null
     and (v_staff or v_cfg.assignment_mode = 'student_choice') then
    -- Named, by somebody entitled to name one.
    if not (_instructor_id = any(v_cands)) then
      raise exception 'That instructor is no longer free at that time';
    end if;
    v_cands := array[_instructor_id];
    v_auto  := false;
  elsif v_cfg.assignment_mode = 'student_choice' and not v_staff then
    raise exception 'Pick an instructor for this session';
  else
    -- The rota decides. A student who sent an instructor under round robin is
    -- ignored rather than refused: choosing is simply not theirs to do.
    v_auto := true;
  end if;

  foreach v_cand in array v_cands loop
    begin
      insert into public.appointments (
        academy_id, instructor_id, student_id, starts_at, ends_at,
        auto_assigned, note, created_by
      ) values (
        _academy_id, v_cand, v_student, _starts_at, v_ends,
        v_auto, nullif(btrim(_note), ''), v_uid
      )
      returning id into v_id;
    exception
      when exclusion_violation then
        v_id := null;
    end;
    exit when v_id is not null;
  end loop;

  if v_id is null then
    raise exception 'That time was just taken';
  end if;

  return (
    select json_build_object(
      'id', a.id,
      'starts_at', a.starts_at,
      'ends_at', a.ends_at,
      'auto_assigned', a.auto_assigned,
      'instructor', json_build_object(
        'id', i.id, 'full_name', i.full_name, 'avatar_url', i.avatar_url
      )
    )
    from public.appointments a
    join public.instructors i on i.id = a.instructor_id
    where a.id = v_id
  );
end;
$$;

-- --- get_booking_options ----------------------------------------------------
-- A slot in a week the student has already filled is not offered at all, the
-- same reason the generator applies notice and time off: what is on screen is
-- what can be booked. `book_appointment` still checks — the page is a view of a
-- decision, never the decision.
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
    select s.starts_at, min(s.ends_at) as ends_at, array_agg(s.instructor_id) as ids
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

-- --- get_my_appointments ----------------------------------------------------
-- Same list, one column lighter.
create or replace function public.get_my_appointments(_academy_id uuid)
returns json
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(json_agg(json_build_object(
    'id', a.id,
    'starts_at', a.starts_at,
    'ends_at', a.ends_at,
    'status', a.status,
    'note', a.note,
    'cancel_reason', a.cancel_reason,
    'instructor', json_build_object(
      'id', i.id, 'full_name', i.full_name, 'avatar_url', i.avatar_url,
      'specialization', i.specialization
    )
  ) order by a.starts_at desc), '[]'::json)
  from public.appointments a
  join public.instructors i on i.id = a.instructor_id
  where a.academy_id = _academy_id
    and a.student_id = app.bookable_student(_academy_id);
$$;
