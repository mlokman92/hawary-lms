import type { TKey } from '@/lib/i18n'
import { parseCsv } from '@/lib/csv'

/**
 * Spec-driven CSV import, shared by students and instructors.
 *
 * The two record types differ only in which columns they accept, so the parsing,
 * validation, duplicate detection and the whole dialog are written once and the
 * feature supplies a list of fields. Values are carried as `string | null`
 * because every destination column is text, a date string or an enum — nothing
 * needs a number, and keeping one type keeps the payload assembly honest.
 */

export type CellResult =
  | { ok: true; value: string | null }
  | { ok: false; messageKey: TKey }

export type ImportField = {
  /** Destination column on the table. */
  key: string
  /** Canonical header, written into the template. */
  column: string
  labelKey: TKey
  required?: boolean
  /**
   * Extra headers accepted for this field — the Malay column names, and the
   * spellings a spreadsheet tends to grow ("phone number", "no telefon").
   * Matched loosely; see `normaliseHeader`.
   */
  aliases?: string[]
  /** Omitted means "trim it and take it". */
  parse?: (raw: string) => CellResult
  /** Example written into the template's sample row. */
  sample?: string
}

export type ImportSpec = {
  fields: ImportField[]
  /**
   * Columns that identify a person. A row matching an existing record on any of
   * them is flagged rather than rejected: an academy legitimately has two
   * students with the same name, but almost never two with the same IC.
   */
  dedupeKeys: string[]
  /** File name offered by the template download. */
  templateName: string
}

export type RowIssue = { column: string; messageKey: TKey }

export type ParsedRow = {
  /** 1-based line in the file, header included — what the user sees in Excel. */
  line: number
  values: Record<string, string | null>
  issues: RowIssue[]
  /** Matches a record already in the academy, or an earlier row in this file. */
  duplicate: 'existing' | 'file' | null
}

export type ParseResult = {
  rows: ParsedRow[]
  /** Headers present in the file that no field claims — ignored, but reported. */
  unknownColumns: string[]
  /** Required fields with no matching column at all: the file is unusable. */
  missingColumns: ImportField[]
  /** True when the file had a header row but nothing under it. */
  empty: boolean
}

/**
 * Header matching is deliberately forgiving: case, spaces, underscores, hyphens
 * and a trailing `*` (people mark required columns that way) are all noise.
 */
function normaliseHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/\*+$/, '')
    .replace(/[\s_-]+/g, '')
}

function matchField(header: string, fields: ImportField[]): ImportField | null {
  const wanted = normaliseHeader(header)
  if (!wanted) return null
  return (
    fields.find((f) =>
      [f.column, f.key, ...(f.aliases ?? [])].some(
        (candidate) => normaliseHeader(candidate) === wanted,
      ),
    ) ?? null
  )
}

// ---------------------------------------------------------------------------
// Cell parsers
// ---------------------------------------------------------------------------

export function plainText(raw: string): CellResult {
  const value = raw.trim()
  return { ok: true, value: value || null }
}

/**
 * Accepts what people actually type: the enum values, English and Malay words,
 * and the single letters used on forms (L = lelaki, P = perempuan).
 */
export function parseGender(raw: string): CellResult {
  const value = raw.trim().toLowerCase()
  if (!value) return { ok: true, value: null }
  if (['male', 'm', 'l', 'lelaki'].includes(value)) return { ok: true, value: 'male' }
  if (['female', 'f', 'p', 'perempuan'].includes(value))
    return { ok: true, value: 'female' }
  return { ok: false, messageKey: 'import.error.gender' }
}

/**
 * ISO first, then the day-first formats a Malaysian spreadsheet produces. The
 * round-trip check rejects a date that overflowed (31/02) instead of letting
 * Postgres reject the whole batch later.
 */
export function parseDate(raw: string): CellResult {
  const value = raw.trim()
  if (!value) return { ok: true, value: null }

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value)
  const dayFirst = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(value)
  if (!iso && !dayFirst) return { ok: false, messageKey: 'import.error.date' }

  const year = Number(iso ? iso[1] : dayFirst![3])
  const month = Number(iso ? iso[2] : dayFirst![2])
  const day = Number(iso ? iso[3] : dayFirst![1])

  const date = new Date(Date.UTC(year, month - 1, day))
  const real =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  if (!real) return { ok: false, messageKey: 'import.error.date' }

  const pad = (n: number) => String(n).padStart(2, '0')
  return { ok: true, value: `${year}-${pad(month)}-${pad(day)}` }
}

/**
 * A shape check, not a deliverability check. It exists to catch the pasted
 * "n/a" and the name that landed in the email column, not to be RFC 5322.
 */
export function parseEmail(raw: string): CellResult {
  const value = raw.trim()
  if (!value) return { ok: true, value: null }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
    return { ok: false, messageKey: 'import.error.email' }
  return { ok: true, value: value.toLowerCase() }
}

/** Enum column: the stored values, with spaces tolerated for `on_leave`. */
export function parseEnum(allowed: readonly string[], messageKey: TKey) {
  return (raw: string): CellResult => {
    const value = raw.trim().toLowerCase().replace(/[\s-]+/g, '_')
    if (!value) return { ok: true, value: null }
    return allowed.includes(value)
      ? { ok: true, value }
      : { ok: false, messageKey }
  }
}

// ---------------------------------------------------------------------------
// Parsing a file
// ---------------------------------------------------------------------------

/**
 * Lowercased dedupe signatures for one record — one per key it actually
 * carries. Takes `unknown` values so the existing rows can be passed straight
 * from the list query, columns like `enrollments` and all: anything that is not
 * a non-empty string simply contributes no signature.
 */
function dedupeSignatures(
  values: Record<string, unknown>,
  keys: string[],
): string[] {
  return keys
    .map((k) => {
      const v = values[k]
      return typeof v === 'string' && v.trim()
        ? `${k}:${v.trim().toLowerCase()}`
        : null
    })
    .filter((v): v is string => !!v)
}

export function parseImport(
  spec: ImportSpec,
  text: string,
  existing: Record<string, unknown>[],
): ParseResult {
  const table = parseCsv(text)
  if (table.length === 0) {
    return { rows: [], unknownColumns: [], missingColumns: [], empty: true }
  }

  const [header, ...body] = table
  const mapped = header.map((h) => matchField(h, spec.fields))
  const unknownColumns = header.filter((h, i) => !mapped[i] && h.trim() !== '')
  const claimed = new Set(mapped.filter(Boolean).map((f) => f!.key))
  const missingColumns = spec.fields.filter(
    (f) => f.required && !claimed.has(f.key),
  )

  const seenInFile = new Set<string>()
  const seenExisting = new Set(
    existing.flatMap((row) => dedupeSignatures(row, spec.dedupeKeys)),
  )

  const rows: ParsedRow[] = body.map((cells, index) => {
    const values: Record<string, string | null> = {}
    const issues: RowIssue[] = []

    mapped.forEach((field, column) => {
      if (!field) return
      const raw = cells[column] ?? ''
      const result = (field.parse ?? plainText)(raw)
      if (result.ok) {
        values[field.key] = result.value
      } else {
        values[field.key] = null
        issues.push({ column: field.column, messageKey: result.messageKey })
      }
    })

    for (const field of spec.fields) {
      if (field.required && !values[field.key]) {
        issues.push({ column: field.column, messageKey: 'import.error.required' })
      }
    }

    const signatures = dedupeSignatures(values, spec.dedupeKeys)
    let duplicate: ParsedRow['duplicate'] = null
    if (signatures.some((s) => seenExisting.has(s))) duplicate = 'existing'
    else if (signatures.some((s) => seenInFile.has(s))) duplicate = 'file'
    signatures.forEach((s) => seenInFile.add(s))

    // +2: the header is line 1, and the body is 0-indexed.
    return { line: index + 2, values, issues, duplicate }
  })

  return { rows, unknownColumns, missingColumns, empty: rows.length === 0 }
}

/** Header row + one filled example, so the shape is obvious before typing. */
export function templateRows(spec: ImportSpec): string[][] {
  return [
    spec.fields.map((f) => (f.required ? `${f.column}*` : f.column)),
    spec.fields.map((f) => f.sample ?? ''),
  ]
}
