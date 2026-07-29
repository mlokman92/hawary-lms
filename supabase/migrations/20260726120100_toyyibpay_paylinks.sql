-- ============================================================================
-- 0013 · ToyyibPay payments (Phase 1) — public pay links.
--   Students have no login/portal yet, so an invoice can carry an unguessable
--   `pay_token`. The academy shares `/pay/<token>` (WhatsApp/email); anyone with
--   the link sees a minimal read-only invoice and can pay online — no auth. The
--   token is a bearer credential, so the public RPCs expose the MINIMUM needed
--   (no student PII) and refuse draft/void/cancelled invoices.
-- ============================================================================

alter table public.invoices
  add column pay_token            text unique,
  add column pay_token_created_at timestamptz;

-- ---------------------------------------------------------------------------
-- RPC: mint (or return the existing) public pay token for an invoice. Admin only.
-- ---------------------------------------------------------------------------
create or replace function public.ensure_pay_token(_invoice uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  _acad uuid;
  _tok  text;
begin
  select academy_id, pay_token into _acad, _tok
  from public.invoices where id = _invoice;
  if _acad is null then raise exception 'Invoice not found'; end if;
  if not app.is_admin(_acad) then raise exception 'Not authorized'; end if;

  if _tok is not null and _tok <> '' then
    return _tok;
  end if;
  _tok := encode(extensions.gen_random_bytes(24), 'hex');
  update public.invoices
    set pay_token = _tok, pay_token_created_at = now()
    where id = _invoice;
  return _tok;
end;
$$;
revoke execute on function public.ensure_pay_token(uuid) from public, anon;
grant  execute on function public.ensure_pay_token(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: public read of an invoice by pay token. anon-callable. Returns ONLY safe
--   display fields (no student name/email/phone, no line-item notes). Rejects
--   draft/void/cancelled — a payable invoice must be issued/partially_paid/overdue.
-- ---------------------------------------------------------------------------
create or replace function public.get_public_invoice(_token text)
returns table (
  invoice_no      text,
  academy_name    text,
  academy_logo_url text,
  currency        text,
  total_sen       integer,
  amount_paid_sen integer,
  due_sen         integer,
  status          public.invoice_status,
  gateway_enabled boolean
)
language sql
security definer
set search_path = ''
stable
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
    coalesce(s.toyyibpay_enabled, false)
  from public.invoices i
  join public.academies a on a.id = i.academy_id
  left join public.academy_payment_settings s on s.academy_id = i.academy_id
  where i.pay_token = _token
    and i.status in ('issued', 'partially_paid', 'overdue');
$$;
revoke execute on function public.get_public_invoice(text) from public;
grant  execute on function public.get_public_invoice(text) to anon, authenticated;

-- get_pay_status lives in the next migration (0014) — it reads payment_intents,
-- which is created there.
