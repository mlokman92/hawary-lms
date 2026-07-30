-- `revoke all ... from public` does not cover `anon`: Supabase grants EXECUTE to
-- anon and authenticated explicitly via default privileges on the public schema,
-- and an explicit grant survives a revoke aimed at PUBLIC. The advisor caught
-- both new functions as anon-callable (link_instructor_account, written before
-- those defaults, is authenticated-only — this makes the new pair match).
--
-- Nothing was exposed: both raise unless `app.is_admin(...)`, which is false for
-- a signed-out caller. This is defence in depth — a signed-out request should
-- not reach the function body at all.

revoke all on function public.list_academy_staff(uuid) from anon;
revoke all on function public.unlink_instructor_account(uuid) from anon;
