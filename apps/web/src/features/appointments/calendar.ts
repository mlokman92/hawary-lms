/**
 * Date arithmetic for the booking surfaces.
 *
 * Everything here is anchored to the ACADEMY's timezone, never the browser's.
 * `app.booking_slots` generates "10:00 on Tuesday" in the tenant's own zone, so
 * an admin opening the calendar from Dubai has to see the same Tuesday the
 * generator meant. Reading a returned instant with plain `getDate()` would show
 * them Monday evening.
 *
 * A calendar day is carried as a plain `YYYY-MM-DD` string — the same thing the
 * RPCs take and `<input type="date">` speaks — so day arithmetic never touches a
 * Date whose meaning depends on where the reader is sitting.
 */

/** `YYYY-MM-DD`. The unit of a calendar day everywhere in this feature. */
export type Ymd = string

/** Noon UTC: far enough from either edge that no zone shifts the date part. */
function ymdAsDate(ymd: Ymd): Date {
  return new Date(`${ymd}T12:00:00Z`)
}

function partsIn(at: Date, tz: string): Record<string, string> {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at)
  return Object.fromEntries(parts.map((p) => [p.type, p.value]))
}

/** How far `tz` is from UTC at that instant, in ms. Handles DST by asking. */
function offsetMs(at: Date, tz: string): number {
  const p = partsIn(at, tz)
  const asIfUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second),
  )
  return asIfUtc - at.getTime()
}

/**
 * The instant at which a wall clock in `tz` reads `ymd` at `hhmm`.
 *
 * Solved rather than added: taking day-start and adding minutes would drift by
 * an hour across a DST boundary, which is invisible in Malaysia and wrong
 * everywhere else.
 */
export function zonedInstant(ymd: Ymd, hhmm: string, tz: string): Date {
  const guess = new Date(`${ymd}T${hhmm}:00Z`)
  const first = new Date(guess.getTime() - offsetMs(guess, tz))
  // A second pass matters only when the first guess landed on the far side of a
  // transition.
  const corrected = offsetMs(first, tz)
  return corrected === offsetMs(guess, tz)
    ? first
    : new Date(guess.getTime() - corrected)
}

/** The instant at which `ymd` starts in `tz`. */
export function zonedDayStart(ymd: Ymd, tz: string): Date {
  return zonedInstant(ymd, '00:00', tz)
}

/** Which calendar day an instant falls on, as the academy reckons it. */
export function ymdOf(iso: string | Date, tz: string): Ymd {
  const p = partsIn(iso instanceof Date ? iso : new Date(iso), tz)
  return `${p.year}-${p.month}-${p.day}`
}

/** Minutes since local midnight — where a booking sits on the time axis. */
export function minutesOf(iso: string | Date, tz: string): number {
  const p = partsIn(iso instanceof Date ? iso : new Date(iso), tz)
  return Number(p.hour) * 60 + Number(p.minute)
}

export function today(tz: string): Ymd {
  return ymdOf(new Date(), tz)
}

export function addDays(ymd: Ymd, days: number): Ymd {
  const d = ymdAsDate(ymd)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function daysBetween(from: Ymd, to: Ymd): number {
  return Math.round(
    (ymdAsDate(to).getTime() - ymdAsDate(from).getTime()) / 86_400_000,
  )
}

/** 0 = Sunday, matching `booking_hours.weekday` and Postgres `extract(dow)`. */
export function weekdayOf(ymd: Ymd): number {
  return ymdAsDate(ymd).getUTCDay()
}

/** The Monday of that week. Displays run Mon→Sun; storage still indexes 0=Sun. */
export function startOfWeek(ymd: Ymd): Ymd {
  const dow = weekdayOf(ymd)
  return addDays(ymd, dow === 0 ? -6 : 1 - dow)
}

/** `count` consecutive days from `from`. */
export function daysFrom(from: Ymd, count: number): Ymd[] {
  return Array.from({ length: count }, (_, i) => addDays(from, i))
}

/**
 * Weekdays in display order — Monday first, Sunday last — carrying the index
 * the database stores. The hours editor iterates this so the row order reads
 * like a working week while the values still round-trip.
 */
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const

// ---------------------------------------------------------------------------
// Formatting
//
// 24-hour throughout, in every language. This is a timetable: "14:00" is one
// fixed-width token in a grid column, and a mix of "2:00 pm" and "10:00 am"
// makes the time axis ragged and the slot chips different widths.
// ---------------------------------------------------------------------------

export function fmtTime(iso: string | Date, tz: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(iso instanceof Date ? iso : new Date(iso))
}

/** `10:00 – 11:00`, the way a slot is named. */
export function fmtRange(
  startIso: string,
  endIso: string,
  tz: string,
): string {
  return `${fmtTime(startIso, tz)} – ${fmtTime(endIso, tz)}`
}

/** `HH:MM` from minutes past midnight — the time-axis labels. */
export function fmtMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** A `time` column value (`HH:MM:SS`) as minutes past midnight. */
export function timeToMinutes(value: string): number {
  const [h, m] = value.split(':')
  return Number(h) * 60 + Number(m)
}

/** Minutes past midnight as the `HH:MM` an `<input type="time">` wants. */
export function minutesToTime(minutes: number): string {
  return fmtMinutes(minutes)
}

/** `Mon 11` — a column heading. Formatted in UTC because `ymd` is already local. */
export function fmtDayShort(ymd: Ymd, locale: string): string {
  return ymdAsDate(ymd).toLocaleDateString(locale, {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
  })
}

/** `Mon, 11 Aug` — a heading for one chosen day. */
export function fmtDayLong(ymd: Ymd, locale: string): string {
  return ymdAsDate(ymd).toLocaleDateString(locale, {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

/** `11 – 17 Aug 2026`, the week label above the calendar. */
export function fmtWeekRange(start: Ymd, locale: string): string {
  const end = addDays(start, 6)
  const a = ymdAsDate(start)
  const b = ymdAsDate(end)
  const sameMonth = start.slice(0, 7) === end.slice(0, 7)
  const left = a.toLocaleDateString(locale, {
    timeZone: 'UTC',
    day: 'numeric',
    ...(sameMonth ? {} : { month: 'short' }),
  })
  const right = b.toLocaleDateString(locale, {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
  return `${left} – ${right}`
}

/** Date + time of an instant, in the academy's zone. Used in lists, not grids. */
export function fmtWhen(iso: string, tz: string, locale: string): string {
  const d = new Date(iso)
  const day = d.toLocaleDateString(locale, {
    timeZone: tz,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
  return `${day}, ${fmtTime(iso, tz)}`
}
