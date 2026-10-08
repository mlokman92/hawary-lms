-- ============================================================================
-- payment_intents: the live-intent guard is per (invoice, amount), not per
-- invoice.
--   Part payment made create-bill's reuse amount-scoped — a payer who opens an
--   RM1,000 bill and then chooses RM500 gets a second intent, and the first is
--   deliberately left live so verify-payment can still reconcile it. The unique
--   index was never widened to match, so that second insert failed with
--   "duplicate key value violates unique constraint payment_intents_live_uidx"
--   and the payer was locked to the first amount they ever picked.
--   Keyed on amount as well, it still does its original job: two concurrent
--   create-bill calls for the same amount cannot mint two bills.
-- ============================================================================

drop index public.payment_intents_live_uidx;
create unique index payment_intents_live_uidx
  on public.payment_intents (invoice_id, amount_sen)
  where status in ('created', 'pending');
