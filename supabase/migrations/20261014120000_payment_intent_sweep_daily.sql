-- ============================================================================
-- Payments: a daily pass over the bills the quarter-hour sweep leaves alone.
-- ----------------------------------------------------------------------------
-- payment-intent-sweep (20261012140000) only looks at intents created in the
-- last 14 days. But an intent's age is not the age of the payer's attempt:
-- create-bill hands a live intent back unchanged whenever the payer reopens the
-- pay link at the same amount, so a bill minted weeks ago can be paid today.
--
-- That happened on INV-D3X2PP: an RM2,500 bill minted 16 Sep 2026 was paid on
-- 8 Oct, the callback did not settle it, and the sweep — added four days later —
-- skipped it as too old. The invoice sat unpaid until the payer sent the bank's
-- confirmation SMS.
--
-- Once a day, the same call for every live intent older than the window. The
-- quarter-hour sweep keeps its window, so an abandoned bill costs one gateway
-- call a day rather than ninety-six.
-- ============================================================================

select cron.schedule(
  'payment-intent-sweep-daily',
  '30 19 * * *',  -- 03:30 Malaysia time
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
       and pi.created_at <= now() - interval '14 days'
       and i.pay_token is not null
       and i.status <> 'paid'
  ) t;
  $job$
);
