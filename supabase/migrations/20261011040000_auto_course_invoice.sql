-- Approving a student raises their course invoice.
--
-- Until now accepting a student and billing them were two jobs on two screens,
-- and the second was sometimes not done: students sat enrolled and uninvoiced
-- until somebody noticed them on /courses/:id/billing. With one student in one
-- course there is exactly one invoice to raise, for exactly one amount — the
-- course's own `price_sen` — so the approval can raise it.

-- ---------------------------------------------------------------------------
-- 1. The one place a course invoice is made automatically.
--
--    Idempotent, and deliberately timid. It does nothing when:
--      * the student has no enrolment that is not cancelled;
--      * the course has no price — a free course is not billed RM0.00;
--      * the student already has a live invoice. One student, one course, one
--        course invoice: a second would be a double charge, and an admin who
--        already raised one by hand (with a discount, say) must not have it
--        duplicated by an approval.
--
--    The invoice is the same shape staff have been making by hand: one line,
--    "Yuran <course>", the course price, no tax, no due date. The instalment
--    terms are left NULL, which is how an invoice says "follow the academy's
--    setting at pay time". Its course is not set here — `set_invoice_course`
--    owns that column.
--
--    SECURITY DEFINER because money is admin-only by RLS and the caller may be
--    a trainer approving a request: accepting the student is theirs to do, and
--    the invoice is a consequence of it rather than something they wrote.
--
--    It lives in `app`, which PostgREST does not serve, so no client can call
--    it; `approve_enrollment` below does, as the caller, which is why it keeps
--    the default EXECUTE like every other `app` helper. Even called freely it
--    could only ever bill a student once, the price of the course they are
--    already in.
--
--    Inserting an issued invoice fires `notify_invoice_issued`, so a student
--    with an account is told — which is right; they have just been accepted.
-- ---------------------------------------------------------------------------
create or replace function app.ensure_course_invoice(_student uuid, _created_by uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_academy uuid;
  v_title   text;
  v_price   int;
  v_invoice uuid;
begin
  select e.academy_id, c.title, c.price_sen
    into v_academy, v_title, v_price
    from public.enrollments e
    join public.courses c on c.id = e.course_id
   where e.student_id = _student
     and e.status <> 'cancelled';

  if not found or coalesce(v_price, 0) <= 0 then
    return null;
  end if;

  if exists (
    select 1 from public.invoices i
     where i.student_id = _student
       and i.status not in ('void', 'cancelled', 'draft')
  ) then
    return null;
  end if;

  insert into public.invoices (
    academy_id, student_id, invoice_no, status,
    subtotal_sen, tax_sen, total_sen, issued_at, created_by
  ) values (
    v_academy, _student, '', 'issued',
    v_price, 0, v_price, now(),
    -- Only if the approver has a profile row; the FK is to profiles.
    (select p.id from public.profiles p where p.id = _created_by)
  )
  returning id into v_invoice;

  insert into public.invoice_items (
    academy_id, invoice_id, description, quantity, unit_price_sen, amount_sen
  ) values (
    v_academy, v_invoice, 'Yuran ' || v_title, 1, v_price, v_price
  );

  return v_invoice;
end;
$function$;

comment on function app.ensure_course_invoice(uuid, uuid)
  is 'Raise the student''s course invoice at the course price if they are enrolled and have no live invoice. Returns the new invoice id, or NULL when there was nothing to do.';

-- ---------------------------------------------------------------------------
-- 2. `approve_enrollment` calls it.
--
--    Only on the transition out of `pending` — the same condition that claims
--    the acceptance email — so the loser of a double-click raises nothing, and
--    re-approving an already-active row cannot bill again. The function is as
--    it was apart from that call and `invoice_id` in what it returns.
-- ---------------------------------------------------------------------------
create or replace function public.approve_enrollment(_enrollment_id uuid)
returns json
language plpgsql
set search_path = ''
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
