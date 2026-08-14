-- Three defects found reviewing the incentives feature, all of the same family:
-- a state the code can reach and then has no route out of.
--
-- 1. A claimed payout whose invocation died mid-chunk sat in 'sending' with no
--    order id forever. Nothing reclaimed it (the claim took 'pending' only),
--    nothing reconciled it (billplz-payout-status skips rows with no order id),
--    and `remaining` counted only 'pending' — so the batch flipped to 'sent'
--    and the Resume button disappeared while those students went unpaid. The
--    claim now takes a LEASE: a 'sending' row with no order id and no progress
--    for 15 minutes is fair game again. 15 minutes is far beyond any edge
--    function's wall clock, so a live invocation can never have its rows taken.
--
-- 2. A student could read their own payout but not the batch it belonged to
--    (incentive_batches was admin-only), so the batch title on /learn/billing
--    was a join that could never return a row. The grant's name is the one
--    thing that says what the money was for.
--
-- 3. The batch page listed payouts with `select *`, shipping every recipient's
--    full account number to the browser to render four masked digits. The
--    number is needed to SEND, never to DISPLAY, so the last four are now a
--    generated column and the cleartext stays server-side — the same rule
--    incentive_candidates was written as an RPC to enforce.

-- ---------------------------------------------------------------------------
-- 1. Reclaim a stalled claim.
-- ---------------------------------------------------------------------------
create or replace function app.claim_incentive_payouts(_batch uuid, _limit int)
returns setof public.incentive_payouts
language sql
volatile
security definer
set search_path = ''
as $$
  update public.incentive_payouts p
  set status = 'sending'
  -- Never re-post a row that already reached Billplz, whatever its status.
  where p.billplz_payment_order_id is null
    and p.id in (
      select c.id
      from public.incentive_payouts c
      where c.batch_id = _batch
        and c.billplz_payment_order_id is null
        and (
          c.status = 'pending'
          -- The lease. `updated_at` is bumped by set_updated_at on the claim
          -- itself, so this is time since the row was last worked on.
          or (c.status = 'sending' and c.updated_at < now() - interval '15 minutes')
        )
      order by c.created_at
      limit greatest(1, least(coalesce(_limit, 25), 50))
      for update skip locked
    )
  returning p.*;
$$;
revoke all on function app.claim_incentive_payouts(uuid, int) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. A student may read a batch they were actually paid from — title only in
--    practice, since that is all the learner query selects. The EXISTS resolves
--    through incentive_payouts, whose own policy already narrows a student to
--    their own rows, so this grants nothing wider than "batches I am in".
-- ---------------------------------------------------------------------------
create policy "incentive batches: student read own"
  on public.incentive_batches for select to authenticated
  using (
    exists (
      select 1
      from public.incentive_payouts p
      where p.batch_id = incentive_batches.id
        and app.owns_student(p.student_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 3. The last four digits, so the browser never receives the rest.
-- ---------------------------------------------------------------------------
alter table public.incentive_payouts
  add column if not exists bank_account_last4 text
  generated always as (right(bank_account_number, 4)) stored;

comment on column public.incentive_payouts.bank_account_last4 is
  'What the UI displays. bank_account_number is for sending and must not be selected by a client.';
