-- Notification centre — the bell in the header.
--
-- One table, one recipient per row. The recipient is an ACCOUNT
-- (`auth.users`), not a student or instructor record: a record with nobody
-- attached has no inbox to open and no way to sign in and read this.
--
-- The row stores the EVENT, not a sentence. `kind` + `data` are the facts; the
-- client renders them through the dictionary, so a notification reads Malay for
-- a Malay reader and English for an English one. Storing "Session booked with
-- Cikgu Ali" would have frozen the language at write time, which is the one
-- thing the i18n work exists to prevent.
--
-- `data` is a snapshot, deliberately. It carries the other party's name and the
-- session time as they were when it happened, so the list needs no joins and a
-- later rename does not rewrite history.
--
-- Clients have NO DML. Rows are written by `app.notify` from inside
-- `book_appointment`; read state moves through two RPCs. Without that, the
-- SELECT policy's `user_id = auth.uid()` would also authorise a user to edit
-- their own notification's `kind` and `data` — harmless in effect, but it is
-- not a thing anybody should be able to do.

create type public.notification_kind as enum ('appointment_booked');

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.academies(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       public.notification_kind not null,
  data       jsonb not null default '{}'::jsonb,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.notifications is
  'One row per recipient per event. kind + data are the facts; the client renders the words, so the language follows the reader.';

-- The list: newest first, for one person in one academy — the bell is scoped to
-- the academy switcher like everything else.
create index notifications_user_academy_created_idx
  on public.notifications (user_id, academy_id, created_at desc);

-- The count. Partial, because the unread set is the small one and stays small.
create index notifications_unread_idx
  on public.notifications (user_id, academy_id)
  where read_at is null;

alter table public.notifications enable row level security;

create policy "notifications: recipient reads own"
  on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));

-- --- writing ----------------------------------------------------------------
-- Internal, in the `app` schema, so it is not reachable over PostgREST. A null
-- recipient is a no-op rather than an error: "the student has not claimed their
-- record yet" is the ordinary case, not a failure to notify.
create or replace function app.notify(
  _academy_id uuid,
  _user_id    uuid,
  _kind       public.notification_kind,
  _data       jsonb
) returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (academy_id, user_id, kind, data)
  select _academy_id, _user_id, _kind, coalesce(_data, '{}'::jsonb)
  where _user_id is not null;
$$;

-- --- reading state ----------------------------------------------------------
-- Both are scoped to the caller by `user_id = auth.uid()` inside the statement,
-- so a stolen id from somebody else's list updates nothing. Both return the
-- number of rows they actually changed.
create or replace function public.mark_notifications_read(_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_n   integer;
begin
  if v_uid is null then raise exception 'You must be signed in'; end if;
  update public.notifications
     set read_at = now()
   where id = any(_ids)
     and user_id = v_uid
     and read_at is null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

create or replace function public.mark_all_notifications_read(_academy_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_n   integer;
begin
  if v_uid is null then raise exception 'You must be signed in'; end if;
  update public.notifications
     set read_at = now()
   where user_id = v_uid
     and academy_id = _academy_id
     and read_at is null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- --- the first event: a booking ---------------------------------------------
-- `book_appointment` gains a tail. Both parties are told IN THE SAME
-- TRANSACTION as the insert, which is the difference between this and the
-- confirmation email: the email is a second call from the browser and can be
-- lost, a notification cannot be — if the booking exists, so does it.
--
-- The person who did the booking is NOT notified. A notification about your own
-- click is a message telling you what you just did; the screen already said so,
-- and the confirmation email is the receipt. So a student booking themselves in
-- tells the instructor only, and staff booking on somebody's behalf tells both.
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

  -- Who to tell, read from the row that actually landed rather than from the
  -- loop variable.
  select s.user_id, s.full_name, i.user_id, i.full_name
    into v_stu_user, v_stu_name, v_ins_user, v_ins_name
  from public.appointments a
  join public.students s    on s.id = a.student_id
  join public.instructors i on i.id = a.instructor_id
  where a.id = v_id;

  if v_stu_user is distinct from v_uid then
    perform app.notify(_academy_id, v_stu_user, 'appointment_booked',
      jsonb_build_object(
        'appointment_id', v_id,
        'role',           'student',
        'with_name',      v_ins_name,
        'starts_at',      _starts_at,
        'ends_at',        v_ends,
        'tz',             v_tz
      ));
  end if;

  if v_ins_user is distinct from v_uid then
    perform app.notify(_academy_id, v_ins_user, 'appointment_booked',
      jsonb_build_object(
        'appointment_id', v_id,
        'role',           'instructor',
        'with_name',      v_stu_name,
        'starts_at',      _starts_at,
        'ends_at',        v_ends,
        'tz',             v_tz
      ));
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
