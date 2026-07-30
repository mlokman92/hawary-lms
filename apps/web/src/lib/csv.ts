/**
 * A CSV reader/writer, hand-rolled rather than a dependency.
 *
 * What actually arrives here is a spreadsheet export, so the awkward parts are
 * the ones Excel produces: a UTF-8 BOM, CRLF, quoted fields containing commas
 * or newlines, `""` as an escaped quote, and — on a machine whose locale uses a
 * comma for decimals — a semicolon delimiter. All of that is a page of code;
 * papaparse would be 45 kB for the same result.
 */

/** Delimiters we will consider, in priority order. */
const DELIMITERS = [',', ';', '\t'] as const

/**
 * Guess the delimiter from the first line: whichever candidate appears most
 * often *outside* quotes wins, and a comma wins a tie. A one-column file has no
 * delimiter at all, and any answer is then equivalent.
 */
function sniffDelimiter(text: string): string {
  const firstLine = text.slice(0, text.search(/\r?\n/) + 1 || undefined)
  let best = ','
  let bestCount = 0
  for (const d of DELIMITERS) {
    let count = 0
    let quoted = false
    for (let i = 0; i < firstLine.length; i++) {
      const ch = firstLine[i]
      if (ch === '"') quoted = !quoted
      else if (ch === d && !quoted) count++
    }
    if (count > bestCount) {
      best = d
      bestCount = count
    }
  }
  return best
}

/**
 * Parse CSV text into rows of raw cells. Blank lines are dropped — a trailing
 * newline is the norm, and an empty row is never meaningful input here.
 */
export function parseCsv(text: string): string[][] {
  // Strip the BOM: left in place it becomes part of the first header name, and
  // "﻿full_name" matches nothing.
  const input = text.replace(/^﻿/, '')
  const delimiter = sniffDelimiter(input)

  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]

    if (quoted) {
      if (ch === '"') {
        // A doubled quote is a literal quote; a lone one ends the field.
        if (input[i + 1] === '"') {
          field += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        field += ch
      }
      continue
    }

    if (ch === '"' && field === '') {
      quoted = true
    } else if (ch === delimiter) {
      row.push(field)
      field = ''
    } else if (ch === '\r') {
      // Swallow; the \n that follows ends the row.
    } else if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += ch
    }
  }

  // Whatever is buffered when the text runs out is the last row.
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows.filter((r) => r.some((cell) => cell.trim() !== ''))
}

/** Quote a cell only when it needs it, so a plain file stays readable. */
function quoteCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/**
 * Serialise rows back to CSV. The BOM is deliberate: without it Excel opens a
 * UTF-8 file as the system codepage and mangles every name with an accent.
 */
export function toCsv(rows: (string | null | undefined)[][]): string {
  const body = rows
    .map((row) => row.map((cell) => quoteCell(cell ?? '')).join(','))
    .join('\r\n')
  return `﻿${body}\r\n`
}

/** Hand the user a generated file without a round trip to the server. */
export function downloadCsv(filename: string, rows: (string | null | undefined)[][]) {
  const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
