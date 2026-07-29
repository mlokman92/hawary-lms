/**
 * The stat-colour vocabulary shared by every dashboard tile and stat card:
 * positive = in good standing, warning = provisional, danger = ended/at risk,
 * accent = a derived gap, muted = dormant, info = neutral count.
 *
 * Foreground-only, and both halves of every colour pair are spelled out in full
 * so Tailwind's scanner can see them.
 */
export type Tone = 'info' | 'positive' | 'warning' | 'danger' | 'accent' | 'muted'

export const TONE_CLASS: Record<Tone, string> = {
  info: 'text-blue-600 dark:text-blue-400',
  positive: 'text-emerald-600 dark:text-emerald-400',
  warning: 'text-amber-600 dark:text-amber-400',
  danger: 'text-destructive',
  accent: 'text-violet-600 dark:text-violet-400',
  muted: 'text-muted-foreground',
}
