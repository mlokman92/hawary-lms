// Small helpers every partition uses, so dates, money and invented people
// stay consistent between files written by different hands.
//
//   import { cast, TODAY, at, day, ymd, rm, rng, STUDENTS, studentByName } from '../kit'

import castJson from '../../../cast.json'

/** video/cast.json — the fictional world. Course and module titles in it are real. */
export const cast = castJson

// ---------------------------------------------------------------------------
// Time. Malaysia has no DST, so "+08:00" is the whole time zone.
// ---------------------------------------------------------------------------

/** The cast's "today": '2026-10-07'. Seed data is written relative to this. */
export const TODAY: string = cast.today

/**
 * The film's clock when a shot does not say otherwise (`?now=` on the web).
 *
 * 11:55 MYT is the moment cast.lpkc.queue describes: the AI has checked Nur
 * Aisyah's version 2 (11:47:35) and the trainer has not approved it yet
 * (12:05). base seeds exactly that state. A shot of the approved thread sets
 * `?now=2026-10-07T12:06` and its partition moves the row on.
 */
export const DEFAULT_NOW = `${TODAY}T11:55:00+08:00`

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * A Malaysian wall-clock time as an ISO instant.
 *   at('2026-10-07 09:12')  -> '2026-10-07T01:12:00.000Z'
 *   at('2026-10-07')        -> midnight MYT
 * Anything that already carries an offset or a Z is passed through Date.
 */
export function at(local: string): string {
  const s = local.trim().replace(' ', 'T')
  if (/[zZ]$|[+-]\d\d:?\d\d$/.test(s)) return new Date(s).toISOString()
  const full = /T/.test(s) ? (s.length === 16 ? s + ':00' : s) : s + 'T00:00:00'
  return new Date(full + '+08:00').toISOString()
}

/** 'YYYY-MM-DD' for today + n days (Malaysian calendar). ymd(0) is TODAY. */
export function ymd(offsetDays = 0, from: string = TODAY): string {
  const d = new Date(from + 'T12:00:00+08:00')
  d.setUTCDate(d.getUTCDate() + offsetDays)
  // 12:00 MYT is 04:00 UTC of the same calendar day.
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

/**
 * An instant relative to the cast's today, at a Malaysian wall-clock time.
 *   day(0, '09:12')   today 09:12       day(-3)  three days ago, midnight
 *   day(6, '10:00')   next Tuesday 10:00
 */
export function day(offsetDays: number, time = '00:00'): string {
  return at(`${ymd(offsetDays)} ${time}`)
}

/** Shift an ISO instant by minutes. */
export function plusMinutes(iso: string, minutes: number): string {
  return new Date(Date.parse(iso) + minutes * 60_000).toISOString()
}

/** Shift an ISO instant by whole days. */
export function plusDays(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * 86_400_000).toISOString()
}

/** The Malaysian calendar date of an instant: '2026-10-07'. */
export function mytDate(iso: string): string {
  const d = new Date(Date.parse(iso) + 8 * 3_600_000)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

// ---------------------------------------------------------------------------
// Money. Integer sen everywhere, exactly like the database.
// ---------------------------------------------------------------------------

/** Ringgit to sen: rm(1800) -> 180000. */
export const rm = (ringgit: number): number => Math.round(ringgit * 100)

/** The DKM fee every student is invoiced: RM 1,800.00. */
export const COURSE_FEE_SEN = 180_000

// ---------------------------------------------------------------------------
// Deterministic randomness: the same seed gives the same academy every run,
// so two shots of the same screen show the same people.
// ---------------------------------------------------------------------------

export type Rng = {
  /** 0 <= x < 1 */
  (): number
  int(min: number, max: number): number
  pick<T>(list: readonly T[]): T
  /** true with probability p */
  chance(p: number): boolean
  shuffle<T>(list: readonly T[]): T[]
}

export function rng(seed: number | string): Rng {
  let a = 0x9e3779b9
  const s = String(seed)
  for (let i = 0; i < s.length; i++) a = Math.imul(a ^ s.charCodeAt(i), 0x85ebca6b) >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const r = next as Rng
  r.int = (min, max) => min + Math.floor(next() * (max - min + 1))
  r.pick = (list) => list[Math.floor(next() * list.length)]
  r.chance = (p) => next() < p
  r.shuffle = (list) => {
    const out = [...list]
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1))
      ;[out[i], out[j]] = [out[j], out[i]]
    }
    return out
  }
  return r
}

// ---------------------------------------------------------------------------
// Invented people, in the cast's style. Never a production name.
// ---------------------------------------------------------------------------

const GIVEN_A = [
  'Nur', 'Nurul', 'Siti', 'Aina', 'Alya', 'Amira', 'Anis', 'Aqilah', 'Balqis', 'Dania',
  'Farah', 'Fatin', 'Hana', 'Husna', 'Iman', 'Izzati', 'Khadijah', 'Maisarah', 'Najwa', 'Nadia',
  'Qistina', 'Safiya', 'Sarah', 'Syaza', 'Wardina', 'Yasmin', 'Zahra', 'Ain', 'Auni', 'Elyana',
  'Hani', 'Irdina', 'Mysara', 'Nisa', 'Raudhah', 'Sofia', 'Syifa', 'Umairah', 'Wani', 'Zara',
]
const GIVEN_B = [
  'Adriana', 'Afiqah', 'Amani', 'Athirah', 'Batrisyia', 'Damia', 'Farhana', 'Hidayah', 'Humaira',
  'Insyirah', 'Jannah', 'Liyana', 'Mardhiah', 'Nabila', 'Raihana', 'Sofea', 'Syahirah', 'Zulaikha',
  'Aisyah', 'Amalina', 'Dalila', 'Fatihah', 'Hazwani', 'Izzah', 'Khairina', 'Madihah', 'Nadhirah',
  'Nasuha', 'Natasha', 'Sabrina', 'Shahira', 'Syazwani', 'Wahida', 'Yusra', 'Zafirah',
]
const FATHER = [
  'Abdullah', 'Ahmad', 'Aziz', 'Bakar', 'Daud', 'Fadzil', 'Ghazali', 'Hamid', 'Hashim', 'Ibrahim',
  'Idris', 'Ismail', 'Jaafar', 'Kassim', 'Latif', 'Mahmud', 'Mokhtar', 'Musa', 'Nordin', 'Omar',
  'Osman', 'Rahim', 'Ramli', 'Razali', 'Saad', 'Samad', 'Shafie', 'Sulaiman', 'Talib', 'Yaacob',
  'Yusof', 'Zainal', 'Zakaria', 'Hassan', 'Hussin', 'Jamaluddin', 'Kamaruddin', 'Mat Isa', 'Noor',
  'Rosli', 'Salleh', 'Sani', 'Tahir', 'Wahab', 'Yahya', 'Zulkifli', 'Azmi', 'Halim', 'Mansor',
]
const MALE_GIVEN = [
  'Muhammad Aiman', 'Mohd Hafiz', 'Ahmad Danial', 'Muhammad Irfan', 'Mohd Syafiq', 'Ahmad Faris',
  'Muhammad Haziq', 'Mohd Amirul', 'Ahmad Naufal', 'Muhammad Luqman', 'Mohd Zulhilmi', 'Ahmad Firdaus',
]
const OTHER = [
  'Tan Mei Ling', 'Lim Xin Yi', 'Wong Jia Hui', 'Chong Pei Shan', 'Lee Shu Min', 'Ng Hui Wen',
  'Priya Subramaniam', 'Kavitha Rajendran', 'Shalini Krishnan', 'Deepa Muniandy', 'Anitha Selvam',
  'Jessica Jimbun', 'Felicia Gading', 'Stephanie Majalap', 'Evelyn Kinabalu', 'Clarissa Entalang',
]

/** n distinct invented full names, none of them in `taken`. */
export function inventNames(n: number, seed: number | string, taken: Iterable<string> = []): string[] {
  const r = rng(seed)
  const used = new Set<string>([...taken].map((x) => x.toLowerCase()))
  const out: string[] = []
  let guard = 0
  while (out.length < n && guard++ < n * 50) {
    const roll = r()
    let name: string
    if (roll < 0.035) name = r.pick(OTHER)
    else if (roll < 0.09) name = `${r.pick(MALE_GIVEN)} ${r.pick(FATHER)}`
    else if (roll < 0.3) name = `${r.pick(GIVEN_A)} ${r.pick(FATHER)}`
    else name = `${r.pick(GIVEN_A)} ${r.pick(GIVEN_B)} ${r.pick(FATHER)}`
    if (/^(\w+) \1\b/.test(name)) continue
    const key = name.toLowerCase()
    if (used.has(key)) continue
    used.add(key)
    out.push(name)
  }
  return out
}

/** 'Nur Aisyah Razak' -> 'aisyah.razak' style mailbox, always @mail.example. */
export function emailFor(name: string, n?: number): string {
  const parts = name
    .toLowerCase()
    .replace(/[^a-z ]/g, '')
    .split(/\s+/)
    .filter((p) => !['nur', 'nurul', 'siti', 'muhammad', 'mohd', 'ahmad', 'wan', 'mat'].includes(p))
  const base = (parts.length >= 2 ? [parts[0], parts[parts.length - 1]] : parts).join('.') || 'pelajar'
  return `${base}${n ? n : ''}@mail.example`
}

/** A Malaysian mobile number in the E.164 form the app stores: +60123456789. */
export function phoneFor(seed: number | string): string {
  const r = rng('phone' + seed)
  const prefix = r.pick(['12', '13', '14', '16', '17', '18', '19'])
  return `+60${prefix}${r.int(2000000, 9899999)}`
}

/** An invented MyKad-shaped number (YYMMDD-PB-####). Not anybody's. */
export function icFor(seed: number | string, female = true): { ic: string; dob: string } {
  const r = rng('ic' + seed)
  const year = r.int(1996, 2006)
  const month = r.int(1, 12)
  const dd = r.int(1, 28)
  const pb = r.pick(['01', '02', '03', '05', '06', '08', '10', '11', '14'])
  let last = r.int(1000, 9998)
  if ((last % 2 === 0) !== female) last += 1
  return {
    ic: `${String(year).slice(2)}${pad(month)}${pad(dd)}-${pb}-${last}`,
    dob: `${year}-${pad(month)}-${pad(dd)}`,
  }
}

/** 'HA-2026-0318' for 318. */
export const studentNo = (n: number): string => `HA-2026-${String(n).padStart(4, '0')}`
/** 'INV-2026-0412' for 412. */
export const invoiceNo = (n: number): string => `INV-2026-${String(n).padStart(4, '0')}`

/** Initial-cased two-letter monogram, the way the app's avatars fall back. */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('')
}
