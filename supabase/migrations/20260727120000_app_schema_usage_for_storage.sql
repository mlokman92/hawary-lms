-- ============================================================================
-- 0021 · Let the storage RLS policies reach the `app` tenancy helpers.
--
-- The avatars / note-media policies on storage.objects call
-- app.is_staff(...), but nothing had USAGE on schema `app` except postgres:
--
--   public.*        owned by postgres                 -> policies work
--   storage.objects owned by supabase_storage_admin   -> policies could not
--                                                        reach app.is_staff
--
-- which is why every upload failed with "new row violates row-level security
-- policy" while every ordinary table query succeeded, and why both buckets were
-- empty. Granting USAGE adds no client-reachable API surface: PostgREST only
-- exposes the schemas in its exposed-schemas config (public), so `app` stays
-- unreachable over REST. The functions themselves are SECURITY DEFINER and key
-- off auth.uid(), so they remain safe to call.
-- ============================================================================

grant usage on schema app to authenticated, supabase_storage_admin;
