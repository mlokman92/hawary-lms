import type { ReactNode } from 'react'

export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: ReactNode
}) {
  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="brand">
          Hawary <span>LMS</span>
        </div>
        <h1>{title}</h1>
        {subtitle ? <p className="muted">{subtitle}</p> : null}
        {children}
      </div>
    </div>
  )
}
