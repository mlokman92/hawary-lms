-- ============================================================================
-- 0015 · ToyyibPay — remove an academy's stored key. Deletes the Vault secret
--   and clears the (non-secret) metadata so online payments turn off. Admin only.
-- ============================================================================
create or replace function public.remove_toyyibpay_credentials(_academy uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.is_admin(_academy) then
    raise exception 'Not authorized';
  end if;

  delete from vault.secrets where name = 'toyyibpay_secret:' || _academy::text;

  update public.academy_payment_settings set
    toyyibpay_has_secret    = false,
    toyyibpay_secret_last4  = null,
    toyyibpay_secret_set_at = null,
    toyyibpay_secret_set_by = null,
    toyyibpay_category_code = null,
    toyyibpay_enabled       = false
  where academy_id = _academy;
end;
$$;
revoke execute on function public.remove_toyyibpay_credentials(uuid) from public, anon;
grant  execute on function public.remove_toyyibpay_credentials(uuid) to authenticated;
