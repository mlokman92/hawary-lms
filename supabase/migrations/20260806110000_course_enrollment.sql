-- Course enrollment as an academy-joining intent.
--
-- The academy publishes ONE public link. Someone opens it, signs up or signs in,
-- picks a course, and is a member from that moment. The course itself stays
-- shut until staff say otherwise:
--
--   anyone can enter an academy · COURSE access is what staff grant
--
-- Why the request is just `enrollments.status = 'pending'` and not a table of
-- its own: the student record exists by the time anything is requested, because
-- picking a course is what creates it. `app.is_enrolled` already requires
-- 'active', so a pending row carries no content access, and the existing
-- `enrollments: staff update` policy already lets staff move it — approving is
-- an UPDATE, not an RPC. Full note: docs/course-enrollment.md

-- ---------------------------------------------------------------------------
-- One public link per academy.
-- ---------------------------------------------------------------------------
create table if not exists public.academy_enrollment_settings (
  academy_id uuid primary key references public.academies(id) on delete cascade,
  -- Off by default: an academy opts in to being publicly joinable.
  is_open    boolean not null default false,
  intro      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.academy_enrollment_settings enable row level security;

create policy "academy enrollment settings: staff read"
  on public.academy_enrollment_settings for select to authenticated
  using (app.is_staff(academy_id));
create policy "academy enrollment settings: admin insert"
  on public.academy_enrollment_settings for insert to authenticated
  with check (app.is_admin(academy_id));
create policy "academy enrollment settings: admin update"
  on public.academy_enrollment_settings for update to authenticated
  using (app.is_admin(academy_id)) with check (app.is_admin(academy_id));

create trigger set_updated_at
  before update on public.academy_enrollment_settings
  for each row execute function app.set_updated_at();

comment on table public.academy_enrollment_settings is
  'The academy''s one public enrollment link. Absent row or is_open=false means /enroll/<slug> is closed.';

-- ---------------------------------------------------------------------------
-- Per course: only what is genuinely per course. Which courses can be picked,
-- how many seats, and when picking stops. There is no form configuration — the
-- join form asks for a course and nothing else.
-- ---------------------------------------------------------------------------
create table if not exists public.course_enrollment_settings (
  course_id  uuid primary key,
  academy_id uuid not null,
  -- Default false: publishing a course must not quietly put it on a public form.
  is_open    boolean not null default false,
  -- null = unlimited. Capacity does NOT close the course; see app.enrollment_open.
  capacity   integer,
  closes_at  timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint course_enrollment_settings_academy_id_fkey
    foreign key (academy_id) references public.academies(id) on delete cascade,
  constraint course_enrollment_settings_academy_id_course_id_fkey
    foreign key (academy_id, course_id)
    references public.courses(academy_id, id) on delete cascade,
  constraint course_enrollment_settings_capacity_check
    check (capacity is null or capacity > 0)
);

create index if not exists course_enrollment_settings_academy_id_idx
  on public.course_enrollment_settings (academy_id);

alter table public.course_enrollment_settings enable row level security;

-- Read is is_staff (the back-office needs to know whether a course is open);
-- write is can_grade_course, the same "a course you are responsible for" test
-- duplicate_course uses.
create policy "course enrollment settings: staff read"
  on public.course_enrollment_settings for select to authenticated
  using (app.is_staff(academy_id));
create policy "course enrollment settings: graders insert"
  on public.course_enrollment_settings for insert to authenticated
  with check (app.can_grade_course(course_id));
create policy "course enrollment settings: graders update"
  on public.course_enrollment_settings for update to authenticated
  using (app.can_grade_course(course_id))
  with check (app.can_grade_course(course_id));
create policy "course enrollment settings: admins delete"
  on public.course_enrollment_settings for delete to authenticated
  using (app.is_admin(academy_id));

create trigger set_updated_at
  before update on public.course_enrollment_settings
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- Helpers. SECURITY DEFINER so the anon page function can call them without any
-- table becoming readable by anon.
-- ---------------------------------------------------------------------------

-- The same predicate as the course_enrollment_stats view, extracted so the
-- public page and the staff queue can never disagree about what "full" means.
create or replace function app.course_seats_taken(_course_id uuid)
returns integer
language sql
stable
security definer
set search_path to ''
as $$
  select count(*)::integer
  from public.enrollments e
  join public.students s
    on s.academy_id = e.academy_id
   and s.id         = e.student_id
  where e.course_id = _course_id
    and e.status    = 'active'
    and s.archived_at is null;
$$;

-- Capacity is deliberately NOT part of this. Full does not mean closed: a queue
-- of people who want the next seat is exactly why approval exists.
create or replace function app.enrollment_open(_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (
    select 1
    from public.course_enrollment_settings s
    join public.courses c on c.id = s.course_id
    where s.course_id = _course_id
      and s.is_open
      and c.status = 'published'
      and (s.closes_at is null or s.closes_at > now())
  );
$$;

-- ---------------------------------------------------------------------------
-- The public page: academy branding plus the courses that can be picked.
-- Explicit column list — `courses` and `academies` are not readable by a
-- non-member and must stay that way.
-- ---------------------------------------------------------------------------
create or replace function public.get_academy_enrollment(_slug text)
returns json
language sql
stable
security definer
set search_path to ''
as $$
  select json_build_object(
    'academy', json_build_object(
      'id', a.id, 'name', a.name, 'slug', a.slug, 'logo_url', a.logo_url
    ),
    'is_open', coalesce(s.is_open, false),
    'intro', s.intro,
    'courses', coalesce((
      select json_agg(json_build_object(
        'id', c.id, 'title', c.title, 'code', c.code,
        'description', c.description, 'price_sen', c.price_sen,
        'currency', c.currency, 'capacity', cs.capacity,
        'seats_taken', app.course_seats_taken(c.id), 'closes_at', cs.closes_at
      ) order by c.title)
      from public.courses c
      join public.course_enrollment_settings cs on cs.course_id = c.id
      where c.academy_id = a.id and app.enrollment_open(c.id)
    ), '[]'::json)
  )
  from public.academies a
  left join public.academy_enrollment_settings s on s.academy_id = a.id
  where lower(a.slug) = lower(btrim(_slug)) and a.status = 'active';
$$;

-- ---------------------------------------------------------------------------
-- Join, and ask for a course in the same breath.
--
-- Idempotent and re-entrant: an existing member calling it again simply requests
-- another course, which is why there is no second function for that.
-- ---------------------------------------------------------------------------
create or replace function public.join_academy(_slug text, _course_id uuid)
returns json
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid       uuid := (select auth.uid());
  v_academy   uuid;
  v_open      boolean;
  v_student   uuid;
  v_verified  text;
  v_name      text;
  v_phone     text;
  v_email     text;
  v_enrolment uuid;
  v_status    public.enrollment_status;
begin
  if v_uid is null then raise exception 'You must be signed in to join'; end if;

  select a.id, coalesce(s.is_open, false)
    into v_academy, v_open
  from public.academies a
  left join public.academy_enrollment_settings s on s.academy_id = a.id
  where lower(a.slug) = lower(btrim(_slug)) and a.status = 'active';

  if v_academy is null or not v_open then
    raise exception 'This academy is not open for enrolment';
  end if;

  -- Staff are already inside; joining as a student would hand
  -- link_claimed_record a membership to reconcile for no reason.
  if app.is_staff(v_academy) then
    raise exception 'You are already staff of this academy';
  end if;

  if not exists (
    select 1 from public.courses c
    where c.id = _course_id and c.academy_id = v_academy
  ) or not app.enrollment_open(_course_id) then
    raise exception 'That course is not open for enrolment';
  end if;

  select lower(u.email) into v_email from auth.users u where u.id = v_uid;
  select lower(u.email) into v_verified
    from auth.users u where u.id = v_uid and u.email_confirmed_at is not null;
  select p.full_name, p.phone into v_name, v_phone
    from public.profiles p where p.id = v_uid;

  -- 1. Already have a record here.
  select s.id into v_student
  from public.students s
  where s.academy_id = v_academy and s.user_id = v_uid and s.archived_at is null;

  -- 2. Otherwise adopt an unlinked record carrying the caller's CONFIRMED email.
  --    Same standard my_pending_invitations holds: without a token, a verified
  --    email is the entire proof of identity. It is also what stops a
  --    CSV-imported student who then uses the public link becoming a duplicate.
  if v_student is null and v_verified is not null then
    select s.id into v_student
    from public.students s
    where s.academy_id = v_academy
      and s.user_id is null
      and s.archived_at is null
      and lower(s.email) = v_verified
    order by s.created_at
    limit 1;
  end if;

  -- 3. Otherwise a fresh record, from the profile they already filled in.
  if v_student is null then
    insert into public.students (academy_id, student_no, full_name, phone, email, status)
      values (v_academy, '', v_name, v_phone, v_email, 'active')
      returning id into v_student;
  end if;

  -- Links the record to the account and upserts the membership, with the
  -- archived/already-linked guards and the monotonic role ladder.
  perform app.link_claimed_record('student', v_student, v_academy, 'student', v_uid);

  -- 'pending' carries no content access: app.is_enrolled requires 'active'.
  insert into public.enrollments (academy_id, course_id, student_id, status)
    values (v_academy, _course_id, v_student, 'pending')
    on conflict (course_id, student_id) do nothing;

  select e.id, e.status into v_enrolment, v_status
  from public.enrollments e
  where e.course_id = _course_id and e.student_id = v_student;

  return json_build_object(
    'academy_id', v_academy,
    'student_id', v_student,
    'enrollment_id', v_enrolment,
    'status', v_status
  );
end;
$$;

revoke all on function public.get_academy_enrollment(text) from public;
revoke all on function public.join_academy(text, uuid) from public, anon;
grant execute on function public.get_academy_enrollment(text) to anon, authenticated;
grant execute on function public.join_academy(text, uuid) to authenticated;
