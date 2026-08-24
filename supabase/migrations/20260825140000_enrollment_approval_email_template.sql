-- ============================================================================
-- Per-course acceptance email
-- ----------------------------------------------------------------------------
-- The "you're enrolled" email is no longer one hardcoded template for the whole
-- product. Each course carries its own body, and a course without one sends
-- NOTHING. Silence is the default: 5 of 7 courses have no
-- course_enrollment_settings row at all, and that is a valid, permanent "no".
--
-- It lives on course_enrollment_settings rather than on courses because it is
-- enrollment configuration, not course metadata — it sits beside is_open,
-- capacity and closes_at, and only a course that accepts requests can ever
-- produce an approval to email about.
--
-- The subject stays generated ("You're enrolled in <course> at <academy>"), so
-- there is exactly one field to fill and no way to ship a blank subject line.
-- ============================================================================

alter table public.course_enrollment_settings
  add column if not exists access_email_body text;

comment on column public.course_enrollment_settings.access_email_body is
  'Body of the acceptance email for this course, authored by staff on /enrollments. Supports {{student_name}}, {{course}} and {{academy}}; the "Open the course" button is appended automatically. NULL or blank means this course sends no acceptance email at all — that is the default and it is not an error.';

-- ----------------------------------------------------------------------------
-- Approve one enrollment request, and claim the right to email about it.
-- ----------------------------------------------------------------------------
-- Changed from the previous version: the claim now also requires the course to
-- have a non-blank acceptance email. Without that test approve_enrollment would
-- stamp access_email_at for a course that can never send, and the column would
-- record a send that was never even attempted.
-- ----------------------------------------------------------------------------
create or replace function public.approve_enrollment(_enrollment_id uuid)
returns json
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row    public.enrollments%rowtype;
  v_email  text;
  v_body   text;
  v_notify boolean;
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

  -- No student data and no template text crosses back to the client. The Edge
  -- Function re-reads both itself, under the caller's own JWT.
  return json_build_object('approved', true, 'notify', v_notify,
                           'status', 'active');
end;
$$;

comment on function public.approve_enrollment(uuid) is
  'Approve one enrollment request: locks the row, asserts it is not already active, flips it to active and claims one acceptance email — all in one statement, so two staff approving at once produce exactly one email. Claims only when the student has an address AND the course has a non-blank access_email_body. Returns {approved, notify, reason?, status?} and no student data.';

revoke all on function public.approve_enrollment(uuid) from public, anon;
grant execute on function public.approve_enrollment(uuid) to authenticated;
