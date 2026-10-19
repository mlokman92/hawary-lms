-- A course's capacity is now a hard limit.
--
-- Until now `course_enrollment_settings.capacity` only displayed seats left: a
-- full course kept taking requests and staff could approve past it. The owner
-- wants the 41st refused — by approval, by the public link, by any route.
--
-- A seat is what app.course_seats_taken counts: an ACTIVE enrolment of an
-- unarchived student. Pending requests do not hold seats.

-- ---------------------------------------------------------------------------
-- The check, shared by the trigger, approve_enrollment and join_academy.
-- ---------------------------------------------------------------------------
create or replace function app.course_full(_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce((
    select s.capacity is not null
       and app.course_seats_taken(_course_id) >= s.capacity
    from public.course_enrollment_settings s
    where s.course_id = _course_id
  ), false);
$$;

revoke all on function app.course_full(uuid) from public, anon;
grant execute on function app.course_full(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The boundary. Every route into a seat (approve, the student page, the
-- course roster, bulk enrol, CSV import, SQL) writes enrollments, so the cap
-- lives on the table rather than in each caller.
--
-- Locking the settings row serializes the seat-taking writes for one course:
-- two admins approving the 40th and 41st at once take turns, and the second
-- counts after the first has committed. The count is inline, not
-- app.course_seats_taken, so it is a fresh statement snapshot taken after the
-- lock rather than the caller's.
-- ---------------------------------------------------------------------------
create or replace function app.enforce_course_capacity()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_capacity integer;
  v_taken    integer;
begin
  if new.status <> 'active' then return new; end if;
  if tg_op = 'UPDATE'
     and old.status = 'active'
     and old.course_id = new.course_id then
    return new;
  end if;

  select s.capacity into v_capacity
    from public.course_enrollment_settings s
   where s.course_id = new.course_id
   for update;

  if v_capacity is null then return new; end if;

  select count(*)::integer into v_taken
    from public.enrollments e
    join public.students st
      on st.academy_id = e.academy_id
     and st.id         = e.student_id
   where e.course_id = new.course_id
     and e.status    = 'active'
     and st.archived_at is null
     and e.id <> new.id;

  if v_taken >= v_capacity then
    raise exception 'This course is full (% of % seats taken)', v_taken, v_capacity
      using errcode = 'P0001', hint = 'course_full';
  end if;

  return new;
end;
$$;

revoke all on function app.enforce_course_capacity() from public, anon, authenticated;

create trigger enrollments_enforce_capacity
  before insert or update of status, course_id on public.enrollments
  for each row execute function app.enforce_course_capacity();

-- ---------------------------------------------------------------------------
-- approve_enrollment: answer `full` instead of letting the trigger throw, so
-- the request list can say why. Unchanged otherwise.
-- ---------------------------------------------------------------------------
create or replace function public.approve_enrollment(_enrollment_id uuid)
returns json
language plpgsql
set search_path to ''
as $function$
declare
  v_row     public.enrollments%rowtype;
  v_email   text;
  v_body    text;
  v_notify  boolean;
  v_invoice uuid;
begin
  -- (1) The mutex. FOR UPDATE is also the authorization check: RLS applies the
  -- UPDATE policy's USING clause here, so a caller who may not write this row
  -- finds nothing.
  select e.* into v_row
    from public.enrollments e
   where e.id = _enrollment_id
   for update;

  if not found then
    return json_build_object('approved', false, 'notify', false,
                             'reason', 'not_found');
  end if;

  if not app.is_staff(v_row.academy_id) then
    return json_build_object('approved', false, 'notify', false,
                             'reason', 'not_found');
  end if;

  -- (2) The FROM-state assertion. The loser of a race lands here: it re-read the
  -- tuple the winner committed. Nothing is written and nothing is sent.
  if v_row.status = 'active' then
    return json_build_object('approved', false, 'notify', false,
                             'reason', 'already_active', 'status', v_row.status);
  end if;

  -- (2b) No seat left. The trigger would refuse the UPDATE below anyway; this
  -- only turns the refusal into an answer. A race past it still hits the
  -- trigger, which holds the lock.
  if app.course_full(v_row.course_id) then
    return json_build_object('approved', false, 'notify', false,
                             'reason', 'full', 'status', v_row.status);
  end if;

  select nullif(btrim(s.email), '')
    into v_email
    from public.students s
   where s.academy_id = v_row.academy_id
     and s.id = v_row.student_id;

  -- No row, or a blank body, both mean the same thing: this course does not
  -- send an acceptance email. Not an error — the configured default.
  select nullif(btrim(ces.access_email_body), '')
    into v_body
    from public.course_enrollment_settings ces
   where ces.course_id = v_row.course_id;

  -- (3) The claim. Four conditions, deliberately separate from the transition:
  --   * only FROM 'pending';
  --   * only once ever — access_email_at is never cleared here;
  --   * only when there is somebody to send to;
  --   * only when the course actually has an acceptance email to send.
  v_notify := v_row.status = 'pending'
          and v_email is not null
          and v_body is not null
          and v_row.access_email_at is null;

  update public.enrollments e
     set status          = 'active',
         approved_at     = coalesce(e.approved_at, now()),
         access_email_at = case when v_notify then now() else e.access_email_at end
   where e.id = v_row.id;

  -- (4) The invoice. Accepted from `pending` only, and at most one per
  -- student — see app.ensure_course_invoice.
  if v_row.status = 'pending' then
    v_invoice := app.ensure_course_invoice(v_row.student_id, (select auth.uid()));
  end if;

  -- No student data and no template text crosses back to the client. The Edge
  -- Function re-reads both itself, under the caller's own JWT.
  return json_build_object('approved', true, 'notify', v_notify,
                           'status', 'active', 'invoice_id', v_invoice);
end;
$function$;

-- ---------------------------------------------------------------------------
-- join_academy: a full course takes no new requests. Someone who already has
-- a row on it (pending or active) calling again is not refused — the insert
-- below is a no-op for them anyway.
-- ---------------------------------------------------------------------------
create or replace function public.join_academy(_slug text, _course_id uuid)
returns json
language plpgsql
security definer
set search_path to ''
as $function$
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
  select nullif(btrim(p.full_name), ''), nullif(btrim(p.phone), '')
    into v_name, v_phone
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

  -- One student, one course. Checked before anything is written, so a refused
  -- request leaves no record, no link and no membership behind it.
  if v_student is not null and exists (
    select 1 from public.enrollments e
    where e.student_id = v_student
      and e.status <> 'cancelled'
      and e.course_id <> _course_id
  ) then
    raise exception 'You are already enrolled in a course at this academy';
  end if;

  -- No seat left. Also before anything is written.
  if app.course_full(_course_id) and not exists (
    select 1 from public.enrollments e
    where e.student_id = v_student
      and e.course_id = _course_id
      and e.status <> 'cancelled'
  ) then
    raise exception 'This course is full';
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
$function$;
