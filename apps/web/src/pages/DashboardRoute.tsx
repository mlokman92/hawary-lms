import { useAcademy } from '@/lib/academy'
import { RouteLoading } from '@/components/patterns/QueryState'
import { Dashboard } from './Dashboard'
import { TrainerDashboard } from './TrainerDashboard'

/**
 * Two dashboards, picked by role.
 *
 * A fork rather than a branch inside `Dashboard.tsx`: that page interleaves
 * money through eight `useMemo`s, its `coreLoading`/`coreError` guards and the
 * header's own attention count, and hooks cannot be skipped conditionally — so
 * `isAdmin &&` inside it would still *fire* `useInvoices` and
 * `usePaymentActivity` for a trainer. Forking here means a trainer's browser
 * never asks for an invoice at all, which is the only version of "cannot see
 * payment information" that a Network tab agrees with.
 *
 * It also leaves `Dashboard.tsx` untouched, so the admin's page cannot regress
 * as a side effect of building the trainer's.
 *
 * Waiting on `loading` matters: without it the first paint has no membership
 * and every admin would see the trainer dashboard flash past.
 */
export function DashboardRoute() {
  const { active, loading } = useAcademy()

  if (loading) return <RouteLoading />
  return active?.role === 'admin' ? <Dashboard /> : <TrainerDashboard />
}
