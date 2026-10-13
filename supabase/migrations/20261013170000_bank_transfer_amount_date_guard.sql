-- Correcting a bank transfer's amount and date.
--
-- A bank transfer is typed in from a receipt, and the two things typed are the
-- two a Director flags as wrong: the amount and the date. Until now nothing in
-- the app could correct either. An admin now can, from the payment's panel —
-- a plain update, since `payments: admin update` already admits them and
-- `app.sync_invoice_paid` re-files the invoice from the new figure.
--
-- What the policy cannot say is *which* payments and *until when*, so a trigger
-- does:
--
--   * **Bank transfers only.** Cash is counted on the spot, FPX is the
--     gateway's own figure and KWSP is the withdrawal's — none of them is a
--     number read off a slip.
--   * **Not once it is checked.** A check is a Director saying the amount and
--     date match the receipt; changing either afterwards would leave the check
--     standing over figures nobody checked. Replacing the receipt clears the
--     check, and is the way back in.
--
-- It binds signed-in callers. The owner in SQL and the gateway's callback
-- carry no user and are left alone.

create or replace function app.guard_payment_amount_date()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  _checked timestamptz;
begin
  if new.amount_sen is not distinct from old.amount_sen
     and new.paid_at is not distinct from old.paid_at then
    return new;
  end if;

  if (select auth.uid()) is null then
    return new;
  end if;

  if old.method <> 'bank_transfer' or new.method <> 'bank_transfer' then
    raise exception 'Only a bank transfer''s amount and date can be changed';
  end if;

  -- Locked, so a Director pressing "Mark as checked" at the same moment either
  -- lands first and is seen here, or waits for this write.
  select r.confirmed_at into _checked
    from public.payment_receipts r
   where r.payment_id = old.id
     for share;

  if _checked is not null then
    raise exception 'This bank transfer has been checked and can no longer be changed';
  end if;

  return new;
end;
$$;

create trigger payments_guard_amount_date
  before update of amount_sen, paid_at on public.payments
  for each row execute function app.guard_payment_amount_date();
