-- ============================================================================
-- invoices.amount_paid_sen is derived from the ledger, not from the client
-- ----------------------------------------------------------------------------
-- `useRecordPayment` inserted the `payments` row and then wrote the invoice
-- itself, as `currentPaidSen + amountSen` — a read-modify-write whose read came
-- from whatever the page had rendered. Two payments recorded from the same
-- screen therefore both added to the *same* stale figure and the second one's
-- money vanished from the invoice while staying in the ledger. INV-YKP2CP had
-- five RM500 payments and read RM2,000; INV-P7C9EZ had a duplicated RM1,500 row
-- that the same staleness happened to hide.
--
-- `record_gateway_payment` never had the bug: it recomputes from
-- `sum(payments where succeeded)` because a gateway callback has no page state
-- to read. That is the correct rule for both doors, so it moves onto the
-- column, where every writer gets it — the same argument as
-- `app.fill_record_identity`: `payments` is a plain RLS table, so an admin can
-- also insert a row straight through PostgREST without passing any RPC.
--
-- The invoice row is locked before the sum is taken. Two admins recording a
-- payment at once is the ordinary case, and under READ COMMITTED the second
-- transaction's sum must be a statement that runs *after* the first commits or
-- it recomputes from a snapshot that never saw the other payment — which is the
-- very failure being fixed, one layer down.
-- ============================================================================

create or replace function app.sync_invoice_paid()
returns trigger
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  _ids uuid[];
  _id uuid;
  _paid integer;
begin
  -- An UPDATE that moves a payment between invoices has to settle both.
  if tg_op = 'INSERT' then
    _ids := array[new.invoice_id];
  elsif tg_op = 'DELETE' then
    _ids := array[old.invoice_id];
  elsif new.invoice_id = old.invoice_id then
    _ids := array[new.invoice_id];
  else
    _ids := array[new.invoice_id, old.invoice_id];
  end if;

  foreach _id in array _ids
  loop
    perform 1 from public.invoices where id = _id for update;

    select coalesce(sum(amount_sen), 0) into _paid
      from public.payments
      where invoice_id = _id and status = 'succeeded';

    update public.invoices i
      set amount_paid_sen = _paid,
          status = case
                     -- A settled-up bill that was voided stays voided; money
                     -- against it is a reconciliation job, not a status change.
                     when i.status in ('void', 'cancelled') then i.status
                     when _paid >= i.total_sen               then 'paid'
                     when _paid > 0                          then 'partially_paid'
                     -- Refunded or deleted back to nothing: an invoice still
                     -- reading 'paid' with no payment under it is the same lie
                     -- in the other direction.
                     when i.status in ('paid', 'partially_paid') then 'issued'
                     else i.status
                   end,
          updated_at = now()
      where i.id = _id
        and (i.amount_paid_sen is distinct from _paid
             or i.status in ('paid', 'partially_paid'));
  end loop;

  return null;
end;
$$;

comment on function app.sync_invoice_paid() is
  'Recomputes invoices.amount_paid_sen and status from sum(payments where succeeded). Clients must not write amount_paid_sen.';

drop trigger if exists payments_sync_invoice_paid on public.payments;
create trigger payments_sync_invoice_paid
  after insert or update or delete on public.payments
  for each row execute function app.sync_invoice_paid();

-- ----------------------------------------------------------------------------
-- Backfill: every invoice the client arithmetic left behind.
-- ----------------------------------------------------------------------------
with ledger as (
  select i.id,
         coalesce(sum(p.amount_sen) filter (where p.status = 'succeeded'), 0) as paid
    from public.invoices i
    left join public.payments p on p.invoice_id = i.id
   group by i.id
)
update public.invoices i
   set amount_paid_sen = l.paid,
       status = case
                  when i.status in ('void', 'cancelled') then i.status
                  when l.paid >= i.total_sen             then 'paid'
                  when l.paid > 0                        then 'partially_paid'
                  when i.status in ('paid', 'partially_paid') then 'issued'
                  else i.status
                end,
       updated_at = now()
  from ledger l
 where l.id = i.id
   and i.amount_paid_sen is distinct from l.paid;
