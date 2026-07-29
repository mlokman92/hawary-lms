import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

/**
 * A titled card whose body is a list. The header carries an optional "view all"
 * link; the body is edge-to-edge so a `divide-y` <ul> lines up with the border.
 */
export function ListCard({
  title,
  action,
  children,
  className,
}: {
  title: ReactNode
  action?: { to: string; label: ReactNode }
  children: ReactNode
  className?: string
}) {
  return (
    <Card className={cn('gap-0 py-0', className)}>
      <div className="flex items-center justify-between gap-2 border-b p-4">
        <h2 className="text-sm font-medium">{title}</h2>
        {action ? (
          <Button asChild variant="ghost" size="sm">
            <Link to={action.to}>{action.label}</Link>
          </Button>
        ) : null}
      </div>
      {children}
    </Card>
  )
}
