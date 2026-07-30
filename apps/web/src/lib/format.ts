import { getLang, translate, type Lang } from '@/lib/i18n'

const DATE_OPTS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
}

/**
 * The Intl locale for a language — Malaysian either way, only the month names
 * and the day/month order change. One home for the mapping: pages that need a
 * date shape these helpers do not offer still format it the same way.
 *
 * Take `lang` explicitly wherever the result is memoised, so the language is a
 * visible dependency; use `locale()` for a plain render-time call.
 */
export function localeFor(lang: Lang): string {
  return lang === 'ms' ? 'ms-MY' : 'en-MY'
}

/** Read at call time, so a language switch lands on the next render. */
function locale(): string {
  return localeFor(getLang())
}

/** Malaysian short date, or an em dash when there is nothing to show. */
export function fmtDate(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleDateString(locale(), DATE_OPTS) : '—'
}

/** Date + time, for deadlines and timestamps where the hour matters. */
export function fmtDateTime(iso: string | null | undefined): string {
  return iso
    ? new Date(iso).toLocaleString(locale(), {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : '—'
}

/** Month + year, used by the "Joined Mar 2026" sub-lines in list rows. */
export function fmtMonthYear(iso: string | null | undefined): string {
  return iso
    ? new Date(iso).toLocaleDateString(locale(), {
        month: 'short',
        year: 'numeric',
      })
    : '—'
}

/**
 * Avatar fallback initials. Language-neutral, but it belongs with the other
 * display helpers: several surfaces render the same person and should not each
 * decide what a two-word name collapses to.
 */
export function initialsOf(
  name: string | null | undefined,
  email?: string | null,
): string {
  const src = (name || email || '').trim()
  if (!src) return '—'
  const parts = src.split(/\s+/).filter(Boolean)
  if (parts.length >= 2)
    return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase()
  return src.slice(0, 2).toUpperCase()
}

/** A row can be overdue by status alone, with no due date to measure from. */
export function fmtDays(days: number | null): string {
  if (days === null) return '—'
  if (days <= 0) return translate('common.today')
  return translate(days === 1 ? 'common.days_one' : 'common.days_other', {
    count: days,
  })
}
