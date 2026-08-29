-- Financial data is an ADMIN fact, not a staff fact.
--
-- A trainer is staff so they can teach: build a course, mark work, take a
-- session. None of that needs to know what a student was charged. Until now
-- every money table's SELECT policy was keyed on `app.is_staff`, so a trainer
-- read every invoice, every line item, every payment and every gateway intent
-- in their academy -- and not only in the UI: their own JWT plus the
-- publishable key was enough to pull the whole ledger straight from PostgREST.
-- Hiding the cards would have changed nothing.
--
-- The WRITE side was already right (`invoices: admin insert` and friends are
-- all `app.is_admin`), which is what makes this a read-side migration only.
--
-- `app.is_staff` itself is NOT narrowed: 56 live policies depend on it, and
-- most of them are the teaching grants a trainer must keep. The change is per
-- table, per policy.
--
-- Policies are renamed rather than ALTERed. A policy still called
-- "staff view all" that admits only admins is a trap for the next reader.
--
-- Every `app.owns_student` arm is preserved verbatim: it is what keeps
-- /learn/billing and the learner's own invoice + receipt PDFs working, and it
-- is the one thing a too-aggressive version of this migration would break.

drop policy if exists "invoices: staff view all, student view own" on public.invoices;
create policy "invoices: admin view all, student view own" on public.invoices
  for select to authenticated
  using (app.is_admin(academy_id) or app.owns_student(student_id));

drop policy if exists "invoice_items: staff all, student own-invoice" on public.invoice_items;
create policy "invoice_items: admin all, student own-invoice" on public.invoice_items
  for select to authenticated
  using (
    app.is_admin(academy_id)
    or exists (
      select 1 from public.invoices i
      where i.id = invoice_items.invoice_id and app.owns_student(i.student_id)
    )
  );

drop policy if exists "payments: staff view all, student view own" on public.payments;
create policy "payments: admin view all, student view own" on public.payments
  for select to authenticated
  using (app.is_admin(academy_id) or app.owns_student(student_id));

-- No student arm: an intent is the gateway's working state, not a document
-- addressed to anybody. The learner reads its outcome through the invoice.
drop policy if exists "payment_intents: staff read" on public.payment_intents;
create policy "payment_intents: admin read" on public.payment_intents
  for select to authenticated
  using (app.is_admin(academy_id));

-- This one MUST be drop-then-create inside the same migration: the table's
-- other three policies are per-command (INSERT/UPDATE/DELETE), so a bare drop
-- would leave no SELECT policy at all and blind the admins who own /settings.
drop policy if exists "payment_settings: staff read" on public.academy_payment_settings;
create policy "payment_settings: admin read" on public.academy_payment_settings
  for select to authenticated
  using (app.is_admin(academy_id));
