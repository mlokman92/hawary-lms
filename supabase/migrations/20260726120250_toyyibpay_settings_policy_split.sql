-- ============================================================================
-- 0014b · Split academy_payment_settings admin write into per-action policies.
--   The original `for all` admin policy also covered SELECT, overlapping the
--   staff-read policy (Postgres flags multiple permissive policies for the same
--   role/action). Matching the invoices/students convention keeps a single
--   SELECT policy (staff read) and separate admin insert/update/delete.
-- ============================================================================
drop policy if exists "payment_settings: admin write"  on public.academy_payment_settings;
drop policy if exists "payment_settings: admin insert" on public.academy_payment_settings;
drop policy if exists "payment_settings: admin update" on public.academy_payment_settings;
drop policy if exists "payment_settings: admin delete" on public.academy_payment_settings;

create policy "payment_settings: admin insert" on public.academy_payment_settings
  for insert to authenticated with check (app.is_admin(academy_id));
create policy "payment_settings: admin update" on public.academy_payment_settings
  for update to authenticated using (app.is_admin(academy_id)) with check (app.is_admin(academy_id));
create policy "payment_settings: admin delete" on public.academy_payment_settings
  for delete to authenticated using (app.is_admin(academy_id));
