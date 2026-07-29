import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

/**
 * In-flow loading box, sized to match the list it will be replaced by.
 * The default label is resolved here rather than in a default parameter — a
 * translated default cannot be read before the hook runs.
 */
export function LoadingBlock({
  label,
  className,
}: {
  label?: string
  className?: string
}) {
  const { t } = useT()
  return (
    <div
      className={cn(
        'text-muted-foreground rounded-xl border p-8 text-center text-sm',
        className,
      )}
    >
      {label ?? t('common.loading')}
    </div>
  )
}

/**
 * The third state the learner tree used to omit. An RLS denial arrives as a
 * query error, not as an empty list — rendering it as "nothing here" is how a
 * permission problem gets mistaken for missing content.
 */
export function ErrorBlock({
  error,
  className,
}: {
  error: { message: string } | null | undefined
  className?: string
}) {
  if (!error) return null
  return (
    <div
      className={cn(
        'text-destructive rounded-xl border p-8 text-center text-sm',
        className,
      )}
    >
      {error.message}
    </div>
  )
}

/** Full-route spinner text, for a page that has nothing to frame yet. */
export function RouteLoading({ label }: { label?: string }) {
  const { t } = useT()
  return (
    <div className="text-muted-foreground py-16 text-center text-sm">
      {label ?? t('common.loading')}
    </div>
  )
}

/** The whole-viewport wait an auth/role gate shows before it can decide. */
export function FullPageLoading() {
  const { t } = useT()
  return (
    <div className="text-muted-foreground grid min-h-svh place-items-center text-sm">
      {t('common.loading')}
    </div>
  )
}

/** A record that does not exist, or that RLS will not show this caller. */
export function NotFoundBlock({
  message,
  backTo,
  backLabel,
}: {
  message: ReactNode
  backTo: string
  backLabel: string
}) {
  return (
    <div className="mx-auto max-w-2xl py-16 text-center">
      <p className="text-muted-foreground text-sm">{message}</p>
      <Button asChild variant="outline" className="mt-4">
        <Link to={backTo}>{backLabel}</Link>
      </Button>
    </div>
  )
}
