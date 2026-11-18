-- Appointments, switched on and off per course (docs/appointments.md,
-- "Which courses may book").
--
-- One student, one course: the student's course decides whether they may
-- book. Off by default, like instructors.is_bookable — a new intake is not
-- given teacher time until an admin says so.

alter table public.courses
  add column appointments_enabled boolean not null default false;

comment on column public.courses.appointments_enabled is
  'Students enrolled in this course may book appointments. Admin-only (app.guard_course_appointments).';

-- ---------------------------------------------------------------------------
-- Only an admin flips it. courses UPDATE is app.is_staff (trainers edit their
-- course), so the column needs its own guard, the same shape as
-- guard_course_lpkc_stage.
create or replace function app.guard_course_appointments()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The owner in SQL, and SECURITY DEFINER work with no JWT behind it.
  if (select auth.uid()) is null then return new; end if;
  if app.is_admin(new.academy_id) then return new; end if;

  if tg_op = 'INSERT' and new.appointments_enabled then
    raise exception 'Only an admin can switch appointments on for a course';
  end if;
  if tg_op = 'UPDATE'
     and new.appointments_enabled is distinct from old.appointments_enabled then
    raise exception 'Only an admin can switch appointments for a course';
  end if;
  return new;
end;
$$;

revoke execute on function app.guard_course_appointments() from public, anon, authenticated;

create trigger guard_course_appointments
  before insert or update on public.courses
  for each row execute function app.guard_course_appointments();

-- ---------------------------------------------------------------------------
-- The one test: an active enrollment (not pending, finished, dropped or
-- cancelled) in a course with the switch on.
create or replace function app.appointments_enabled_for(_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.enrollments e
    join public.courses c on c.id = e.course_id
    where e.student_id = _student_id
      and e.status = 'active'
      and c.appointments_enabled
  );
$$;

revoke execute on function app.appointments_enabled_for(uuid) from public, anon, authenticated;

-- What the learner's nav asks: may I book here?
create or replace function public.my_appointments_enabled(_academy_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(app.appointments_enabled_for(app.bookable_student(_academy_id)), false);
$$;

revoke execute on function public.my_appointments_enabled(uuid) from public, anon;
grant execute on function public.my_appointments_enabled(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The page that offers: a student whose course is off is shown booking as
-- closed. Their existing sessions stay readable and cancellable — those go
-- through get_my_appointments / cancel_appointment, which are untouched.
create or replace function public.get_booking_options(_academy_id uuid, _from date, _to date)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $function$
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

  if v_cfg.academy_id is null or not v_cfg.is_open
     or not app.appointments_enabled_for(v_student) then
    return json_build_object('is_open', false, 'slots', '[]'::json);
  end if;

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
$function$;

-- ---------------------------------------------------------------------------
-- The function that grants: refused for the student and for staff booking on
-- their behalf alike. The switch is about the student's course, not about who
-- pressed the button.
create or replace function public.book_appointment(
  _academy_id uuid,
  _starts_at timestamp with time zone,
  _instructor_id uuid default null::uuid,
  _note text default null::text,
  _student_id uuid default null::uuid
)
returns json
language plpgsql
security definer
set search_path = ''
as $function$
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

  if not app.appointments_enabled_for(v_student) then
    if _student_id is not null then
      raise exception 'Appointments are switched off for that student''s course';
    end if;
    raise exception 'Appointments are not available for your course';
  end if;

  select * into v_cfg
  from public.academy_booking_settings where academy_id = _academy_id;

  if v_cfg.academy_id is null or not v_cfg.is_open then
    raise exception 'Booking is not open for this academy';
  end if;

  select a.timezone into v_tz from public.academies a where a.id = _academy_id;
  v_day  := (_starts_at at time zone v_tz)::date;
  v_ends := _starts_at + make_interval(mins => v_cfg.slot_minutes);

  if exists (
    select 1 from public.appointments a
    where a.student_id = v_student
      and a.status in ('booked', 'completed')
      and tstzrange(a.starts_at, a.ends_at) && tstzrange(_starts_at, v_ends)
  ) then
    raise exception 'That student already has a session at that time';
  end if;

  if not v_staff and v_cfg.max_open_per_student is not null then
    select count(*) into v_open
    from public.appointments
    where student_id = v_student and status = 'booked' and starts_at > now();
    if v_open >= v_cfg.max_open_per_student then
      raise exception 'You already have % upcoming session(s) booked', v_open;
    end if;
  end if;

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
$function$;

-- ---------------------------------------------------------------------------
-- Hawary Academy: only the current intake books (owner's instruction,
-- 2026-11-19). The store demo academy keeps appointments for the reviewers.
update public.courses
set appointments_enabled = true
where id in (
  'f3f533c1-03ae-45f5-8ad4-cbce22182742', -- DKM Prasekolah Siri 3/2026
  'de3a0000-0000-4000-8000-0000000000c1'  -- DKM Prasekolah Siri Demo (store review)
);
