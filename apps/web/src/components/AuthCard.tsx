import type { ReactNode } from 'react'
import { LanguageToggle } from '@/components/LanguageToggle'
import { Logo } from '@/components/Logo'
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
  corner,
}: {
  title: string
  subtitle?: string
  children: ReactNode
  /** Sits in the bottom corner of the page, outside the card's column. */
  corner?: ReactNode
}) {
  return (
    <div className="bg-muted relative flex min-h-svh flex-col items-center p-6">
      {/* Nobody is signed in here, so the user menu's copy of this control is
          out of reach — the choice has to be reachable before sign-in. */}
      <LanguageToggle className="absolute top-4 right-4" />
      <div className="my-auto w-full max-w-sm">
        <Logo className="mb-6" />
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{title}</CardTitle>
            {subtitle ? <CardDescription>{subtitle}</CardDescription> : null}
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
      </div>
      {/* In the flow rather than absolute, so on a short screen it lands under
          the card instead of on top of it. */}
      {corner ? <div className="-mr-2 mt-6 -mb-2 self-end">{corner}</div> : null}
    </div>
  )
}
