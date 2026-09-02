-- ============================================================================
-- Both parties are told, including whoever pressed the button.
-- ----------------------------------------------------------------------------
-- "The actor is not notified" was a reasonable-sounding rule and it was wrong
-- here, because it assumed the actor is usually staff. In this database the
-- student is almost always the one clicking:
--
--   appointment_booked → instructor   176 rows
--   appointment_booked → student        1 row
--
-- One. Students book themselves on /learn/appointments, so the guard fired on
-- essentially every booking and the student side of the bell was empty by
-- construction. Cancelling is the same shape — 50 of the 52 upcoming cancelled
-- sessions were cancelled by the student themselves — so a student who called
-- a session off had no record of it anywhere in the app.
--
-- A bell that omits exactly the events you caused is not a quieter bell, it is
-- an unreliable one: it cannot answer "what happened to my sessions", which is
-- the only question it is asked. So the guard goes, in all three places, for
-- both parties — one rule rather than a per-role exception, since an instructor
-- reading their own diary wants the same completeness a student does.
--
-- The redundancy this reintroduces is real and accepted: book a session and the
-- bell says so a moment later. That is a receipt, and receipts are the point.
-- ============================================================================

-- The helper loses its `_actor` argument outright rather than keeping it and
-- ignoring it: a parameter nothing reads is a lie about what the function does.
drop function if exists app.notify_appointment_cancelled(uuid, uuid);

create or replace function app.notify_appointment_cancelled(_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_row      public.appointments;
  v_tz       text;
  v_stu_user uuid;
  v_stu_name text;
  v_ins_user uuid;
  v_ins_name text;
begin
  select * into v_row from public.appointments where id = _id;
  if v_row.id is null then return; end if;

  select a.timezone into v_tz from public.academies a where a.id = v_row.academy_id;
  select s.user_id, s.full_name into v_stu_user, v_stu_name
  from public.students s where s.id = v_row.student_id;
  select i.user_id, i.full_name into v_ins_user, v_ins_name
  from public.instructors i where i.id = v_row.instructor_id;

  -- `app.notify` no-ops on a null user_id, which is the ordinary case for an
  -- unclaimed record — so no guard is needed here either.
  perform app.notify(v_row.academy_id, v_stu_user, 'appointment_cancelled',
    jsonb_build_object(
      'appointment_id', _id,
      'role',           'student',
      'with_name',      v_ins_name,
      'starts_at',      v_row.starts_at,
      'ends_at',        v_row.ends_at,
      'tz',             v_tz
    ));

  perform app.notify(v_row.academy_id, v_ins_user, 'appointment_cancelled',
    jsonb_build_object(
      'appointment_id', _id,
      'role',           'instructor',
      'with_name',      v_stu_name,
      'starts_at',      v_row.starts_at,
      'ends_at',        v_row.ends_at,
      'tz',             v_tz
    ));
end;
$$;

comment on function app.notify_appointment_cancelled(uuid) is
  'Notifies both parties that a session is off. Called by cancel_appointment on its two cancelling branches.';

-- ---------------------------------------------------------------------------
-- book_appointment: the two `is distinct from v_uid` guards go. Nothing else
-- in the body changes.
-- ---------------------------------------------------------------------------
create or replace function public.book_appointment(
  _academy_id uuid,
  _starts_at timestamp with time zone,
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
  v_uid      uuid := (select auth.uid());
  v_staff    boolean;
  v_student  uuid;
  v_cfg      public.academy_booking_settings;
  v_tz       text;
  v_day      date;
  v_ends     timestamptz;
  v_open     integer;
  v_week     integer;
  v_cands    uuid[];
  v_cand     uuid;
  v_id       uuid;
  v_auto     boolean;
  v_stu_user uuid;
  v_stu_name text;
  v_ins_user uuid;
  v_ins_name text;
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
    if not (_instructor_id = any(v_cands)) then
      raise exception 'That instructor is no longer free at that time';
    end if;
    v_cands := array[_instructor_id];
    v_auto  := false;
  elsif v_cfg.assignment_mode = 'student_choice' and not v_staff then
    raise exception 'Pick an instructor for this session';
  else
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

  -- Who to tell, read from the row that actually landed rather than from the
  -- loop variable. Both parties, unconditionally — see the migration header for
  -- why the actor is no longer skipped.
  select s.user_id, s.full_name, i.user_id, i.full_name
    into v_stu_user, v_stu_name, v_ins_user, v_ins_name
  from public.appointments a
  join public.students s    on s.id = a.student_id
  join public.instructors i on i.id = a.instructor_id
  where a.id = v_id;

  perform app.notify(_academy_id, v_stu_user, 'appointment_booked',
    jsonb_build_object(
      'appointment_id', v_id,
      'role',           'student',
      'with_name',      v_ins_name,
      'starts_at',      _starts_at,
      'ends_at',        v_ends,
      'tz',             v_tz
    ));

  perform app.notify(_academy_id, v_ins_user, 'appointment_booked',
    jsonb_build_object(
      'appointment_id', v_id,
      'role',           'instructor',
      'with_name',      v_stu_name,
      'starts_at',      _starts_at,
      'ends_at',        v_ends,
      'tz',             v_tz
    ));

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

-- ---------------------------------------------------------------------------
-- cancel_appointment: the reassignment arm loses its two guards, and the two
-- cancelling arms call the helper by its new one-argument signature.
-- ---------------------------------------------------------------------------
create or replace function public.cancel_appointment(_id uuid, _reason text default null)
returns json
language plpgsql
security definer
set search_path to ''
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

    perform app.notify_appointment_cancelled(_id);

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

  perform app.notify_appointment_cancelled(_id);

  return json_build_object('id', _id, 'status', 'cancelled', 'reassigned', false);
end;
$$;
