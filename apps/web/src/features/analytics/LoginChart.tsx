import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { fmtDay } from '@/lib/format'
import { useT, type TFn } from '@/lib/i18n'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import type { LoginAnalytics } from './api'

/**
 * Logins per day across one month. One series, so no legend — the figure above
 * the chart already names it.
 *
 * `--chart-3` is the same teal in both themes and clears 3:1 against either
 * surface, so the bars keep their hue when the theme is toggled.
 */
function chartConfig(t: TFn) {
  return {
    logins: { label: t('analytics.logins'), color: 'var(--chart-3)' },
  } satisfies ChartConfig
}

export function LoginChart({ days }: { days: LoginAnalytics['days'] }) {
  const { t } = useT()
  const config = useMemo(() => chartConfig(t), [t])

  return (
    <ChartContainer config={config} className="aspect-auto h-56 w-full">
      <BarChart accessibilityLayer data={days} margin={{ left: 4, right: 4 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="day"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          // The selector already names the month; the axis only needs the date.
          tickFormatter={(day: string) => String(Number(day.slice(8)))}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          width={36}
          // A count of people cannot be 2.5.
          allowDecimals={false}
        />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              labelFormatter={(_label, payload) =>
                fmtDay(
                  (payload?.[0]?.payload as { day?: string } | undefined)?.day,
                )
              }
            />
          }
        />
        <Bar
          dataKey="logins"
          fill="var(--color-logins)"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ChartContainer>
  )
}
