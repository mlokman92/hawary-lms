import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useAcademy } from '../lib/academy'

export function Dashboard() {
  const { user, signOut } = useAuth()
  const { memberships, active, activeAcademyId, setActiveAcademyId } = useAcademy()

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand sm">
          Hawary <span>LMS</span>
        </div>
        <div className="topbar-right">
          {memberships.length > 1 ? (
            <select
              value={activeAcademyId ?? ''}
              onChange={(e) => setActiveAcademyId(e.target.value)}
              aria-label="Active academy"
            >
              {memberships.map((m) => (
                <option key={m.academyId} value={m.academyId}>
                  {m.academy?.name ?? m.academyId}
                </option>
              ))}
            </select>
          ) : null}
          <span className="muted">{user?.email}</span>
          <button className="btn btn-ghost" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </header>

      <main className="page">
        <div className="card">
          <h1>{active?.academy?.name ?? 'Your academy'}</h1>
          <p className="muted">
            You are <strong>{active?.role ?? 'a member'}</strong>
            {active?.academy ? <> of {active.academy.name}</> : null}.
          </p>
          <p>
            This is the admin dashboard shell. Notes, courses, enrollment,
            assessments, and billing screens land here next.
          </p>
          <div className="link-row">
            <Link className="btn" to="/onboarding">
              Create another academy
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
