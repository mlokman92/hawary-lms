import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * "Nothing here" in the two sizes the app uses:
 *   inline — a dashed box that sits in the flow of a list (the common case)
 *   block  — a tall centred panel that owns the viewport when a page is empty
 */
export function EmptyState({
  icon: Icon,
  title,
  body,
  children,
  size = 'inline',
  className,
}: {
  icon?: LucideIcon
  title: ReactNode
  body?: ReactNode
  children?: ReactNode
  size?: 'inline' | 'block'
  className?: string
}) {
  if (size === 'block') {
    return (
      <div
        className={cn(
          'flex min-h-[40vh] flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 text-center',
          className,
        )}
      >
        {Icon ? (
          <Icon className="text-muted-foreground size-6" aria-hidden />
        ) : null}
        <div>
          {/* Title-only panels keep the muted/regular treatment the back-office
              used before these were extracted; a title only becomes a heading
              when there is body copy under it. */}
          <p
            className={
              body ? 'text-sm font-medium' : 'text-muted-foreground text-sm'
            }
          >
            {title}
          </p>
          {body ? (
            <p className="text-muted-foreground mt-1 text-sm">{body}</p>
          ) : null}
        </div>
        {children ? (
          <div className="flex flex-wrap items-center justify-center gap-2">
            {children}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'text-muted-foreground rounded-xl border border-dashed p-10 text-center text-sm',
        className,
      )}
    >
      <p>{title}</p>
      {body ? <p className="mt-1">{body}</p> : null}
      {children ? (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          {children}
        </div>
      ) : null}
    </div>
  )
}
