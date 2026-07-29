-- ============================================================================
-- 0014 · ToyyibPay payments (Phase 2/3) — payment intents + settlement.
--   `payment_intents` bridges a ToyyibPay bill to an invoice (create-bill writes
--   one; the callback looks it up by order_id == intent.id). `payments` stays the
--   settled-money ledger. Settlement is service-role only, idempotent on the
--   ToyyibPay transaction id, and never trusts the unsigned callback.
-- ============================================================================

create table public.payment_intents (
  id           uuid primary key default gen_random_uuid(),  -- == billExternalReferenceNo / callback order_id
  academy_id   uuid not null references public.academies(id) on delete cascade,
  invoice_id   uuid not null,
  provider     public.payment_provider not null default 'toyyibpay',
  bill_code    text unique,                                  -- ToyyibPay BillCode
  host         text not null,                                -- pinned base host (prod vs dev) — L4
  amount_sen   integer not null check (amount_sen > 0),      -- outstanding at bill creation
  status       text not null default 'created'
               check (status in ('created', 'pending', 'succeeded', 'failed', 'expired')),
  provider_ref text,                                         -- ToyyibPay txn no (billpaymentInvoiceNo)
  nonce        text,                                         -- callback URL nonce (H2 hardening)
  needs_reconciliation boolean not null default false,       -- H4 / H3 mismatch flag
  expires_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  foreign key (academy_id, invoice_id)
    references public.invoices (academy_id, id) on delete cascade
);
create index payment_intents_academy_invoice_idx on public.payment_intents (academy_id, invoice_id);
-- Atomic reuse guard (M4): at most one live (created/pending) intent per invoice,
-- so concurrent create-bill calls can't mint two bills.
create unique index payment_intents_live_uidx
  on public.payment_intents (invoice_id) where status in ('created', 'pending');
create trigger set_updated_at before update on public.payment_intents
  for each row execute function app.set_updated_at();

alter table public.payment_intents enable row level security;
-- Staff may read their academy's intents (for support / attempt history). All
-- WRITES are service-role only (edge functions bypass RLS) — no write policy.
create policy "payment_intents: staff read" on public.payment_intents
  for select to authenticated using (app.is_staff(academy_id));

-- ---------------------------------------------------------------------------
-- RPC: record a confirmed gateway payment. SERVICE-ROLE ONLY. Called by the
--   toyyibpay-callback edge fn AFTER it has re-verified the payment against
--   ToyyibPay with the academy's own secret. Idempotent, tenant-locked.
--
--   _amount_sen is the amount the edge fn confirmed from getBillTransactions,
--   already normalized to sen. Because the bill is fixed-price, it MUST equal
--   the intent amount; a mismatch means a unit/parse bug or tampering, so we
--   refuse to credit and flag for manual reconciliation (H3).
-- ---------------------------------------------------------------------------
create or replace function public.record_gateway_payment(
  _intent_id   uuid,
  _amount_sen  integer,
  _provider_ref text,
  _paid_at     timestamptz
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  _intent   public.payment_intents;
  _inv      public.invoices;
  _new_paid integer;
  _inserted boolean := false;
begin
  select * into _intent from public.payment_intents where id = _intent_id for update;
  if not found then return 'unknown'; end if;

  -- Lock the invoice so concurrent/replayed callbacks serialize (idempotency).
  select * into _inv from public.invoices
    where academy_id = _intent.academy_id and id = _intent.invoice_id
    for update;
  if not found then return 'unknown'; end if;

  -- H3: fixed-price bill — the paid amount must match the intent exactly.
  -- A mismatch is never expected; flag it, never silently credit.
  if _amount_sen is null or _amount_sen <> _intent.amount_sen then
    update public.payment_intents
      set status = 'succeeded', provider_ref = _provider_ref,
          needs_reconciliation = true, updated_at = now()
      where id = _intent_id;
    return 'amount_mismatch';
  end if;

  -- Idempotent insert keyed on the ToyyibPay transaction id (M1). A replayed or
  -- duplicate callback conflicts on (academy_id, provider, provider_ref) and is
  -- a no-op.
  insert into public.payments (
    academy_id, invoice_id, student_id, amount_sen, currency,
    method, provider, provider_ref, status, paid_at
  )
  values (
    _intent.academy_id, _intent.invoice_id, _inv.student_id, _amount_sen, _inv.currency,
    'fpx', 'toyyibpay', _provider_ref, 'succeeded', coalesce(_paid_at, now())
  )
  on conflict (academy_id, provider, provider_ref) where provider_ref is not null
    do nothing;
  _inserted := found;

  -- H4: money against a voided/cancelled invoice is real, so keep the payment
  -- row for audit/refund — but do NOT resurrect the invoice. Flag it instead.
  if _inv.status in ('void', 'cancelled') then
    update public.payment_intents
      set status = 'succeeded', provider_ref = _provider_ref,
          needs_reconciliation = true, updated_at = now()
      where id = _intent_id;
    return 'reconcile_void';
  end if;

  -- Recompute the paid total from the ledger (never increment) so duplicates and
  -- mixed manual+online payments converge. M2: an overpayment leaves
  -- amount_paid_sen > total_sen (surfaced as a negative balance) and caps at 'paid'.
  select coalesce(sum(amount_sen), 0) into _new_paid
    from public.payments
    where academy_id = _intent.academy_id
      and invoice_id = _intent.invoice_id
      and status = 'succeeded';

  update public.invoices
    set amount_paid_sen = _new_paid,
        status = case
                   when _new_paid >= total_sen then 'paid'
                   when _new_paid > 0          then 'partially_paid'
                   else status
                 end
    where academy_id = _intent.academy_id and id = _intent.invoice_id;

  update public.payment_intents
    set status = 'succeeded', provider_ref = _provider_ref,
        needs_reconciliation = false, updated_at = now()
    where id = _intent_id;

  return case when _inserted then 'recorded' else 'duplicate' end;
end;
$$;
revoke execute on function public.record_gateway_payment(uuid, integer, text, timestamptz) from public, anon, authenticated;
grant  execute on function public.record_gateway_payment(uuid, integer, text, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- RPC: public payment status by token (result page polls this). anon-callable.
--   DB is the source of truth — never the gateway's browser return params.
-- ---------------------------------------------------------------------------
create or replace function public.get_pay_status(_token text)
returns table (invoice_status text, intent_status text)
language sql
security definer
set search_path = ''
stable
as $$
  select
    i.status::text,
    (select pi.status
     from public.payment_intents pi
     where pi.invoice_id = i.id
     order by pi.created_at desc
     limit 1)
  from public.invoices i
  where i.pay_token = _token;
$$;
revoke execute on function public.get_pay_status(text) from public;
grant  execute on function public.get_pay_status(text) to anon, authenticated;
