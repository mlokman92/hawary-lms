import { useEffect, useMemo, useState } from 'react'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { fmtDayShort, fmtTime, ymdOf, type Ymd } from './calendar'
import type { OpenSlot } from './api'

/**
 * Pick a day, then a time. Shared by the learner page and the staff booking
 * dialog, because they are the same question asked by different people — and
 * when they were two implementations the staff one was a bare date input that
 * could land you on a day with nothing free.
 *
 * The strip lists **only days with something free**, each chip carrying how
 * many. That count is the point: "which day should I look at" becomes something
 * you can see without tapping. It also means every chip is actionable, so there
 * is no disabled state to explain, and it is why this scrolls rather than pages
 * a week at a time — seven fixed columns left about 34px per day on a phone.
 *
 * The component owns which day is showing; the caller owns which slot is
 * chosen, because that is the answer it needs.
 */
export function SlotPicker({
  slots,
  tz,
  locale,
  value,
  onChange,
  emptyLabel,
}: {
  /** Every free slot in the window, in any order. */
  slots: OpenSlot[]
  tz: string
  locale: string
  /** The chosen `starts_at`, or '' for none. */
  value: string
  onChange: (startsAt: string) => void
  /** Shown when nothing at all is free. */
  emptyLabel: string
}) {
  const { t, tn } = useT()
  const [day, setDay] = useState<Ymd | null>(null)

  /** starts_at → the slot, grouped by the day it falls on in the academy's zone. */
  const byDay = useMemo(() => {
    const map = new Map<Ymd, OpenSlot[]>()
    for (const s of slots) {
      const d = ymdOf(s.starts_at, tz)
      const list = map.get(d)
      if (list) list.push(s)
      else map.set(d, [s])
    }
    return map
  }, [slots, tz])

  const openDays = useMemo(() => [...byDay.keys()].sort(), [byDay])

  // Land on the first day that has something, and go back to it if the chosen
  // day empties out — booking its last slot is the ordinary way that happens.
  useEffect(() => {
    if (day !== null && byDay.has(day)) return
    setDay(openDays[0] ?? null)
  }, [byDay, openDays, day])

  const daySlots = day ? (byDay.get(day) ?? []) : []

  if (openDays.length === 0) {
    return <p className="text-muted-foreground text-sm">{emptyLabel}</p>
  }

  return (
    <div className="grid gap-3">
      <div className="-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1">
        {openDays.map((d) => {
          const count = byDay.get(d)?.length ?? 0
          const chosen = day === d
          return (
            <button
              key={d}
              type="button"
              onClick={() => {
                setDay(d)
                onChange('')
              }}
              aria-pressed={chosen}
              className={cn(
                'flex min-w-20 shrink-0 snap-start flex-col items-center gap-0.5',
                'rounded-lg border px-3 py-2',
                'focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none',
                chosen
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'hover:border-foreground/30',
              )}
            >
              <span className="text-sm font-medium whitespace-nowrap">
                {fmtDayShort(d, locale)}
              </span>
              <span
                className={cn(
                  'text-xs tabular-nums',
                  chosen
                    ? 'text-primary-foreground/80'
                    : 'text-muted-foreground',
                )}
              >
                {tn('appt.slots.day_count', count)}
              </span>
            </button>
          )
        })}
      </div>

      {daySlots.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('appt.learn.pick_day')}</p>
      ) : (
        <div className="grid gap-2">
          {/* On a phone the chosen chip can be scrolled out of view by the time
              you are looking at the grid, so the count is repeated here. */}
          <p className="text-muted-foreground text-xs">
            {tn('appt.slots.available', daySlots.length)}
          </p>
          {/* A grid rather than wrapped flex so the columns line up, and 44px
              tall because this is the control people press with a thumb. */}
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {daySlots.map((s) => (
              <button
                key={s.starts_at}
                type="button"
                onClick={() => onChange(s.starts_at)}
                className={cn(
                  'flex min-h-11 items-center justify-center rounded-md border px-2 text-sm tabular-nums',
                  'focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none',
                  value === s.starts_at
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'hover:border-foreground/30',
                )}
              >
                {fmtTime(s.starts_at, tz)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
