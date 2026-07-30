-- Pass the ToyyibPay transaction charge to the payer.
--
-- ToyyibPay's createBill takes `billChargeToCustomer`:
--   (blank) charge both FPX and card to the bill owner   <- what we sent until now
--   0       charge FPX to the customer, card to the owner
--   1       charge card to the customer, FPX to the owner
--   2       charge both to the customer
-- We only ever open the FPX channel (`billPaymentChannel = '0'`), so "0" is the
-- exact setting and "2" would be indistinguishable in practice.
--
-- Two levels, because academies differ per invoice (a fee course may absorb the
-- charge, a one-off deposit may not):
--   * academy_payment_settings.toyyibpay_charge_to_payor — the default
--   * invoices.charge_to_payor — per-invoice, NULL meaning "follow the default"
-- NULL rather than a NOT NULL default so the ~7 invoices that already exist, and
-- any created outside the form, track the academy setting instead of being
-- frozen to `false` by the backfill.

alter table public.academy_payment_settings
  add column if not exists toyyibpay_charge_to_payor boolean not null default false;

comment on column public.academy_payment_settings.toyyibpay_charge_to_payor is
  'Default for new invoices: add the ToyyibPay FPX charge to what the payer pays.';

alter table public.invoices
  add column if not exists charge_to_payor boolean;

comment on column public.invoices.charge_to_payor is
  'Per-invoice override for the ToyyibPay charge. NULL = follow academy_payment_settings.';

-- What we actually told ToyyibPay for THIS bill, plus the surcharge we expect it
-- to add. Recorded at bill time so settlement is judged against the terms the
-- payer was shown, not against a setting an admin may have flipped since.
alter table public.payment_intents
  add column if not exists charge_to_payor boolean not null default false,
  add column if not exists fee_sen integer not null default 0;

comment on column public.payment_intents.fee_sen is
  'Surcharge ToyyibPay adds on top of amount_sen when charge_to_payor is set (0 otherwise).';

-- ---------------------------------------------------------------------------
-- Settlement has to tolerate the surcharge.
--
-- The old check was `_amount_sen <> _intent.amount_sen -> amount_mismatch`, and
-- a mismatch does NOT record the payment. With the charge passed on, ToyyibPay
-- may report the amount the payer was debited (amount + fee) rather than the
-- bill amount — their API reference does not say which — and that would have
-- left a genuinely paid invoice sitting unpaid.
--
-- So: accept anything from the bill amount up to bill amount + fee_sen, and
-- always credit the invoice `_intent.amount_sen`. The surcharge is ToyyibPay's
-- revenue, never the academy's, so it must not land in `payments`. When
-- fee_sen = 0 the band collapses to equality and behaviour is unchanged.
--
-- Underpayment and any overpayment beyond the surcharge still mismatch, so the
-- control that stops a short payment from settling an invoice is intact.
-- ---------------------------------------------------------------------------
create or replace function public.record_gateway_payment(
  _intent_id uuid,
  _amount_sen integer,
  _provider_ref text,
  _paid_at timestamp with time zone
)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  _intent   public.payment_intents;
  _inv      public.invoices;
  _new_paid integer;
  _inserted boolean := false;
  _fee      integer;
begin
  select * into _intent from public.payment_intents where id = _intent_id for update;
  if not found then return 'unknown'; end if;

  select * into _inv from public.invoices
    where academy_id = _intent.academy_id and id = _intent.invoice_id
    for update;
  if not found then return 'unknown'; end if;

  _fee := greatest(coalesce(_intent.fee_sen, 0), 0);

  if _amount_sen is null
     or _amount_sen < _intent.amount_sen
     or _amount_sen > _intent.amount_sen + _fee then
    update public.payment_intents
      set status = 'succeeded', provider_ref = _provider_ref,
          needs_reconciliation = true, updated_at = now()
      where id = _intent_id;
    return 'amount_mismatch';
  end if;

  -- Credit the bill amount, never the surcharge.
  insert into public.payments (
    academy_id, invoice_id, student_id, amount_sen, currency,
    method, provider, provider_ref, status, paid_at
  )
  values (
    _intent.academy_id, _intent.invoice_id, _inv.student_id,
    _intent.amount_sen, _inv.currency,
    'fpx', 'toyyibpay', _provider_ref, 'succeeded', coalesce(_paid_at, now())
  )
  on conflict (academy_id, provider, provider_ref) where provider_ref is not null
    do nothing;
  _inserted := found;

  if _inv.status in ('void', 'cancelled') then
    update public.payment_intents
      set status = 'succeeded', provider_ref = _provider_ref,
          needs_reconciliation = true, updated_at = now()
      where id = _intent_id;
    return 'reconcile_void';
  end if;

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
$function$;

revoke execute on function public.record_gateway_payment(uuid, integer, text, timestamptz)
  from anon, authenticated;
grant execute on function public.record_gateway_payment(uuid, integer, text, timestamptz)
  to service_role;

-- ---------------------------------------------------------------------------
-- The payer must be told before they click. Return type changes, so the
-- function has to be dropped rather than replaced; grants are restated below.
-- ---------------------------------------------------------------------------
drop function if exists public.get_public_invoice(text);

create function public.get_public_invoice(_token text)
returns table (
  invoice_no text,
  academy_name text,
  academy_logo_url text,
  currency text,
  total_sen integer,
  amount_paid_sen integer,
  due_sen integer,
  status public.invoice_status,
  gateway_enabled boolean,
  charge_to_payor boolean
)
language sql
stable
security definer
set search_path to ''
as $function$
  select
    i.invoice_no,
    a.name,
    a.logo_url,
    i.currency,
    i.total_sen,
    i.amount_paid_sen,
    greatest(i.total_sen - i.amount_paid_sen, 0) as due_sen,
    i.status,
    coalesce(s.toyyibpay_enabled, false),
    coalesce(i.charge_to_payor, s.toyyibpay_charge_to_payor, false)
  from public.invoices i
  join public.academies a on a.id = i.academy_id
  left join public.academy_payment_settings s on s.academy_id = i.academy_id
  where i.pay_token = _token
    and i.status in ('issued', 'partially_paid', 'overdue');
$function$;

grant execute on function public.get_public_invoice(text) to anon, authenticated, service_role;
