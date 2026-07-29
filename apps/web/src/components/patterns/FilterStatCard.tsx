import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TONE_CLASS, type Tone } from '@/lib/tone'

/**
 * The StatCard shape, rendered as a button because these double as filters.
 * A native <button aria-pressed> rather than a styled div — the pressed state
 * is the whole point and has to reach assistive tech.
 */
export function FilterStatCard({
  label,
  value,
  icon: Icon,
  tone,
  active,
  onClick,
}: {
  label: string
  value: number | string
  icon: LucideIcon
  tone: Tone
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'bg-card text-card-foreground hover:bg-accent flex flex-row items-center gap-3 rounded-xl border p-4 text-left shadow-sm transition-colors',
        active && 'border-primary ring-primary/40 ring-1',
      )}
    >
      <div className="bg-muted flex size-9 shrink-0 items-center justify-center rounded-lg">
        <Icon className={cn('size-4', TONE_CLASS[tone])} />
      </div>
      <div className="min-w-0">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="truncate text-lg font-semibold tabular-nums">{value}</p>
      </div>
    </button>
  )
}
