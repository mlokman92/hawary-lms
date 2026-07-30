-- Mint the public pay token when an invoice is created.
--
-- Until now the token was minted on demand by `ensure_pay_token`, which an
-- admin triggered from the "Create pay link" button on the invoice page. That
-- left every freshly created invoice without a shareable link — including the
-- student's own /learn/billing view, which can only *show* a link (the RPC is
-- admin-only and would raise "Not authorized" for a learner).
--
-- Minting in a BEFORE INSERT trigger covers every creation path (single, bulk,
-- future server-side ones) instead of one call site, so the link exists by the
-- time the invoice is first read.
--
-- The token is not a capability leak on its own: `get_public_invoice` only
-- resolves a token whose invoice is issued/partially_paid/overdue, and returns
-- no PII beyond the academy name and the amount. `ensure_pay_token` stays —
-- it is still the (idempotent) path for legacy rows and stays admin-only.

create or replace function app.set_invoice_pay_token()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if new.pay_token is null or new.pay_token = '' then
    new.pay_token := encode(extensions.gen_random_bytes(24), 'hex');
    new.pay_token_created_at := now();
  end if;
  return new;
end;
$$;

comment on function app.set_invoice_pay_token() is
  'BEFORE INSERT on invoices: mints the public pay token so every invoice ships with a pay link.';

drop trigger if exists set_invoice_pay_token on public.invoices;
create trigger set_invoice_pay_token
  before insert on public.invoices
  for each row execute function app.set_invoice_pay_token();

-- Backfill: existing invoices created before the trigger have no link.
update public.invoices
   set pay_token = encode(extensions.gen_random_bytes(24), 'hex'),
       pay_token_created_at = coalesce(pay_token_created_at, now())
 where pay_token is null or pay_token = '';
