-- ============================================================================
-- Payments: a clock that reconciles bills nobody came back to.
-- ----------------------------------------------------------------------------
-- Settlement was reconciliation-driven in name only. verify-payment is the
-- authoritative reconciler, but it only ran when somebody asked it to: the payer
-- sitting on the result page (polling every 4s), or staff pressing "Check payment
-- status". toyyibpay-callback is a fast path that can miss. A payer who paid and
-- closed the tab, with a callback that did not settle, was therefore owed money
-- the ledger never learned about — and nothing would ever retry.
--
-- That happened on 8–9 Oct 2026: six bills were approved at ToyyibPay and their
-- intents sat `pending` with no payment row, found only because one payer
-- complained that her receipt was empty.
--
-- This job closes the gap. Every 15 minutes it calls verify-payment — the same
-- public, token-gated function the result page uses — once per invoice that has a
-- live intent. verify-payment re-queries ToyyibPay and settles through
-- record_gateway_payment, which is idempotent, so a bill that was never paid is a
-- no-op and a bill settled a moment ago is a `duplicate`.
--
-- Why the existing function and not a new one
--   verify-payment needs no secret (getBillTransactions is queried by bill code,
--   and settlement requires billExternalReferenceNo == intent id), so the job
--   needs no Vault entry and there is no second copy of the settle logic to keep
--   in step. The token it sends is read from the invoice at run time; it is not
--   in this file.
--
-- The window
--   Intents older than 14 days are left alone, so an abandoned bill stops costing
--   a gateway call every quarter hour. A payment against a bill older than that
--   still reconciles the first time anyone opens the invoice and presses the
--   staff button.
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'payment-intent-sweep',
  '*/15 * * * *',
  $job$
  select net.http_post(
    url := 'https://vpklztxqkvqmmzsxfqgp.supabase.co/functions/v1/verify-payment',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('pay_token', t.pay_token),
    timeout_milliseconds := 30000
  )
  from (
    select distinct i.pay_token
      from public.payment_intents pi
      join public.invoices i
        on i.academy_id = pi.academy_id and i.id = pi.invoice_id
     where pi.status in ('created', 'pending')
       and pi.bill_code is not null
       and pi.created_at > now() - interval '14 days'
       and i.pay_token is not null
       and i.status <> 'paid'
  ) t;
  $job$
);
