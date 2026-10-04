import { Navigate, Outlet } from 'react-router-dom'
import { useAcademy } from '@/lib/academy'
import { RouteLoading } from '@/components/patterns/QueryState'

/**
 * Director-only routes: the pages whose every control is a Director write
 * (`app.is_director`), so anyone else would land on a page of refusals.
 * Same shape as `AdminRoute` — wait on `loading`, then fail closed.
 */
export function DirectorRoute() {
  const { active, loading } = useAcademy()

  if (loading) return <RouteLoading />
  if (!active?.isDirector) return <Navigate to="/" replace />
  return <Outlet />
}
