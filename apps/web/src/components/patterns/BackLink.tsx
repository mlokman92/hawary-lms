import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

/** The "← Parent" affordance every detail page opens with. */
export function BackLink({
  to,
  children,
}: {
  to: string
  children: ReactNode
}) {
  return (
    <Button asChild variant="ghost" size="sm" className="-ml-2">
      <Link to={to}>
        <ArrowLeft />
        {children}
      </Link>
    </Button>
  )
}
