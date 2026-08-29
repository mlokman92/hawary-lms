-- Who could take over an existing session.
--
-- Deliberately NOT app.booking_slots: that generator gates on `is_open`,
-- `min_notice_hours` and `horizon_days`, which are rules about opening a
-- booking WINDOW to students. This session already exists at a time the
-- academy already accepted. Closing booking for the month, or a session
-- falling inside the notice window, must not strand it with nobody able to
-- cover.
--
-- `booking_hours` is not consulted either, and that is not an oversight: hours
-- are academy-wide, identical for every instructor, so they cannot distinguish
-- one candidate from another. They say when slots are generated, not who may
-- teach a session that is already on the books.
--
-- What IS honoured is everything that says a person genuinely cannot take it:
-- pool membership, time off, and already being busy.
--
-- The ordering is book_appointment's round robin, verbatim: fewest sessions in
-- the last 30 days, then longest since last assigned, then id as a stable
-- tie-break.
create or replace function app.cover_candidates(_appointment_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  with appt as (
    select a.academy_id, a.instructor_id, a.starts_at, a.ends_at
    from public.appointments a
    where a.id = _appointment_id
  )
  select i.id
  from appt
  join public.instructors i
    on  i.academy_id = appt.academy_id
    and i.id <> appt.instructor_id
    and i.is_bookable
    and i.status = 'active'
    and i.archived_at is null
  left join lateral (
    select count(*) as n, max(k.created_at) as last_at
    from public.appointments k
    where k.instructor_id = i.id
      and k.academy_id    = appt.academy_id
      and k.status in ('booked', 'completed')
      and k.starts_at >= now() - interval '30 days'
  ) load on true
  where not exists (
    select 1 from public.booking_time_off o
    where o.academy_id = appt.academy_id
      and (o.instructor_id is null or o.instructor_id = i.id)
      and tstzrange(o.starts_at, o.ends_at) && tstzrange(appt.starts_at, appt.ends_at)
  )
  and not exists (
    select 1 from public.appointments b
    where b.instructor_id = i.id
      and b.status in ('booked', 'completed')
      and tstzrange(b.starts_at, b.ends_at) && tstzrange(appt.starts_at, appt.ends_at)
  )
  order by coalesce(load.n, 0), load.last_at asc nulls first, i.id;
$$;

comment on function app.cover_candidates(uuid) is
  'Instructors who could take over an existing appointment, best first. Ignores the booking window (is_open / notice / horizon) because the session already exists; honours pool membership, time off and clashes.';


-- Cancelling means two different things depending on who is asking, so the one
-- door branches rather than the callers branching.
--
--   A STUDENT cancelling does not want the session. Reassigning it to another
--   instructor would be the opposite of what they asked for, so their path is
--   unchanged: notice check, then cancel.
--
--   AN ADMIN or THE SESSION'S OWN INSTRUCTOR cancelling means "I cannot take
--   this one". The student still wants it, so the session is handed to whoever
--   can cover, keeping the same id, student and time. Only when nobody can is
--   it actually called off.
--
-- The authorisation is the real change: the staff arm was `app.is_staff`, so
-- ANY trainer could cancel ANY session in the academy. It is now admin, or the
-- instructor whose booking it is.
create or replace function public.cancel_appointment(_id uuid, _reason text default null)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_row     public.appointments;
  v_admin   boolean;
  v_owner   boolean;
  v_learner boolean;
  v_notice  integer;
  v_reason  text := nullif(btrim(_reason), '');
  v_cand    uuid;
  v_moved   boolean := false;
  v_tz      text;
  v_stu_user uuid;
  v_stu_name text;
  v_old_name text;
  v_new_user uuid;
  v_new_name text;
begin
  if v_uid is null then raise exception 'You must be signed in'; end if;

  select * into v_row from public.appointments where id = _id;
  if v_row.id is null then raise exception 'Appointment not found'; end if;

  v_admin   := app.is_admin(v_row.academy_id);
  v_owner   := app.owns_instructor(v_row.instructor_id);
  v_learner := app.owns_student(v_row.student_id);

  -- Same message as a missing row on purpose: whether an id exists is not
  -- something a stranger — or a trainer from another course — should be able
  -- to probe.
  if not (v_admin or v_owner or v_learner) then
    raise exception 'Appointment not found';
  end if;

  -- Before the notice check: an already-cancelled session is not "too late to
  -- cancel", it is already cancelled.
  if v_row.status <> 'booked' then
    raise exception 'That session is not open';
  end if;

  select a.timezone into v_tz from public.academies a where a.id = v_row.academy_id;

  -- ---- The student's own cancellation -------------------------------------
  if not (v_admin or v_owner) then
    select s.min_notice_hours into v_notice
    from public.academy_booking_settings s where s.academy_id = v_row.academy_id;
    if v_row.starts_at < now() + make_interval(hours => coalesce(v_notice, 0)) then
      raise exception 'Too late to cancel — please contact the academy';
    end if;

    update public.appointments
    set status        = 'cancelled',
        cancelled_at  = now(),
        cancelled_by  = v_uid,
        cancel_reason = v_reason
    where id = _id;

    return json_build_object('id', _id, 'status', 'cancelled', 'reassigned', false);
  end if;

  -- ---- Admin / the session's own instructor: hand it over -----------------
  -- A loop over candidates rather than one pick, for the same reason
  -- book_appointment loops its insert: between choosing and writing, somebody
  -- else can take that instructor's slot, and the EXCLUDE constraint is what
  -- says so. Trying the next candidate is cheaper and more correct than
  -- failing the whole action.
  for v_cand in select * from app.cover_candidates(_id) loop
    begin
      update public.appointments
      set instructor_id = v_cand,
          -- The rota chose this one, not a person.
          auto_assigned = true
      where id = _id;
      v_moved := true;
    exception
      when exclusion_violation then
        v_moved := false;
    end;
    exit when v_moved;
  end loop;

  if v_moved then
    select s.user_id, s.full_name into v_stu_user, v_stu_name
    from public.students s where s.id = v_row.student_id;
    select i.full_name into v_old_name
    from public.instructors i where i.id = v_row.instructor_id;
    select i.user_id, i.full_name into v_new_user, v_new_name
    from public.instructors i where i.id = v_cand;

    -- Told in the same transaction as the move, the same reason
    -- book_appointment notifies inline: this is more reliable than the email,
    -- and a student whose teacher changed without being told would turn up
    -- expecting somebody else.
    if v_stu_user is distinct from v_uid then
      perform app.notify(v_row.academy_id, v_stu_user, 'appointment_reassigned',
        jsonb_build_object(
          'appointment_id', _id,
          'role',           'student',
          'with_name',      v_new_name,
          'from_name',      v_old_name,
          'starts_at',      v_row.starts_at,
          'ends_at',        v_row.ends_at,
          'tz',             v_tz
        ));
    end if;

    if v_new_user is distinct from v_uid then
      perform app.notify(v_row.academy_id, v_new_user, 'appointment_reassigned',
        jsonb_build_object(
          'appointment_id', _id,
          'role',           'instructor',
          'with_name',      v_stu_name,
          'from_name',      v_old_name,
          'starts_at',      v_row.starts_at,
          'ends_at',        v_row.ends_at,
          'tz',             v_tz
        ));
    end if;

    return (
      select json_build_object(
        'id', a.id,
        'status', 'booked',
        'reassigned', true,
        'instructor', json_build_object(
          'id', i.id, 'full_name', i.full_name, 'avatar_url', i.avatar_url
        )
      )
      from public.appointments a
      join public.instructors i on i.id = a.instructor_id
      where a.id = _id
    );
  end if;

  -- Nobody can cover: the session really is off.
  update public.appointments
  set status        = 'cancelled',
      cancelled_at  = now(),
      cancelled_by  = v_uid,
      cancel_reason = v_reason
  where id = _id;

  return json_build_object('id', _id, 'status', 'cancelled', 'reassigned', false);
end;
$$;


-- Marking a session done or missed is a statement about a lesson you taught.
-- `app.is_staff` let every trainer in the academy make it about anyone's.
drop policy if exists "appointments: staff update" on public.appointments;
create policy "appointments: admin or own instructor update" on public.appointments
  for update to authenticated
  using (app.is_admin(academy_id) or app.owns_instructor(instructor_id))
  -- On the NEW row as well, so an instructor cannot hand a session to somebody
  -- else with a plain UPDATE: reassignment goes through cancel_appointment,
  -- which picks the cover itself.
  with check (app.is_admin(academy_id) or app.owns_instructor(instructor_id));
