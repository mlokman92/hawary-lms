import { Navigate, Outlet } from 'react-router-dom'
import { useAcademy } from '@/lib/academy'
import { RouteLoading } from '@/components/patterns/QueryState'

/**
 * Admin-only routes. A role gate on the route rather than inside the page;
 * `DirectorRoute` is its sibling for the Director-only ones.
 *
 * It fails CLOSED and it never hangs, which are two different bugs:
 *   - `active && active.role !== 'admin'` renders the page when `active` is
 *     null and not loading;
 *   - `loading || !active` spins forever in that same state.
 * Waiting only on `loading`, then demanding `admin`, does neither.
 *
 * A redirect rather than an in-place "admins only" panel: with the money
 * policies keyed on `app.is_admin`, these pages would render an empty ledger
 * with a live Export button — a closed door that looks like data loss.
 * `/appointments/settings` keeps its explanatory panel; it is a page somebody
 * might legitimately land on, and it shows nothing confidential when they do.
 */
export function AdminRoute() {
  const { active, loading } = useAcademy()

  if (loading) return <RouteLoading />
  if (active?.role !== 'admin') return <Navigate to="/" replace />
  return <Outlet />
}
