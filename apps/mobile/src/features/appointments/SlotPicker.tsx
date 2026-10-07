import { useMemo, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useT } from '@/lib/i18n'
import { T, space, useTheme } from '@/ui'
import type { OpenSlot } from './api'
import { fmtDayShort, fmtTime, ymdOf, type Ymd } from './calendar'

/**
 * Picking when — the phone version of the web app's `SlotPicker`, shared by the
 * student's booking screen and the staff "book for a student" screen because
 * they are the same question asked by different people.
 *
 * The same three decisions (docs/appointments.md → "Picking when is one
 * component"): the day strip lists only days that have something free, each
 * carrying how many, and scrolls rather than pages; every chip is therefore
 * actionable, with no disabled state to explain; and the times are a grid of
 * thumb-sized cells.
 *
 * The free-instructor count hides itself when no slot in the window exceeds
 * one — in a single-instructor academy every chip would read "1".
 */
export function SlotPicker({
  slots,
  tz,
  locale,
  value,
  onChange,
}: {
  slots: OpenSlot[]
  tz: string
  locale: string
  /** The chosen `starts_at`, or '' for none. */
  value: string
  onChange: (startsAt: string) => void
}) {
  const { t, tn } = useT()
  const { c } = useTheme()

  const days = useMemo(() => {
    const map = new Map<Ymd, OpenSlot[]>()
    for (const s of slots) {
      const day = ymdOf(s.starts_at, tz)
      const list = map.get(day) ?? []
      list.push(s)
      map.set(day, list)
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [slots, tz])

  const chosenDay = value ? ymdOf(value, tz) : null
  const [day, setDay] = useState<Ymd | null>(chosenDay)
  const active = day ?? chosenDay
  const times = days.find(([d]) => d === active)?.[1] ?? []
  const showCapacity = slots.some((s) => s.capacity > 1)

  return (
    <View style={{ gap: space.md }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: space.sm }}
      >
        {days.map(([d, list]) => {
          const on = d === active
          return (
            <Pressable
              key={d}
              onPress={() => {
                setDay(d)
                // A time belongs to its day; changing the day drops it.
                if (chosenDay !== d) onChange('')
              }}
              style={{
                minWidth: 76,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: on ? c.primary : c.border,
                backgroundColor: on ? c.primary : c.card,
                paddingHorizontal: space.md,
                paddingVertical: space.sm,
                alignItems: 'center',
              }}
            >
              <Text
                style={{
                  color: on ? c.primaryForeground : c.foreground,
                  fontSize: 13,
                  fontWeight: '600',
                }}
              >
                {fmtDayShort(d, locale)}
              </Text>
              <Text
                style={{
                  color: on ? c.primaryForeground : c.mutedForeground,
                  fontSize: 11,
                }}
              >
                {tn('appt.slots.day_count', list.length)}
              </Text>
            </Pressable>
          )
        })}
      </ScrollView>

      {!active ? (
        <T v="small" muted>
          {t('appt.learn.pick_day')}
        </T>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {times.map((s) => {
            const on = s.starts_at === value
            return (
              <Pressable
                key={s.starts_at}
                onPress={() => onChange(on ? '' : s.starts_at)}
                style={{
                  width: '31%',
                  minHeight: 46,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: on ? c.primary : c.border,
                  backgroundColor: on ? c.primary : c.card,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text
                  style={{
                    color: on ? c.primaryForeground : c.foreground,
                    fontSize: 14,
                    fontWeight: '500',
                  }}
                >
                  {fmtTime(s.starts_at, tz)}
                </Text>
                {showCapacity ? (
                  <Text
                    style={{
                      color: on ? c.primaryForeground : c.mutedForeground,
                      fontSize: 10,
                    }}
                  >
                    {tn('appt.slots.free', s.capacity)}
                  </Text>
                ) : null}
              </Pressable>
            )
          })}
        </View>
      )}
    </View>
  )
}
