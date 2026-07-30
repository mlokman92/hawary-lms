import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'
import { Switch } from '@/components/ui/switch'

/**
 * Publish / unpublish, inline in a list row.
 *
 * The switch answers from local state and reconciles when the refetched row
 * arrives, so it flips under the finger instead of after a round trip — the
 * point of putting it in the row was to make publishing cheap, and a toggle
 * that stalls for 300ms is not cheap. A failed write snaps back, because the
 * incoming prop wins whenever it changes.
 *
 * The word stays beside it. A bare switch does not say which way is published,
 * and this is the control that decides whether students can see the thing.
 */
export function PublishSwitch({
  checked,
  disabled,
  title,
  onChange,
  className,
}: {
  checked: boolean
  disabled?: boolean
  /** Named in the accessible label — a row of unlabelled switches is unusable. */
  title: string
  onChange: (next: boolean) => void
  className?: string
}) {
  const { t } = useT()
  const [local, setLocal] = useState(checked)

  useEffect(() => setLocal(checked), [checked])

  return (
    <div className={cn('flex shrink-0 items-center gap-2', className)}>
      <span
        className={cn(
          // Fixed width: "Published" and "Draft" are different lengths, and
          // without this every row jiggles as you toggle down the list.
          'hidden w-16 text-right text-xs sm:inline-block',
          local ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {local ? t('common.published') : t('common.draft')}
      </span>
      <Switch
        size="sm"
        checked={local}
        disabled={disabled}
        aria-label={t('common.publish_aria', { title })}
        onCheckedChange={(next) => {
          setLocal(next)
          onChange(next)
        }}
      />
    </div>
  )
}
