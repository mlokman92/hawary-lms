import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { TONE_CLASS, type Tone } from '@/lib/tone'
import { Card } from '@/components/ui/card'

/**
 * An exception tile: a number that wants something done about it, wrapped in a
 * stretched link to wherever it gets fixed.
 */
export function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  tone,
  to,
}: {
  label: string
  value: string
  hint: string
  icon: LucideIcon
  tone: Tone
  to: string
}) {
  return (
    // focus-within ring is required: the stretched link kills its own outline,
    // so without it the tile is invisible to keyboard users.
    <Card className="hover:border-foreground/20 focus-within:ring-ring/50 relative flex-row items-center gap-3 p-4 transition-colors focus-within:ring-[3px]">
      <div className="bg-muted flex size-9 shrink-0 items-center justify-center rounded-lg">
        <Icon className={cn('size-4', TONE_CLASS[tone])} />
      </div>
      <div className="min-w-0">
        <p className="text-muted-foreground text-xs">{label}</p>
        {/* The label and hint sit outside the anchor, so without an explicit
            name a screen reader's link list reads four bare numbers. */}
        <Link
          to={to}
          aria-label={`${label}: ${value}. ${hint}`}
          className="after:absolute after:inset-0 focus-visible:outline-none"
        >
          <p className="truncate text-lg font-semibold tabular-nums">{value}</p>
        </Link>
        <p className="text-muted-foreground mt-0.5 truncate text-xs">{hint}</p>
      </div>
    </Card>
  )
}
