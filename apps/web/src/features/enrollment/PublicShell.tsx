import type { ReactNode } from 'react'
import { Building2 } from 'lucide-react'
import { LanguageToggle } from '@/components/LanguageToggle'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import type { PublicAcademy } from './api'

/**
 * The frame for the signed-out enrollment pages.
 *
 * Wider than AuthCard because this holds a form and a course description, but
 * it keeps AuthCard's LanguageToggle: nobody is signed in here, so the
 * UserMenu's copy of that control is out of reach — and a Malaysian applicant
 * filling in a form is exactly who needs the Malay switch.
 */
export function PublicShell({
  academy,
  children,
}: {
  academy?: PublicAcademy | null
  children: ReactNode
}) {
  return (
    <div className="bg-muted relative flex min-h-svh justify-center p-4 sm:p-6">
      <LanguageToggle className="absolute top-4 right-4" />
      <div className="w-full max-w-2xl py-8">
        <div className="mb-6 flex items-center justify-center gap-3">
          {academy ? (
            <>
              <Avatar className="size-10 rounded-md">
                <AvatarImage
                  src={academy.logo_url ?? undefined}
                  alt=""
                  className="object-contain"
                />
                <AvatarFallback className="rounded-md">
                  <Building2 className="text-muted-foreground size-5" />
                </AvatarFallback>
              </Avatar>
              <span className="text-xl font-bold tracking-tight">
                {academy.name}
              </span>
            </>
          ) : (
            <span className="text-xl font-bold tracking-tight">
              Hawary <span className="text-primary">LMS</span>
            </span>
          )}
        </div>
        <div className="grid gap-4">{children}</div>
      </div>
    </div>
  )
}
