import { Text, View } from 'react-native'
import { font, useTheme } from '@/ui'

/**
 * A session's day as a small calendar leaf — month over day number — in the
 * academy's own timezone. It is what makes a list of sessions scannable by
 * date without reading a sentence per row.
 */
export function DateTile({
  iso,
  tz,
  locale,
  quiet,
}: {
  iso: string
  tz: string
  locale: string
  /** A session that is over: the same shape, without the brand colour. */
  quiet?: boolean
}) {
  const { c } = useTheme()
  const date = new Date(iso)
  const month = date.toLocaleDateString(locale, { month: 'short', timeZone: tz })
  const day = date.toLocaleDateString(locale, { day: 'numeric', timeZone: tz })
  return (
    <View
      style={{
        width: 52,
        height: 56,
        borderRadius: 14,
        backgroundColor: quiet ? c.muted : c.brandSoft,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          color: quiet ? c.mutedForeground : c.brand,
          fontFamily: font(700),
          fontSize: 11,
          letterSpacing: 0.6,
          textTransform: 'uppercase',
        }}
      >
        {month}
      </Text>
      <Text
        style={{
          color: quiet ? c.mutedForeground : c.brand,
          fontFamily: font(800),
          fontSize: 20,
          lineHeight: 24,
        }}
      >
        {day}
      </Text>
    </View>
  )
}
