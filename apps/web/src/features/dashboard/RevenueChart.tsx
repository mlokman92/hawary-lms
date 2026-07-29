import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { formatMYR } from '@hawary/shared'
import { useT, type TFn } from '@/lib/i18n'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import type { RevenuePoint } from './api'

/**
 * Colours are set here rather than through --chart-*: those tokens are orange
 * in light and blue in dark, so a series would change hue on theme toggle.
 * These match the money semantics used everywhere else on the dashboard —
 * emerald is cash that arrived, neutral is a bill that was merely raised — and
 * go lighter in dark mode, like every other colour pair in the app.
 *
 * The colours are a module constant; the labels are not, because they are copy
 * and have to be read after the language is known.
 */
const SERIES: Record<'invoiced' | 'collected', { light: string; dark: string }> =
  {
    invoiced: { light: 'oklch(0.556 0 0)', dark: 'oklch(0.708 0 0)' },
    collected: {
      light: 'oklch(0.596 0.145 163.225)',
      dark: 'oklch(0.696 0.17 162.48)',
    },
  }

type SeriesKey = keyof typeof SERIES

function chartConfig(t: TFn) {
  return {
    invoiced: { label: t('dash.chart.invoiced'), theme: SERIES.invoiced },
    collected: { label: t('dash.chart.collected'), theme: SERIES.collected },
  } satisfies ChartConfig
}

/** Axis ticks only — sen to a short ringgit label ("RM 1.2k"). */
function tickMYR(sen: number) {
  const rm = sen / 100
  if (rm >= 1_000_000) return `RM ${(rm / 1_000_000).toFixed(1)}m`
  if (rm >= 1_000) return `RM ${(rm / 1_000).toFixed(1)}k`
  return `RM ${Math.round(rm)}`
}

export function RevenueChart({ data }: { data: RevenuePoint[] }) {
  const { t } = useT()
  const config = useMemo(() => chartConfig(t), [t])

  return (
    <ChartContainer config={config} className="aspect-auto h-56 w-full">
      <BarChart accessibilityLayer data={data} margin={{ left: 4, right: 4 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          width={64}
          tickFormatter={tickMYR}
        />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              // The default prints item.value.toLocaleString(), which on sen
              // would read "3100" instead of "RM 31.00".
              labelFormatter={(_label, payload) =>
                (payload?.[0]?.payload as RevenuePoint | undefined)?.full ?? ''
              }
              formatter={(value, name, item) => (
                <>
                  <div
                    className="h-2.5 w-2.5 shrink-0 self-center rounded-[2px]"
                    style={{ background: item?.color }}
                  />
                  <div className="flex flex-1 items-center justify-between gap-3 leading-none">
                    <span className="text-muted-foreground">
                      {config[name as SeriesKey]?.label ?? name}
                    </span>
                    <span className="text-foreground font-medium tabular-nums">
                      {formatMYR(Number(value))}
                    </span>
                  </div>
                </>
              )}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="invoiced" fill="var(--color-invoiced)" radius={4} />
        <Bar dataKey="collected" fill="var(--color-collected)" radius={4} />
      </BarChart>
    </ChartContainer>
  )
}
