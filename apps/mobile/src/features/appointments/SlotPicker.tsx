import { useMemo, useState, type ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import Feather from '@expo/vector-icons/Feather'
import { useT } from '@/lib/i18n'
import { Button, T, elevation, font, space, useTheme } from '@/ui'
import type { OpenSlot } from './api'
import { fmtDayLong, fmtTime, ymdOf, type Ymd } from './calendar'

/** How many days are listed before "View all". Most bookings are for this week. */
const FIRST_DAYS = 7

/**
 * Picking when — shared by the student's booking screen and the staff "book
 * for a student" screen, because they are the same question asked by different
 * people.
 *
 * **It flows down the screen.** Each day that has something free is a card;
 * the open one shows its times, and — once a time is chosen — whatever the
 * caller puts in `footer` (the note, the Book button), so the whole act reads
 * top to bottom: day, time, confirm. The web lays the same days out as a strip
 * that scrolls sideways; on a phone a sideways strip hides most of the days
 * behind a gesture nobody knows to make.
 *
 * Two rules carried over from the web's picker (docs/appointments.md → "Picking
 * when is one component"): only days with something free are listed, so every
 * row is actionable; and the free-instructor count hides itself when no slot
 * in the window exceeds one — in a single-instructor academy every time would
 * read "1".
 */
export function SlotPicker({
  slots,
  tz,
  locale,
  value,
  onChange,
  footer,
}: {
  slots: OpenSlot[]
  tz: string
  locale: string
  /** The chosen `starts_at`, or '' for none. */
  value: string
  onChange: (startsAt: string) => void
  /** Drawn under the times of the day the chosen slot is in. */
  footer?: ReactNode
}) {
  const { t, tn } = useT()
  const { c, dark } = useTheme()

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
  // The soonest day opens by itself: it is the likeliest answer, and a list of
  // closed rows would cost everybody a tap before they saw a single time.
  const [open, setOpen] = useState<Ymd | null>(chosenDay ?? days[0]?.[0] ?? null)
  const [all, setAll] = useState(false)
  const showCapacity = slots.some((s) => s.capacity > 1)
  const listed = all ? days : days.slice(0, FIRST_DAYS)

  return (
    <View style={{ gap: space.md }}>
      {listed.map(([day, list]) => {
        const isOpen = day === open
        return (
          <View
            key={day}
            style={[
              { backgroundColor: c.card, borderRadius: 18 },
              elevation(c, dark),
              isOpen ? { borderWidth: 1.5, borderColor: c.brand } : null,
            ]}
          >
            <Pressable
              onPress={() => {
                setOpen(isOpen ? null : day)
                // A time belongs to its day; opening another day drops it.
                if (chosenDay && chosenDay !== day) onChange('')
              }}
              accessibilityRole="button"
              accessibilityState={{ expanded: isOpen }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.md,
                paddingHorizontal: space.lg,
                minHeight: 60,
              }}
            >
              <T style={{ flex: 1, fontWeight: '700', fontSize: 16 }}>
                {fmtDayLong(day, locale)}
              </T>
              <T v="small" muted>
                {tn('appt.slots.day_count', list.length)}
              </T>
              <Feather
                name={isOpen ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={isOpen ? c.brand : c.mutedForeground}
              />
            </Pressable>

            {isOpen ? (
              <View style={{ paddingHorizontal: space.lg, paddingBottom: space.lg, gap: space.lg }}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                  {list.map((s) => {
                    const on = s.starts_at === value
                    return (
                      <Pressable
                        key={s.starts_at}
                        onPress={() => onChange(on ? '' : s.starts_at)}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: on }}
                        style={{
                          // Three to a row, each a thumb's height.
                          flexBasis: '31%',
                          flexGrow: 1,
                          maxWidth: '32%',
                          minHeight: 50,
                          borderRadius: 14,
                          backgroundColor: on ? c.primary : c.muted,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Text
                          style={{
                            color: on ? c.primaryForeground : c.foreground,
                            fontFamily: font(700),
                            fontSize: 15,
                          }}
                        >
                          {fmtTime(s.starts_at, tz)}
                        </Text>
                        {showCapacity ? (
                          <Text
                            style={{
                              color: on ? c.primaryForeground : c.mutedForeground,
                              fontFamily: font(500),
                              fontSize: 10.5,
                              opacity: on ? 0.85 : 1,
                            }}
                          >
                            {tn('appt.slots.free', s.capacity)}
                          </Text>
                        ) : null}
                      </Pressable>
                    )
                  })}
                </View>
                {chosenDay === day ? footer : null}
              </View>
            ) : null}
          </View>
        )
      })}

      {!all && days.length > FIRST_DAYS ? (
        <Button
          variant="ghost"
          small
          title={t('learn.view_all')}
          onPress={() => setAll(true)}
        />
      ) : null}
    </View>
  )
}
