-- ============================================================================
-- An academy-wide default for part payment
-- ----------------------------------------------------------------------------
-- Part payment shipped deliberately WITHOUT an academy default: an academy that
-- instalment-bills one cohort usually does not want every invoice part-payable,
-- so the terms lived on the invoice alone. That reasoning holds for an academy
-- that instalment-bills *some* students — it does not hold for one that bills
-- every student in instalments, where the per-invoice switch means setting the
-- same two fields 726 times and the one invoice somebody forgets is a phone
-- call.
--
-- So the terms gain the same two-level shape `charge_to_payor` already has:
--
--   academy_payment_settings.allow_partial_payment / min_partial_sen  the default
--   invoices.allow_partial_payment / min_partial_sen                  the override
--
-- `invoices.allow_partial_payment` therefore has to become **nullable**, because
-- `not null default false` cannot express "follow the default" — false and
-- unset were the same value, and a default that only applies to rows nobody has
-- an opinion about needs them to be different. NULL is that third state, read
-- exactly as `charge_to_payor` is read: `coalesce(invoice, academy, false)`.
--
-- Existing rows keep whatever they say. Dropping NOT NULL widens the domain, so
-- no row changes meaning and no backfill is implied by this migration — an
-- academy that wants its history moved onto the default does that as data.
--
-- Authority is unchanged. `create-bill` re-reads both levels under the service
-- role before it bills anything, so the resolved terms are never the client's
-- word; `academy_payment_settings` writes are already admin-only.
-- ============================================================================

alter table public.academy_payment_settings
  add column if not exists allow_partial_payment boolean not null default false,
  add column if not exists min_partial_sen integer;

-- RM1.00 is ToyyibPay's floor for an FPX bill, so a smaller minimum could only
-- ever be rejected at the gateway. Same constraint the invoice column carries,
-- for the same reason, and NULL keeps "unset" with one representation.
alter table public.academy_payment_settings
  drop constraint if exists academy_payment_settings_min_partial_sen_check;
alter table public.academy_payment_settings
  add constraint academy_payment_settings_min_partial_sen_check
  check (min_partial_sen is null or min_partial_sen >= 100);

comment on column public.academy_payment_settings.allow_partial_payment is
  'Academy default for online part payment. An invoice with NULL allow_partial_payment follows this.';
comment on column public.academy_payment_settings.min_partial_sen is
  'Academy default floor for one instalment, in sen. NULL = ToyyibPay''s RM1.00 floor.';

-- The third state. A row that already says true or false keeps saying it.
alter table public.invoices
  alter column allow_partial_payment drop default,
  alter column allow_partial_payment drop not null;

comment on column public.invoices.allow_partial_payment is
  'Payer may pay less than the balance. NULL = follow academy_payment_settings. Enforced in create-bill, not the client.';
comment on column public.invoices.min_partial_sen is
  'Smallest part-payment in sen. NULL = follow the academy default, then ToyyibPay''s RM1.00 floor. Clamped to the balance when the balance is smaller.';

-- ----------------------------------------------------------------------------
-- get_public_invoice: resolve both levels for the login-less pay page.
--
-- Replaced rather than dropped — the RETURNS TABLE signature is unchanged, only
-- the two expressions are. `min_pay_sen` keeps its existing job of never
-- exceeding the balance, so the last instalment is always payable in full; the
-- only change is that the floor may now come from the academy.
-- ----------------------------------------------------------------------------
create or replace function public.get_public_invoice(_token text)
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
    coalesce(i.charge_to_payor, s.toyyibpay_charge_to_payor, false),
    coalesce(i.allow_partial_payment, s.allow_partial_payment, false),
    least(
      greatest(i.total_sen - i.amount_paid_sen, 0),
      greatest(coalesce(i.min_partial_sen, s.min_partial_sen, 100), 100)
    )::integer as min_pay_sen
  from public.invoices i
  join public.academies a on a.id = i.academy_id
  left join public.academy_payment_settings s on s.academy_id = i.academy_id
  where i.pay_token = _token
    and i.status in ('issued', 'partially_paid', 'overdue');
$function$;

revoke execute on function public.get_public_invoice(text) from public;
grant execute on function public.get_public_invoice(text) to anon, authenticated;
