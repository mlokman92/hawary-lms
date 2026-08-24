-- ============================================================================
-- Enrollment approval email
-- ----------------------------------------------------------------------------
-- Approving a pending enrollment request is the one enrollment write that tells
-- the student anything. The other three paths stay silent by design:
--   * useEnrollStudent   — a staff INSERT of status 'active'
--   * bulkEnroll         — an UPSERT of status 'active', 100 rows a statement
--   * join_academy       — INSERT 'pending' ... ON CONFLICT DO NOTHING
--
-- Why this is an RPC and not a trigger. bulkEnroll's upsert resolves to
-- ON CONFLICT DO UPDATE and re-activates a *pending* student (classifyEmails
-- only excludes rows already 'active'), producing old.status='pending' ->
-- new.status='active' — byte-identical to an approve. No trigger can tell the
-- two apart, because the tuples are the same. Intent has to be declared by the
-- caller, and this function is the declaration.
--
-- Why the claim is in the same statement as the transition. Two staff clicking
-- Approve on the same request is the normal case, and a select-then-update
-- would race. Same argument as app.claim_incentive_payouts.
--
-- SECURITY INVOKER on purpose. RLS already scopes the caller: SELECT ... FOR
-- UPDATE is checked against the `enrollments: staff update` policy's USING
-- clause, so a non-staff caller — or a staff member of another academy — gets
-- no row and is answered 'not_found', with no existence oracle. Definer rights
-- would buy nothing but risk.
-- ============================================================================

alter table public.enrollments
  add column if not exists approved_at     timestamptz,
  add column if not exists access_email_at timestamptz,
  add column if not exists access_email_id text;

comment on column public.enrollments.approved_at is
  'When this enrollment was approved through the request list (public.approve_enrollment). Write-once. NULL means the row never passed through the approve gesture — it was bulk-enrolled, enrolled directly from the student page, or created before this shipped.';

comment on column public.enrollments.access_email_at is
  'When an approval claimed the right to send one "you now have access" email. Set by public.approve_enrollment in the same statement as pending -> active, and only when the student has an address. NOT a delivery receipt — see access_email_id.';

comment on column public.enrollments.access_email_id is
  'Resend message id, stamped by the send-course-access Edge Function after the provider accepted the message. access_email_at set with this NULL is the one failure state that is otherwise invisible: claimed, never confirmed sent.';

-- ----------------------------------------------------------------------------
-- Approve one enrollment request, and claim the right to email about it.
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

  -- Belt and braces, and self-documenting. Same predicate as the policy.
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

  -- 22 of 650 student records carry no address at all, and 0 are empty strings
  -- or malformed, so a null test is sufficient — no regex.
  select nullif(btrim(s.email), '')
    into v_email
    from public.students s
   where s.academy_id = v_row.academy_id
     and s.id = v_row.student_id;

  -- (3) The claim. Two guards, deliberately separate from the transition:
  --   * only FROM 'pending' — a re-activation after a drop is not the moment
  --     the student gained something they were never told about;
  --   * only once ever — access_email_at is never cleared by anything here.
  -- Kept out of the UPDATE's own predicate on purpose: an admin who reverts a
  -- row to 'pending' and re-approves must still get the status change. Folding
  -- the claim into the transition guard would silently refuse that write, which
  -- is a worse bug than a missing email.
  v_notify := v_row.status = 'pending'
          and v_email is not null
          and v_row.access_email_at is null;

  update public.enrollments e
     set status          = 'active',
         approved_at     = coalesce(e.approved_at, now()),
         access_email_at = case when v_notify then now() else e.access_email_at end
   where e.id = v_row.id;

  -- No student data crosses back to the client. If this handed the recipient to
  -- the browser and the browser handed it to the Edge Function, that function's
  -- recipient would be client input and it would be an open relay. It re-reads
  -- the address itself, under the caller's own JWT.
  return json_build_object('approved', true, 'notify', v_notify,
                           'status', 'active');
end;
$$;

comment on function public.approve_enrollment(uuid) is
  'Approve one enrollment request: locks the row, asserts it is not already active, flips it to active and claims one access email — all in one statement, so two staff approving at once produce exactly one email. Returns {approved, notify, reason?, status?} and no student data. Rejecting stays a plain UPDATE: it has no side effect to guard.';

revoke all on function public.approve_enrollment(uuid) from public, anon;
grant execute on function public.approve_enrollment(uuid) to authenticated;
