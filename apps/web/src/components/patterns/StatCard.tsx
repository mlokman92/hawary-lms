import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TONE_CLASS, type Tone } from '@/lib/tone'
import { Card } from '@/components/ui/card'

/** A read-only total. `sub` adds the optional second line. */
export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = 'muted',
}: {
  label: string
  value: string
  sub?: string
  icon: LucideIcon
  tone?: Tone
}) {
  return (
    <Card className="flex-row items-center gap-3 p-4">
      <div className="bg-muted flex size-9 shrink-0 items-center justify-center rounded-lg">
        <Icon className={cn('size-4', TONE_CLASS[tone])} />
      </div>
      <div className="min-w-0">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="truncate text-lg font-semibold tabular-nums">{value}</p>
        {sub ? (
          <p className="text-muted-foreground mt-0.5 truncate text-xs tabular-nums">
            {sub}
          </p>
        ) : null}
      </div>
    </Card>
  )
}
