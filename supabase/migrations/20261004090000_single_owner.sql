-- ============================================================================
-- One owner: Hawary Academy
-- ----------------------------------------------------------------------------
-- The LMS started as a self-serve multi-tenant SaaS: any signed-in account
-- could insert an `academies` row and `app.handle_new_academy` made it that
-- academy's admin. It is now Hawary Academy's own system. Self-serve founding
-- had already been taken off the screen (Onboarding sends people to WhatsApp)
-- because invited students kept founding empty "Hawary" academies instead of
-- joining the real one — but the policy still let any JWT do it through
-- PostgREST, and a hidden button is not a boundary.
--
-- `academy_id` and every per-academy policy STAY. Hawary Academy may open
-- branches, and a branch is an academy row: membership per branch, RLS per
-- branch, exactly as today. What changes is who may create and destroy one:
--
--   INSERT  nobody through the API. A branch is opened by the owner (SQL / the
--           service role); `handle_new_academy` still makes `created_by` its
--           admin when a row is inserted that way.
--   DELETE  nobody through the API. `academies` is the root of an ON DELETE
--           CASCADE tree that holds students, invoices and the payment ledger —
--           one admin click would have erased a branch's money history. Closing
--           a branch is an owner decision taken in SQL, not a settings button.
--
-- UPDATE (admins edit their academy's profile, invoice details, logo) and
-- SELECT (members read theirs) are unchanged.
-- ============================================================================

drop policy if exists "academies: authenticated can create" on public.academies;
drop policy if exists "academies: admins can delete" on public.academies;

-- Belt and braces: without a policy RLS already denies both, but the table
-- grants are what an RLS-disabled mistake would fall back on.
revoke insert, delete on public.academies from anon, authenticated;

comment on table public.academies is
  'Hawary Academy and its branches. One row per branch; created and closed by the owner, never through the API.';
