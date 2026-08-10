-- One-to-one appointments: a student books an instructor's time.
--
-- The load-bearing decision is that SLOTS ARE NOT ROWS. A slot is derived from
-- three facts — the academy's weekly hours, who is bookable, and what is
-- already taken — so changing "10:00–18:00" to "09:00–17:00" is one UPDATE, not
-- a regeneration of every future row. The only durable fact is an appointment
-- somebody actually made.
--
-- Everything the learner sees comes out of app.booking_slots, and so does the
-- availability check inside book_appointment. That is deliberate, and the same
-- reason app.enrollment_open exists: the page that offers a slot and the
-- function that grants it must not be able to disagree about what "free" means.
--
-- Double-booking is prevented by an EXCLUDE constraint, not by checking first.
-- Two students hitting the last 15:00 slot at the same instant is the normal
-- case, not the edge case, and the loser of that race has to be told cleanly.
-- Full note: docs/appointments.md

-- Overlap exclusion on (uuid, tstzrange) needs btree_gist for the `=` half.
create extension if not exists btree_gist with schema extensions;

create type public.appointment_status as enum
  ('booked', 'completed', 'cancelled', 'no_show');

create type public.appointment_assignment as enum
  ('student_choice', 'round_robin');

-- ---------------------------------------------------------------------------
-- Who can be booked. A flag rather than a table: "is this person bookable" is
-- one boolean, and instructors already carries the rest of the record.
--
-- Default false — switching booking on must not silently put every instructor
-- in the pool.
-- ---------------------------------------------------------------------------
alter table public.instructors
  add column if not exists is_bookable boolean not null default false;

comment on column public.instructors.is_bookable is
  'In the appointment pool. Also requires status = ''active'' — on_leave is left out of round robin.';

-- ---------------------------------------------------------------------------
-- The academy's booking policy. One row, like academy_enrollment_settings, and
-- absent reads as closed.
-- ---------------------------------------------------------------------------
create table if not exists public.academy_booking_settings (
  academy_id           uuid primary key references public.academies(id) on delete cascade,
  is_open              boolean not null default false,
  slot_minutes         integer not null default 60,
  assignment_mode      public.appointment_assignment not null default 'round_robin',
  -- How close to the start a booking is still allowed. Doubles as the student's
  -- cancellation cutoff: the notice you owe to take time is the notice you owe
  -- to give it back.
  min_notice_hours     integer not null default 12,
  horizon_days         integer not null default 30,
  -- null = unlimited. Stops one student holding every slot in the week.
  max_open_per_student integer default 1,
  -- Room, or a meeting link. Snapshotted onto each appointment at booking, so
  -- moving the venue does not rewrite where past sessions happened.
  location             text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint academy_booking_settings_slot_minutes_check
    check (slot_minutes in (15, 20, 30, 45, 60, 90, 120)),
  constraint academy_booking_settings_min_notice_check
    check (min_notice_hours between 0 and 720),
  constraint academy_booking_settings_horizon_check
    check (horizon_days between 1 and 180),
  constraint academy_booking_settings_max_open_check
    check (max_open_per_student is null or max_open_per_student > 0)
);

alter table public.academy_booking_settings enable row level security;

create policy "booking settings: staff read"
  on public.academy_booking_settings for select to authenticated
  using (app.is_staff(academy_id));
create policy "booking settings: admin insert"
  on public.academy_booking_settings for insert to authenticated
  with check (app.is_admin(academy_id));
create policy "booking settings: admin update"
  on public.academy_booking_settings for update to authenticated
  using (app.is_admin(academy_id)) with check (app.is_admin(academy_id));

create trigger set_updated_at
  before update on public.academy_booking_settings
  for each row execute function app.set_updated_at();

comment on table public.academy_booking_settings is
  'The academy''s appointment policy. Absent row or is_open=false means nothing is bookable.';

-- ---------------------------------------------------------------------------
-- The weekly pattern, in the academy's own timezone. Rows rather than a pair of
-- columns because a day is rarely one unbroken stretch — 10:00–13:00 and
-- 14:00–18:00 is a lunch break, and that is two rows, not a setting.
--
-- Academy-wide by design: an instructor is in the pool or out of it. Per-person
-- hours would be an instructor_id column here and nothing else.
-- ---------------------------------------------------------------------------
create table if not exists public.booking_hours (
  id         uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.academies(id) on delete cascade,
  -- 0 = Sunday. Matches both Postgres `extract(dow)` and JS `getDay()`, so the
  -- generator and the editor index the same array.
  weekday    smallint not null,
  start_time time not null,
  end_time   time not null,
  created_at timestamptz not null default now(),

  constraint booking_hours_weekday_check check (weekday between 0 and 6),
  constraint booking_hours_range_check check (end_time > start_time),
  constraint booking_hours_unique unique (academy_id, weekday, start_time, end_time)
);

create index if not exists booking_hours_academy_id_weekday_idx
  on public.booking_hours (academy_id, weekday);

alter table public.booking_hours enable row level security;

create policy "booking hours: staff read"
  on public.booking_hours for select to authenticated
  using (app.is_staff(academy_id));
create policy "booking hours: admin insert"
  on public.booking_hours for insert to authenticated
  with check (app.is_admin(academy_id));
create policy "booking hours: admin update"
  on public.booking_hours for update to authenticated
  using (app.is_admin(academy_id)) with check (app.is_admin(academy_id));
create policy "booking hours: admin delete"
  on public.booking_hours for delete to authenticated
  using (app.is_admin(academy_id));

comment on table public.booking_hours is
  'Recurring weekly bookable windows, academy-wide, in the academy timezone.';

-- ---------------------------------------------------------------------------
-- Closures. A public holiday or a week of leave must not mean deleting the
-- weekly hours, which would close that weekday for ever.
--
-- instructor_id null = the whole academy. The composite FK is MATCH SIMPLE, so
-- a null instructor skips the tenancy check rather than failing it — which is
-- exactly the academy-wide case.
-- ---------------------------------------------------------------------------
create table if not exists public.booking_time_off (
  id            uuid primary key default gen_random_uuid(),
  academy_id    uuid not null references public.academies(id) on delete cascade,
  instructor_id uuid,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  reason        text,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),

  constraint booking_time_off_range_check check (ends_at > starts_at),
  constraint booking_time_off_academy_id_instructor_id_fkey
    foreign key (academy_id, instructor_id)
    references public.instructors(academy_id, id) on delete cascade
);

create index if not exists booking_time_off_academy_id_starts_at_idx
  on public.booking_time_off (academy_id, starts_at);

alter table public.booking_time_off enable row level security;

create policy "booking time off: staff read"
  on public.booking_time_off for select to authenticated
  using (app.is_staff(academy_id));
-- An admin closes the academy; an instructor closes their own diary. A trainer
-- must not be able to shut the whole academy, which is why this is is_admin and
-- not is_staff.
create policy "booking time off: admin or own insert"
  on public.booking_time_off for insert to authenticated
  with check (app.is_admin(academy_id) or app.owns_instructor(instructor_id));
create policy "booking time off: admin or own update"
  on public.booking_time_off for update to authenticated
  using (app.is_admin(academy_id) or app.owns_instructor(instructor_id))
  with check (app.is_admin(academy_id) or app.owns_instructor(instructor_id));
create policy "booking time off: admin or own delete"
  on public.booking_time_off for delete to authenticated
  using (app.is_admin(academy_id) or app.owns_instructor(instructor_id));

comment on table public.booking_time_off is
  'A closed window. instructor_id null closes the whole academy (holiday); set closes one diary (leave).';

-- ---------------------------------------------------------------------------
-- The booking itself — the only row a slot ever becomes.
-- ---------------------------------------------------------------------------
create table if not exists public.appointments (
  id            uuid primary key default gen_random_uuid(),
  academy_id    uuid not null references public.academies(id) on delete cascade,
  instructor_id uuid not null,
  student_id    uuid not null,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  status        public.appointment_status not null default 'booked',
  -- Was the instructor picked by round robin? Kept because "why did I get this
  -- teacher" is the first question asked of an auto-assigning system.
  auto_assigned boolean not null default false,
  location      text,
  -- The student's "what I want to cover".
  note          text,
  staff_note    text,
  cancelled_at  timestamptz,
  cancelled_by  uuid references auth.users(id) on delete set null,
  cancel_reason text,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint appointments_range_check check (ends_at > starts_at),
  constraint appointments_academy_id_instructor_id_fkey
    foreign key (academy_id, instructor_id)
    references public.instructors(academy_id, id) on delete cascade,
  constraint appointments_academy_id_student_id_fkey
    foreign key (academy_id, student_id)
    references public.students(academy_id, id) on delete cascade
);

-- The double-booking guard. Checking availability and then inserting is two
-- statements and therefore a race; this is one. Cancelled and no-show rows drop
-- out of the predicate, so cancelling frees the slot with no extra write.
alter table public.appointments
  add constraint appointments_instructor_no_overlap
  exclude using gist (
    instructor_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status in ('booked', 'completed'));

-- And the same for the other side: nobody is in two rooms at 15:00.
alter table public.appointments
  add constraint appointments_student_no_overlap
  exclude using gist (
    student_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status in ('booked', 'completed'));

create index if not exists appointments_academy_id_starts_at_idx
  on public.appointments (academy_id, starts_at);
create index if not exists appointments_student_id_starts_at_idx
  on public.appointments (student_id, starts_at desc);

alter table public.appointments enable row level security;

create policy "appointments: staff read all, student read own"
  on public.appointments for select to authenticated
  using (app.is_staff(academy_id) or app.owns_student(student_id));
create policy "appointments: staff insert"
  on public.appointments for insert to authenticated
  with check (app.is_staff(academy_id));
create policy "appointments: staff update"
  on public.appointments for update to authenticated
  using (app.is_staff(academy_id)) with check (app.is_staff(academy_id));
create policy "appointments: admins delete"
  on public.appointments for delete to authenticated
  using (app.is_admin(academy_id));

-- Students get no DML policy at all — the same standing as
-- assessment_questions. Booking has to pick an instructor fairly and enforce a
-- notice period, and a WITH CHECK expression cannot do either. book_appointment
-- and cancel_appointment are the only doors.

create trigger set_updated_at
  before update on public.appointments
  for each row execute function app.set_updated_at();

comment on table public.appointments is
  'A one-to-one session. Students write only through book_appointment / cancel_appointment.';

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- The caller's student record, if it is currently entitled to book. Mirrors the
-- membership + record test in app.is_enrolled rather than reusing
-- app.my_student_id, which does not look at academy_members — suspending a
-- member has to stop them taking teacher time, immediately.
create or replace function app.bookable_student(_academy_id uuid)
returns uuid
language sql
stable
security definer
set search_path to ''
as $$
  select s.id
  from public.students s
  join public.academy_members m
    on m.academy_id = s.academy_id
   and m.user_id    = s.user_id
   and m.status     = 'active'
  where s.academy_id = _academy_id
    and s.user_id    = (select auth.uid())
    and s.archived_at is null
    and s.status in ('active', 'trial')
  limit 1;
$$;

-- Every free slot in a date range, as (instructor, start, end).
--
-- The range is LOCAL to the academy: `_from`/`_to` are calendar days, and the
-- wall-clock window is converted per day, so a tenant in another timezone (or a
-- DST change) needs no special case here and none in the client. The days are
-- walked as integer offsets rather than generate_series(date, date, interval),
-- which is ambiguous between the timestamp and timestamptz overloads — and
-- resolving to timestamptz would re-read each day in the SESSION timezone,
-- silently shifting every slot for a caller outside Malaysia.
--
-- Returns nothing at all when booking is closed: "closed" and "fully booked"
-- are the same answer to the only question this function is asked.
create or replace function app.booking_slots(
  _academy_id uuid,
  _from date,
  _to date
)
returns table (instructor_id uuid, starts_at timestamptz, ends_at timestamptz)
language sql
stable
security definer
set search_path to ''
as $$
  with cfg as (
    select
      make_interval(mins => s.slot_minutes)              as len,
      now() + make_interval(hours => s.min_notice_hours) as lo,
      now() + make_interval(days => s.horizon_days)      as hi,
      a.timezone                                         as tz
    from public.academy_booking_settings s
    join public.academies a on a.id = s.academy_id
    where s.academy_id = _academy_id and s.is_open
  ),
  teacher as (
    select i.id
    from public.instructors i
    where i.academy_id = _academy_id
      and i.is_bookable
      and i.status = 'active'
      and i.archived_at is null
  ),
  slot as (
    select t.id as instructor_id, g.s as starts_at, g.s + c.len as ends_at
    from cfg c
    cross join generate_series(0, (_to - _from)) as off(n)
    join public.booking_hours h
      on h.academy_id = _academy_id
     and h.weekday    = extract(dow from (_from + off.n))::smallint
    cross join teacher t
    cross join lateral generate_series(
      ((_from + off.n) + h.start_time) at time zone c.tz,
      (((_from + off.n) + h.end_time) at time zone c.tz) - c.len,
      c.len
    ) as g(s)
    where g.s >= c.lo and g.s < c.hi
  )
  select s.instructor_id, s.starts_at, s.ends_at
  from slot s
  where not exists (
    select 1 from public.booking_time_off o
    where o.academy_id = _academy_id
      and (o.instructor_id is null or o.instructor_id = s.instructor_id)
      and tstzrange(o.starts_at, o.ends_at) && tstzrange(s.starts_at, s.ends_at)
  )
  and not exists (
    select 1 from public.appointments a
    where a.instructor_id = s.instructor_id
      and a.status in ('booked', 'completed')
      and tstzrange(a.starts_at, a.ends_at) && tstzrange(s.starts_at, s.ends_at)
  );
$$;

-- ---------------------------------------------------------------------------
-- What the learner may see.
--
-- The instructor list is included ONLY in student_choice mode. `instructors` is
-- staff-readable, so naming the free teachers under round robin would both leak
-- a table students cannot read and undermine the point of the mode — the whole
-- reason an academy picks it is that the choice is not the student's to make.
-- ---------------------------------------------------------------------------
create or replace function public.get_booking_options(
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
  v_student uuid := app.bookable_student(_academy_id);
  v_cfg     public.academy_booking_settings;
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

  select count(*) into v_open
  from public.appointments
  where student_id = v_student and status = 'booked' and starts_at > now();

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
    'instructors', case when v_cfg.assignment_mode = 'student_choice' then (
      select coalesce(json_agg(json_build_object(
        'id', i.id, 'full_name', i.full_name, 'avatar_url', i.avatar_url
      ) order by i.full_name), '[]'::json)
      from public.instructors i where i.id = any(g.ids)
    ) end
  ) order by g.starts_at), '[]'::json)
  into v_slots
  from grouped g;

  return json_build_object(
    'is_open', true,
    'assignment_mode', v_cfg.assignment_mode,
    'slot_minutes', v_cfg.slot_minutes,
    'location', v_cfg.location,
    'max_open_per_student', v_cfg.max_open_per_student,
    'open_count', v_open,
    'slots', v_slots
  );
end;
$$;

-- The learner's own list. An RPC and not a plain select because it carries the
-- instructor's name, and `instructors` is not readable by a student.
create or replace function public.get_my_appointments(_academy_id uuid)
returns json
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce(json_agg(json_build_object(
    'id', a.id,
    'starts_at', a.starts_at,
    'ends_at', a.ends_at,
    'status', a.status,
    'location', a.location,
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

-- ---------------------------------------------------------------------------
-- Book.
--
-- One function for both callers. `_student_id` null means "me" (the learner);
-- set, it means staff booking on somebody's behalf, and staff are the only ones
-- allowed to pass it. Two entry points would be two sets of rules, and the
-- round-robin ordering is the part that must not drift.
-- ---------------------------------------------------------------------------
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

  -- student_choice means the student names the instructor. Staff may also name
  -- one under round robin — overriding the rota for a particular pairing is the
  -- reason the office is in the loop at all.
  if v_cfg.assignment_mode = 'student_choice' or (v_staff and _instructor_id is not null) then
    if _instructor_id is null then
      raise exception 'Pick an instructor for this session';
    end if;
    if not (_instructor_id = any(v_cands)) then
      raise exception 'That instructor is no longer free at that time';
    end if;
    v_cands := array[_instructor_id];
    v_auto  := false;
  else
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

-- ---------------------------------------------------------------------------
-- Cancel. Staff at any time; the student up to the same notice they had to give
-- to book it. Status only — the row stays as the record that it happened.
-- ---------------------------------------------------------------------------
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

  if not v_staff then
    -- Same message as a missing row on purpose: whether an id exists is not
    -- something a stranger should be able to probe.
    if not app.owns_student(v_row.student_id) then
      raise exception 'Appointment not found';
    end if;
    select s.min_notice_hours into v_notice
    from public.academy_booking_settings s where s.academy_id = v_row.academy_id;
    if v_row.starts_at < now() + make_interval(hours => coalesce(v_notice, 0)) then
      raise exception 'Too late to cancel — please contact the academy';
    end if;
  end if;

  if v_row.status <> 'booked' then
    raise exception 'That session is not open';
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

revoke all on function app.bookable_student(uuid) from public, anon, authenticated;
revoke all on function app.booking_slots(uuid, date, date) from public, anon, authenticated;
revoke all on function public.get_booking_options(uuid, date, date) from public, anon;
revoke all on function public.get_my_appointments(uuid) from public, anon;
revoke all on function public.book_appointment(uuid, timestamptz, uuid, text, uuid) from public, anon;
revoke all on function public.cancel_appointment(uuid, text) from public, anon;

grant execute on function public.get_booking_options(uuid, date, date) to authenticated;
grant execute on function public.get_my_appointments(uuid) to authenticated;
grant execute on function public.book_appointment(uuid, timestamptz, uuid, text, uuid) to authenticated;
grant execute on function public.cancel_appointment(uuid, text) to authenticated;
