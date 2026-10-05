import { Navigate, Outlet } from 'react-router-dom'
import { RouteLoading } from '@/components/patterns/QueryState'
import { useAnalyticsAccess } from '@/features/analytics/api'

/**
 * `/analytics`: Directors, plus the one account `app.can_view_analytics` names.
 * Same shape as `DirectorRoute` — wait, then fail closed. It cannot *be*
 * `DirectorRoute`, because that account is let in by address rather than by
 * its membership, and only the database knows the address.
 */
export function AnalyticsRoute() {
  const { allowed, loading } = useAnalyticsAccess()

  if (loading) return <RouteLoading />
  if (!allowed) return <Navigate to="/" replace />
  return <Outlet />
}
