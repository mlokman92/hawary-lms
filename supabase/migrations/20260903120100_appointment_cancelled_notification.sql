-- ============================================================================
-- Tell both parties when a session is genuinely called off.
-- ----------------------------------------------------------------------------
-- `cancel_appointment` has always notified on the *handover* branch and said
-- nothing on the two branches that actually cancel — the gap `docs/appointments.md`
-- named. It closes here on exactly the terms the reassignment notice already
-- uses: written in the same transaction as the UPDATE (so if the session is off,
-- the row saying so exists), addressed to an account rather than a record
-- (`app.notify` no-ops on a null `user_id`), and never sent to the actor — a
-- message telling you what you just clicked is not news.
--
-- One helper, called from both cancel branches, because the two differ only in
-- who pressed the button: a student cancelling is skipped by the actor test on
-- their own arm, and an admin cancelling is skipped by neither. Duplicating the
-- block would be two places for that rule to drift.
--
-- The payload is `appointment_booked`'s verbatim, so `NotificationBell` gains
-- one case in `titleOf` and nothing in `detailOf` or `linkOf`: when the session
-- was and where the row leads are the same questions whatever became of it.
-- ============================================================================

create or replace function app.notify_appointment_cancelled(_id uuid, _actor uuid)
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

  if v_stu_user is distinct from _actor then
    perform app.notify(v_row.academy_id, v_stu_user, 'appointment_cancelled',
      jsonb_build_object(
        'appointment_id', _id,
        'role',           'student',
        'with_name',      v_ins_name,
        'starts_at',      v_row.starts_at,
        'ends_at',        v_row.ends_at,
        'tz',             v_tz
      ));
  end if;

  if v_ins_user is distinct from _actor then
    perform app.notify(v_row.academy_id, v_ins_user, 'appointment_cancelled',
      jsonb_build_object(
        'appointment_id', _id,
        'role',           'instructor',
        'with_name',      v_stu_name,
        'starts_at',      v_row.starts_at,
        'ends_at',        v_row.ends_at,
        'tz',             v_tz
      ));
  end if;
end;
$$;

comment on function app.notify_appointment_cancelled(uuid, uuid) is
  'Notifies both parties that a session is off, skipping whoever cancelled it. Called by cancel_appointment on its two cancelling branches.';

-- ---------------------------------------------------------------------------
-- `cancel_appointment`: unchanged except for the two `perform` lines. Kept as a
-- whole-body replace rather than a patch because the body is the contract.
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

    perform app.notify_appointment_cancelled(_id, v_uid);

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

  perform app.notify_appointment_cancelled(_id, v_uid);

  return json_build_object('id', _id, 'status', 'cancelled', 'reassigned', false);
end;
$$;
