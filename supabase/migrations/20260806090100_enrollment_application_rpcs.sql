-- The enrollment application API.
--
-- Two functions are granted to anon: they are the public course page and the
-- academy directory. Both project an explicit column list, because `courses` and
-- `academies` are not readable by a non-member and must stay that way.
--
-- Everything that writes is authenticated-only and SECURITY DEFINER; the table
-- itself has no client DML at all.

-- ---------------------------------------------------------------------------
-- Public reads
-- ---------------------------------------------------------------------------

-- A closed intake still resolves, and reports is_open = false. "This intake is
-- closed" is a far better answer to a poster link than "not found", and a
-- published title and price is not a secret. A course with no settings row has
-- no enrollment page at all and resolves to null.
create or replace function public.get_enrollment_page(_slug text, _course uuid)
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
    'course', json_build_object(
      'id', c.id, 'title', c.title, 'code', c.code,
      'description', c.description, 'price_sen', c.price_sen, 'currency', c.currency
    ),
    'intro', s.intro,
    'required_fields', s.required_fields,
    'is_open', app.enrollment_open(c.id),
    'closes_at', s.closes_at,
    'capacity', s.capacity,
    'seats_taken', app.course_seats_taken(c.id)
  )
  from public.courses c
  join public.academies a on a.id = c.academy_id
  join public.course_enrollment_settings s on s.course_id = c.id
  where c.id = _course
    and lower(a.slug) = lower(btrim(_slug))
    and a.status = 'active'
    and c.status = 'published';
$$;

create or replace function public.list_enrollment_openings(_slug text)
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
    'courses', coalesce((
      select json_agg(json_build_object(
        'id', c.id, 'title', c.title, 'code', c.code,
        'description', c.description, 'price_sen', c.price_sen,
        'currency', c.currency, 'closes_at', s.closes_at,
        'capacity', s.capacity, 'seats_taken', app.course_seats_taken(c.id)
      ) order by c.title)
      from public.courses c
      join public.course_enrollment_settings s on s.course_id = c.id
      where c.academy_id = a.id
        and s.is_listed
        and app.enrollment_open(c.id)
    ), '[]'::json)
  )
  from public.academies a
  where lower(a.slug) = lower(btrim(_slug))
    and a.status = 'active';
$$;

-- ---------------------------------------------------------------------------
-- Applicant writes
-- ---------------------------------------------------------------------------

create or replace function public.apply_to_course(_course_id uuid, _details jsonb)
returns json
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_academy uuid;
  v_req     text[];
  v_field   text;
  v_email   text;
  v_id      uuid;
begin
  if v_uid is null then
    raise exception 'You must be signed in to apply';
  end if;

  select c.academy_id, s.required_fields
    into v_academy, v_req
  from public.courses c
  join public.course_enrollment_settings s on s.course_id = c.id
  where c.id = _course_id;

  -- One sentence for "no such course", "not published" and "closed": a stranger
  -- probing course ids learns nothing from it either way.
  if v_academy is null or not app.enrollment_open(_course_id) then
    raise exception 'This course is not accepting applications';
  end if;

  -- A trainer applying to their own course is a mistake, not a use case, and it
  -- would hand link_claimed_record a member row to reconcile for no reason.
  if app.is_staff(v_academy) then
    raise exception 'Staff of this academy cannot apply for enrolment';
  end if;

  if exists (
    select 1 from public.enrollment_applications
    where course_id = _course_id and user_id = v_uid and status = 'pending'
  ) then
    raise exception 'You already have an application awaiting review for this course';
  end if;

  foreach v_field in array v_req loop
    if btrim(coalesce(_details ->> v_field, '')) = '' then
      raise exception 'Please fill in every required field';
    end if;
  end loop;

  if btrim(coalesce(_details ->> 'full_name', '')) = '' then
    raise exception 'Please fill in every required field';
  end if;

  -- Contact email may differ from the login, but it can never be blank: fall
  -- back to the account's own address.
  select lower(u.email) into v_email from auth.users u where u.id = v_uid;
  v_email := lower(coalesce(
    nullif(btrim(coalesce(_details ->> 'email', '')), ''),
    v_email
  ));
  if v_email is null then
    raise exception 'Your account has no email address';
  end if;

  begin
    insert into public.enrollment_applications (
      academy_id, course_id, user_id, full_name, email, phone, ic_number,
      date_of_birth, gender, address, organization, notes
    ) values (
      v_academy, _course_id, v_uid,
      btrim(_details ->> 'full_name'),
      v_email,
      nullif(btrim(coalesce(_details ->> 'phone', '')), ''),
      nullif(btrim(coalesce(_details ->> 'ic_number', '')), ''),
      nullif(btrim(coalesce(_details ->> 'date_of_birth', '')), '')::date,
      nullif(btrim(coalesce(_details ->> 'gender', '')), '')::public.gender,
      nullif(btrim(coalesce(_details ->> 'address', '')), ''),
      nullif(btrim(coalesce(_details ->> 'organization', '')), ''),
      nullif(btrim(coalesce(_details ->> 'notes', '')), '')
    )
    returning id into v_id;
  exception when unique_violation then
    raise exception 'You already have an application awaiting review for this course';
  end;

  return json_build_object('id', v_id, 'status', 'pending');
end;
$$;

create or replace function public.withdraw_application(_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  update public.enrollment_applications
    set status = 'withdrawn'
    where id = _id
      and user_id = (select auth.uid())
      and status = 'pending';
  if not found then
    raise exception 'Application not found';
  end if;
end;
$$;

-- An applicant is not a member, so they cannot read `academies` or `courses`
-- through RLS. Their own status list therefore has to come from a function
-- rather than a PostgREST embed.
create or replace function public.my_enrollment_applications()
returns table (
  id uuid,
  academy_id uuid,
  academy_name text,
  academy_slug text,
  academy_logo_url text,
  course_id uuid,
  course_title text,
  status public.enrollment_application_status,
  review_note text,
  created_at timestamptz,
  reviewed_at timestamptz
)
language sql
stable
security definer
set search_path to ''
as $$
  select e.id, e.academy_id, a.name, a.slug, a.logo_url,
         e.course_id, c.title, e.status, e.review_note, e.created_at, e.reviewed_at
  from public.enrollment_applications e
  join public.academies a on a.id = e.academy_id
  join public.courses c   on c.id = e.course_id
  where e.user_id = (select auth.uid())
  order by e.created_at desc;
$$;

-- ---------------------------------------------------------------------------
-- Review
-- ---------------------------------------------------------------------------

-- Existing student records that might be this applicant.
--
-- `linkable` is the load-bearing column. It is true ONLY when the record's email
-- matches the applicant's CONFIRMED auth email — the same standard
-- my_pending_invitations holds, because without a token a verified email is the
-- entire proof of identity. An IC match, or a match on the address they typed
-- into the form, is shown as a warning and nothing more: the reviewer can see it
-- and go fix the roster by hand, but it cannot be used to attach an account.
create or replace function public.application_match_candidates(_id uuid)
returns table (
  student_id uuid,
  student_no text,
  full_name text,
  email text,
  ic_number text,
  match_reason text,
  linkable boolean
)
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  a public.enrollment_applications;
  v_verified text;
begin
  select * into a from public.enrollment_applications where id = _id;
  if not found then raise exception 'Application not found'; end if;
  if not app.can_grade_course(a.course_id) then
    raise exception 'Not authorized to review applications for this course';
  end if;

  select lower(u.email) into v_verified
  from auth.users u
  where u.id = a.user_id and u.email_confirmed_at is not null;

  return query
  select s.id, s.student_no, s.full_name, s.email, s.ic_number,
         case
           when v_verified is not null and lower(s.email) = v_verified then 'verified_email'
           when lower(s.email) = lower(a.email) then 'email'
           else 'ic'
         end,
         (v_verified is not null and lower(s.email) = v_verified)
  from public.students s
  where s.academy_id = a.academy_id
    and s.archived_at is null
    and s.user_id is null
    and (
      (v_verified is not null and lower(s.email) = v_verified)
      or lower(s.email) = lower(a.email)
      or (a.ic_number is not null and s.ic_number = a.ic_number)
    )
  order by 7 desc, s.created_at;
end;
$$;

-- Approve or reject. Gated by app.can_grade_course: admin academy-wide, trainer
-- only the courses they are assigned to — the same scope as the grading queue.
--
-- No invoice is created. Billing stays a deliberate act on /payments.
create or replace function public.review_enrollment_application(
  _id               uuid,
  _decision         text,
  _note             text default null,
  _link_student_id  uuid default null,
  _force            boolean default false
)
returns json
language plpgsql
security definer
set search_path to ''
as $$
declare
  a          public.enrollment_applications;
  v_uid      uuid := (select auth.uid());
  v_student  uuid;
  v_capacity integer;
  v_taken    integer;
  v_note     text := nullif(btrim(coalesce(_note, '')), '');
begin
  if v_uid is null then raise exception 'You must be signed in'; end if;
  if _decision not in ('approved', 'rejected') then
    raise exception 'Decision must be approved or rejected';
  end if;

  select * into a from public.enrollment_applications where id = _id for update;
  if not found then raise exception 'Application not found'; end if;
  if not app.can_grade_course(a.course_id) then
    raise exception 'Not authorized to review applications for this course';
  end if;
  if a.status <> 'pending' then
    raise exception 'This application has already been reviewed';
  end if;

  if _decision = 'rejected' then
    update public.enrollment_applications
      set status = 'rejected', review_note = v_note,
          reviewed_by = v_uid, reviewed_at = now()
      where id = a.id;
    return json_build_object('status', 'rejected');
  end if;

  select s.capacity into v_capacity
  from public.course_enrollment_settings s where s.course_id = a.course_id;
  v_taken := app.course_seats_taken(a.course_id);
  if not _force and v_capacity is not null and v_taken >= v_capacity then
    raise exception 'This intake is full (% of % seats taken)', v_taken, v_capacity;
  end if;

  -- 1. The account may already hold a student record here (applying for a
  --    second course is the common case).
  select s.id into v_student
  from public.students s
  where s.academy_id = a.academy_id
    and s.user_id    = a.user_id
    and s.archived_at is null;

  -- 2. Otherwise the reviewer may point at an existing unlinked record — but
  --    only one this function itself rates linkable.
  if v_student is null and _link_student_id is not null then
    if not exists (
      select 1 from public.application_match_candidates(a.id) m
      where m.student_id = _link_student_id and m.linkable
    ) then
      raise exception 'That student record cannot be linked to this applicant';
    end if;
    v_student := _link_student_id;
  end if;

  -- 3. Otherwise a fresh record. student_no is minted by app.set_student_no.
  if v_student is null then
    insert into public.students (
      academy_id, student_no, full_name, gender, ic_number, date_of_birth,
      phone, email, address, organization, status, created_by
    ) values (
      a.academy_id, '', a.full_name, a.gender, a.ic_number, a.date_of_birth,
      a.phone, a.email, a.address, a.organization, 'active', v_uid
    )
    returning id into v_student;
  else
    -- Fill blanks only. Self-reported detail must never overwrite what staff
    -- have curated on an existing record.
    update public.students s
      set full_name    = coalesce(s.full_name, a.full_name),
          gender       = coalesce(s.gender, a.gender),
          ic_number    = coalesce(s.ic_number, a.ic_number),
          date_of_birth= coalesce(s.date_of_birth, a.date_of_birth),
          phone        = coalesce(s.phone, a.phone),
          email        = coalesce(s.email, a.email),
          address      = coalesce(s.address, a.address),
          organization = coalesce(s.organization, a.organization)
      where s.id = v_student;
  end if;

  -- Links the record to the account and upserts the membership. Reused rather
  -- than reimplemented: it already holds the archived/already-linked guards, the
  -- monotonic role ladder (admin > trainer > student, never demoted) and
  -- suspended-stays-suspended. It takes the caller explicitly, so passing the
  -- APPLICANT's id rather than auth.uid() is supported by design.
  perform app.link_claimed_record('student', v_student, a.academy_id, 'student', a.user_id);

  insert into public.enrollments (academy_id, course_id, student_id, status)
    values (a.academy_id, a.course_id, v_student, 'active')
    on conflict (course_id, student_id) do update set status = 'active';

  update public.enrollment_applications
    set status = 'approved', student_id = v_student, review_note = v_note,
        reviewed_by = v_uid, reviewed_at = now()
    where id = a.id;

  return json_build_object('status', 'approved', 'student_id', v_student);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants. Only the two public readers reach anon.
-- ---------------------------------------------------------------------------
revoke all on function public.get_enrollment_page(text, uuid) from public;
revoke all on function public.list_enrollment_openings(text) from public;
revoke all on function public.apply_to_course(uuid, jsonb) from public, anon;
revoke all on function public.withdraw_application(uuid) from public, anon;
revoke all on function public.my_enrollment_applications() from public, anon;
revoke all on function public.application_match_candidates(uuid) from public, anon;
revoke all on function public.review_enrollment_application(uuid, text, text, uuid, boolean) from public, anon;

grant execute on function public.get_enrollment_page(text, uuid) to anon, authenticated;
grant execute on function public.list_enrollment_openings(text) to anon, authenticated;
grant execute on function public.apply_to_course(uuid, jsonb) to authenticated;
grant execute on function public.withdraw_application(uuid) to authenticated;
grant execute on function public.my_enrollment_applications() to authenticated;
grant execute on function public.application_match_candidates(uuid) to authenticated;
grant execute on function public.review_enrollment_application(uuid, text, text, uuid, boolean) to authenticated;
