-- ============================================================================
-- Partial online payments
-- ----------------------------------------------------------------------------
-- The ledger has always supported part-payment: `payments` rows sum, the
-- `partially_paid` status exists, and `record_gateway_payment` recomputes
-- `invoices.amount_paid_sen` from `sum(payments where succeeded)`. What was
-- missing is the gateway — `create-bill` hard-coded `billAmount` to the whole
-- outstanding balance, so an RM2,500 invoice could only ever be paid in one go.
--
-- Two columns on `invoices` open it up, per invoice (there is deliberately no
-- academy-wide default: an academy that instalment-bills one cohort usually
-- does not want every invoice part-payable):
--
--   allow_partial_payment  the payer may choose an amount below the balance
--   min_partial_sen        the floor for that choice; NULL = ToyyibPay's own
--                          RM1.00 minimum, which `create-bill` already enforced
--
-- The ToyyibPay FPX charge is untouched: `charge_to_payor` still decides who
-- bears it, and it is a flat charge PER TRANSACTION — so three instalments cost
-- three times the charge. The pay page states the debited total each time.
--
-- Authority stays server-side. The amount a payer picks is a *request*;
-- `create-bill` reads these columns under the service role and clamps it.
-- ============================================================================

alter table public.invoices
  add column if not exists allow_partial_payment boolean not null default false,
  add column if not exists min_partial_sen integer;

-- RM1.00 is ToyyibPay's floor for an FPX bill, so a smaller minimum could only
-- ever be rejected at the gateway. Storing it as NULL means "no academy floor,
-- use theirs" and keeps "unset" with one representation.
alter table public.invoices
  drop constraint if exists invoices_min_partial_sen_check;
alter table public.invoices
  add constraint invoices_min_partial_sen_check
  check (min_partial_sen is null or min_partial_sen >= 100);

comment on column public.invoices.allow_partial_payment is
  'Payer may pay less than the outstanding balance online. Enforced in create-bill, not the client.';
comment on column public.invoices.min_partial_sen is
  'Smallest part-payment in sen. NULL = ToyyibPay''s RM1.00 floor. Clamped to the balance when the balance is smaller.';

-- ----------------------------------------------------------------------------
-- get_public_invoice: carry the terms to the login-less pay page.
--
-- Dropped and recreated rather than replaced: the RETURNS TABLE signature is
-- changing, which CREATE OR REPLACE cannot do. Grants are restated below —
-- `anon` is the whole point of this function.
--
-- `min_pay_sen` is resolved here rather than in the client so the pay page has
-- one number to validate against and cannot disagree with the Edge Function:
-- the floor never exceeds the balance, so an invoice with RM30 left is payable
-- in full even when the minimum instalment is RM50.
-- ----------------------------------------------------------------------------
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
  status invoice_status,
  gateway_enabled boolean,
  charge_to_payor boolean,
  allow_partial boolean,
  min_pay_sen integer
)
language sql
stable
security definer
set search_path to ''
as $$
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
    coalesce(i.charge_to_payor, s.toyyibpay_charge_to_payor, false),
    i.allow_partial_payment,
    least(
      greatest(i.total_sen - i.amount_paid_sen, 0),
      greatest(coalesce(i.min_partial_sen, 100), 100)
    )::integer as min_pay_sen
  from public.invoices i
  join public.academies a on a.id = i.academy_id
  left join public.academy_payment_settings s on s.academy_id = i.academy_id
  where i.pay_token = _token
    and i.status in ('issued', 'partially_paid', 'overdue');
$$;

revoke all on function public.get_public_invoice(text) from public;
grant execute on function public.get_public_invoice(text) to anon, authenticated, service_role;
