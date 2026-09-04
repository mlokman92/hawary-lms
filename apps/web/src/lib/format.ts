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
 * A 'YYYY-MM' bucket as a month name — "August 2026", "Ogos 2026".
 *
 * Takes the key, not an instant: the payment report's months are academy-local
 * calendar buckets the database already decided, and re-parsing one as a local
 * date would let a browser west of Kuala Lumpur render August's takings as
 * July. Pinned to UTC for the same reason.
 */
export function fmtYearMonth(ym: string): string {
  const d = new Date(`${ym}-01T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return ym
  return d.toLocaleDateString(locale(), {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
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

/**
 * Name a person by the best thing known about them. A record can legitimately
 * carry no name — the invite dialog asks for an email and nothing else — and
 * every surface that hits that case is already holding the email, so the real
 * choice is between an address and the word "Unnamed". An address identifies
 * somebody; "Unnamed" identifies nobody, and on an invoice it is worse than
 * blank. Returns null when both are empty, so the caller still supplies the
 * last-resort label in the reader's own language.
 *
 * Sibling of `initialsOf`, and takes the same two arguments for the same
 * reason: several surfaces render the same person and must not each invent
 * their own answer to "who is this".
 */
export function personName(
  name: string | null | undefined,
  email?: string | null,
): string | null {
  return (name || '').trim() || (email || '').trim() || null
}

/** A row can be overdue by status alone, with no due date to measure from. */
export function fmtDays(days: number | null): string {
  if (days === null) return '—'
  if (days <= 0) return translate('common.today')
  return translate(days === 1 ? 'common.days_one' : 'common.days_other', {
    count: days,
  })
}
