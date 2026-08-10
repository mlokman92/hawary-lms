-- Two corrections to book_appointment / cancel_appointment.
--
-- 1. Naming an instructor was keyed off the assignment mode, so staff booking
--    under `student_choice` without naming one were told to "pick an
--    instructor" — even though the back office offers "anyone free", and even
--    though the office is precisely who is allowed to not care. The right test
--    is "was an instructor named, by somebody allowed to name one", which makes
--    the four cases fall out on their own:
--
--      student + student_choice + none   → asked to pick
--      student + student_choice + named  → that instructor
--      student + round_robin   + named   → ignored; the rota decides
--      staff   + any mode      + none    → the rota decides
--      staff   + any mode      + named   → that instructor
--
-- 2. cancel_appointment tested the notice period before it tested the status,
--    so cancelling an already-cancelled past session reported "too late to
--    cancel" instead of saying it was not open.

create or replace function public.book_appointment(
  _academy_id uuid,
  _starts_at timestamptz,
  _instructor_id uuid default null,
  _note text default null,
  _student_id uuid default null
)
returns json
language plpgsql
security definer
set search_path to ''
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

  -- The cap is a rule for students, not a rule for the office: staff booking
  -- somebody in are looking at the diary and have already decided.
  if not v_staff and v_cfg.max_open_per_student is not null then
    select count(*) into v_open
    from public.appointments
    where student_id = v_student and status = 'booked' and starts_at > now();
    if v_open >= v_cfg.max_open_per_student then
      raise exception 'You already have % upcoming session(s) booked', v_open;
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
        auto_assigned, location, note, created_by
      ) values (
        _academy_id, v_cand, v_student, _starts_at, v_ends,
        v_auto, v_cfg.location, nullif(btrim(_note), ''), v_uid
      )
      returning id into v_id;
    exception
      -- Somebody took this instructor between the generator and the insert.
      -- Under round robin that is simply the next teacher's turn; with one
      -- forced candidate the loop ends and the raise below is reached.
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
      'location', a.location,
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

create or replace function public.cancel_appointment(
  _id uuid,
  _reason text default null
)
returns json
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_row    public.appointments;
  v_staff  boolean;
  v_notice integer;
begin
  if v_uid is null then raise exception 'You must be signed in'; end if;

  select * into v_row from public.appointments where id = _id;
  if v_row.id is null then raise exception 'Appointment not found'; end if;

  v_staff := app.is_staff(v_row.academy_id);

  if not v_staff and not app.owns_student(v_row.student_id) then
    -- Same message as a missing row on purpose: whether an id exists is not
    -- something a stranger should be able to probe.
    raise exception 'Appointment not found';
  end if;

  -- Before the notice check: an already-cancelled session is not "too late to
  -- cancel", it is already cancelled.
  if v_row.status <> 'booked' then
    raise exception 'That session is not open';
  end if;

  if not v_staff then
    select s.min_notice_hours into v_notice
    from public.academy_booking_settings s where s.academy_id = v_row.academy_id;
    if v_row.starts_at < now() + make_interval(hours => coalesce(v_notice, 0)) then
      raise exception 'Too late to cancel — please contact the academy';
    end if;
  end if;

  update public.appointments
  set status        = 'cancelled',
      cancelled_at  = now(),
      cancelled_by  = v_uid,
      cancel_reason = nullif(btrim(_reason), '')
  where id = _id;

  return json_build_object('id', _id, 'status', 'cancelled');
end;
$$;
