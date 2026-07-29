import type { ReactNode } from 'react'
import { LanguageToggle } from '@/components/LanguageToggle'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

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
    <div className="bg-muted relative flex min-h-svh items-center justify-center p-6">
      {/* Nobody is signed in here, so the user menu's copy of this control is
          out of reach — the choice has to be reachable before sign-in. */}
      <LanguageToggle className="absolute top-4 right-4" />
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center text-xl font-bold tracking-tight">
          Hawary <span className="text-primary">LMS</span>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{title}</CardTitle>
            {subtitle ? <CardDescription>{subtitle}</CardDescription> : null}
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
      </div>
    </div>
  )
}
