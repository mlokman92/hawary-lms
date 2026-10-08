// The film's clock. Shifts `Date` so that "now" is the cast's day, then lets
// it tick — animations and query timers keep working, and "today", "3 days
// overdue" and "in 6 days" read the same on whatever day the shot is taken.

import { DEFAULT_NOW, at } from './kit'

let installedAt: string | null = null

/**
 * @param target  '2026-10-07T12:06' (Malaysian wall clock), any ISO instant,
 *                or nothing for the default (cast.today, 11:55 MYT).
 * @returns the instant the clock was set to, as ISO.
 */
export function installClock(target?: string | null): string {
  const g = globalThis as any
  const Real: DateConstructor = g.__RealDate ?? Date
  g.__RealDate = Real
  const iso = at(target && target.trim() ? target : DEFAULT_NOW)
  const offset = Real.parse(iso) - Real.now()

  // A function, not a class: some libraries still call Date() without `new`.
  function FilmDate(this: unknown, ...args: any[]) {
    if (!new.target) return new Real(Real.now() + offset).toString()
    const d = args.length === 0 ? new Real(Real.now() + offset) : new (Real as any)(...args)
    Object.setPrototypeOf(d, new.target.prototype)
    return d
  }
  // Same prototype object, so `x instanceof Date` holds for dates made before
  // and after the swap, and for the ones JSON / Intl hand back.
  FilmDate.prototype = Real.prototype
  FilmDate.now = () => Real.now() + offset
  FilmDate.parse = Real.parse
  FilmDate.UTC = Real.UTC
  g.Date = FilmDate
  installedAt = new Real(Real.parse(iso)).toISOString()
  return installedAt
}

/** What the clock was last set to, or null if it never was. */
export const clockSetTo = (): string | null => installedAt
