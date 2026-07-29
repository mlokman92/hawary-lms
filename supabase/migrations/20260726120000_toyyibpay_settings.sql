-- ============================================================================
-- 0012 · ToyyibPay payments (Phase 0) — per-academy gateway credentials.
--   Each academy stores its OWN ToyyibPay userSecretKey so its students pay
--   directly into that academy's ToyyibPay account. The secret is highly
--   sensitive and must NEVER reach a client, so it lives in Supabase Vault
--   (encrypted; root key outside the DB) — not in a public column. This table
--   holds only non-secret metadata (category code, sandbox/enabled flags, and a
--   masked last-4 so admins can see a key is set without reading it back).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Settings table (metadata only; the secret is in vault.secrets)
-- ---------------------------------------------------------------------------
create table public.academy_payment_settings (
  academy_id              uuid primary key references public.academies(id) on delete cascade,
  provider                public.payment_provider not null default 'toyyibpay',
  toyyibpay_category_code text,
  toyyibpay_is_sandbox    boolean not null default true,
  toyyibpay_enabled       boolean not null default false,   -- gates the student Pay button
  toyyibpay_has_secret    boolean not null default false,
  toyyibpay_secret_last4  text,
  toyyibpay_secret_set_at timestamptz,
  toyyibpay_secret_set_by uuid references auth.users(id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
alter table public.academy_payment_settings enable row level security;
create trigger set_updated_at before update on public.academy_payment_settings
  for each row execute function app.set_updated_at();

-- Staff may read the NON-SECRET metadata (there is no secret column here, so
-- `select *` is always safe). Only admins may write.
create policy "payment_settings: staff read" on public.academy_payment_settings
  for select to authenticated using (app.is_staff(academy_id));
create policy "payment_settings: admin write" on public.academy_payment_settings
  for all to authenticated
  using (app.is_admin(academy_id)) with check (app.is_admin(academy_id));

-- ---------------------------------------------------------------------------
-- RPC: store / replace an academy's ToyyibPay secret (admin only).
--   Secret goes into Vault under a stable per-academy name; only the masked
--   last-4 + metadata are persisted in public. Returns metadata (never the key).
--   Called by the `toyyibpay-connect` edge fn with the caller's JWT, so the
--   app.is_admin guard is enforced against the real admin (defense in depth).
-- ---------------------------------------------------------------------------
create or replace function public.set_toyyibpay_credentials(
  _academy uuid,
  _secret text,
  _category text,
  _is_sandbox boolean,
  _enabled boolean
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  _name  text := 'toyyibpay_secret:' || _academy::text;
  _sid   uuid;
  _last4 text;
begin
  if not app.is_admin(_academy) then
    raise exception 'Not authorized';
  end if;
  if _secret is null or length(trim(_secret)) < 8 then
    raise exception 'A valid ToyyibPay secret key is required';
  end if;
  _last4 := right(_secret, 4);

  -- create_secret errors on a duplicate name, so update in place when present.
  select id into _sid from vault.secrets where name = _name;
  if _sid is null then
    perform vault.create_secret(_secret, _name, 'ToyyibPay userSecretKey');
  else
    perform vault.update_secret(_sid, _secret, _name, 'ToyyibPay userSecretKey');
  end if;

  insert into public.academy_payment_settings as aps (
    academy_id, toyyibpay_category_code, toyyibpay_is_sandbox, toyyibpay_enabled,
    toyyibpay_has_secret, toyyibpay_secret_last4, toyyibpay_secret_set_at, toyyibpay_secret_set_by
  )
  values (
    _academy, _category, coalesce(_is_sandbox, true), coalesce(_enabled, false),
    true, _last4, now(), (select auth.uid())
  )
  on conflict (academy_id) do update set
    toyyibpay_category_code = coalesce(excluded.toyyibpay_category_code, aps.toyyibpay_category_code),
    toyyibpay_is_sandbox    = excluded.toyyibpay_is_sandbox,
    toyyibpay_enabled       = excluded.toyyibpay_enabled,
    toyyibpay_has_secret    = true,
    toyyibpay_secret_last4  = excluded.toyyibpay_secret_last4,
    toyyibpay_secret_set_at = now(),
    toyyibpay_secret_set_by = (select auth.uid());

  return json_build_object(
    'has_secret', true,
    'last4', _last4,
    'category_code', _category,
    'is_sandbox', coalesce(_is_sandbox, true),
    'enabled', coalesce(_enabled, false)
  );
end;
$$;
revoke execute on function public.set_toyyibpay_credentials(uuid, text, text, boolean, boolean) from public, anon;
grant  execute on function public.set_toyyibpay_credentials(uuid, text, text, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: read an academy's ToyyibPay secret. SERVICE-ROLE ONLY.
--   Postgres grants EXECUTE to PUBLIC by default, and anon/authenticated inherit
--   PUBLIC — so we must REVOKE FROM public (not just authenticated) or any anon
--   caller could exfiltrate every academy's key. Only edge functions holding the
--   service-role key may call this.
-- ---------------------------------------------------------------------------
create or replace function public.get_toyyibpay_secret(_academy uuid)
returns text
language sql
security definer
set search_path = ''
stable
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'toyyibpay_secret:' || _academy::text;
$$;
revoke execute on function public.get_toyyibpay_secret(uuid) from public, anon, authenticated;
grant  execute on function public.get_toyyibpay_secret(uuid) to service_role;
