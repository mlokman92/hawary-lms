import { Navigate } from 'react-router-dom'
import { useAcademy } from '../lib/academy'
import { Dashboard } from './Dashboard'

/** Decide where an authenticated user lands: onboarding (no academy) or dashboard. */
export function AppHome() {
  const { loading, memberships } = useAcademy()

  if (loading) return <div className="center muted">Loading…</div>
  if (memberships.length === 0) return <Navigate to="/onboarding" replace />
  return <Dashboard />
}
