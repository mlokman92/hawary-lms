// Money is stored as integer **sen** (1 MYR = 100 sen). Format/parse at the edges.

const MYR = new Intl.NumberFormat('ms-MY', {
  style: 'currency',
  currency: 'MYR',
})

/** 123456 -> "RM 1,234.56" */
export function formatMYR(sen: number): string {
  return MYR.format((sen ?? 0) / 100)
}

/** Plain amount without the currency symbol: 123456 -> "1234.56" */
export function senToRinggit(sen: number): string {
  return ((sen ?? 0) / 100).toFixed(2)
}

/** "1,234.56" | 1234.56 -> 123456 (integer sen; clamps negatives/NaN to 0). */
export function ringgitToSen(input: string | number): number {
  const n =
    typeof input === 'number' ? input : parseFloat(String(input).replace(/,/g, ''))
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.round(n * 100)
}
