import type { jsPDF } from 'jspdf'
import { formatMYR } from '@hawary/shared'
import { fmtDate, personName } from '@/lib/format'
import { translate } from '@/lib/i18n'
import type { AcademyProfile } from '@/features/settings/academy'
import {
  INVOICE_STATUS_LABEL,
  PAYMENT_METHOD_LABEL,
  type InvoiceDetail,
} from './api'

/**
 * Invoice and receipt PDFs.
 *
 * Drawn with jsPDF rather than printed from the DOM: the learner's screen is a
 * responsive React tree with a sidebar and a theme, and coaxing that into an
 * A4 page via `window.print()` produces a different document on every browser.
 * Laying the page out in millimetres gives one deterministic artefact, and
 * `window.print()` is a dialog, not a download — which is what was asked for.
 *
 * jsPDF is loaded with a dynamic `import()` from the two entry points below, so
 * ~150 kB of PDF machinery stays out of the initial bundle and is fetched only
 * when someone actually downloads a document.
 *
 * This is a plain helper, not a component, so it resolves copy with
 * `translate()` (see docs/i18n.md) — it is invoked from a click handler, after
 * the language is known, and never has to re-render.
 */

// --- page geometry (mm, A4 portrait) ----------------------------------------

const PAGE_W = 210
const PAGE_H = 297
const M = 16 // page margin
const RIGHT = PAGE_W - M // right text edge
const CONTENT_W = PAGE_W - M * 2
const BOTTOM = PAGE_H - 22 // last usable baseline before the footer

// Table columns: description flows, the three numeric columns are right-aligned.
const COL_QTY = 122
const COL_UNIT = 150
const COL_AMOUNT = RIGHT
const DESC_W = COL_QTY - M - 16

const INK = 25
const MUTED = 110
const RULE = 205

// --- text -------------------------------------------------------------------

/**
 * The built-in Helvetica is WinAnsi-encoded, so a curly quote or an em dash
 * from user-entered copy would render as garbage. Fold the handful that our own
 * strings and pasted addresses actually contain down to their ASCII twin.
 */
const FOLD: Record<string, string> = {
  '‘': "'",
  '’': "'",
  '‚': ',',
  '“': '"',
  '”': '"',
  '–': '-',
  '—': '-',
  '…': '...',
  '•': '-',
  ' ': ' ',
}

function pdfText(value: unknown): string {
  return String(value ?? '').replace(
    /[‘’‚“”–—…• ]/g,
    (c) => FOLD[c] ?? c,
  )
}

/** `formatMYR` emits a non-breaking space; fold it before it reaches the page. */
const money = (sen: number) => pdfText(formatMYR(sen))

// --- logo -------------------------------------------------------------------

type Logo = {
  dataUrl: string
  format: 'PNG' | 'JPEG' | 'WEBP'
  width: number
  height: number
}

const LOGO_FORMAT: Record<string, Logo['format']> = {
  'image/png': 'PNG',
  'image/jpeg': 'JPEG',
  'image/jpg': 'JPEG',
  'image/webp': 'WEBP',
}

/**
 * Fetch the academy logo and measure it. Every failure path returns null and
 * the document simply prints without a logo — a missing image must never be
 * the reason a student cannot download their invoice. SVG is excluded because
 * jsPDF cannot rasterise it.
 */
async function loadLogo(url: string | null | undefined): Promise<Logo | null> {
  if (!url) return null
  try {
    const res = await fetch(url, { mode: 'cors' })
    if (!res.ok) return null
    const blob = await res.blob()
    const format = LOGO_FORMAT[blob.type]
    if (!format) return null
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })
    const { width, height } = await new Promise<{
      width: number
      height: number
    }>((resolve, reject) => {
      const img = new Image()
      img.onload = () =>
        resolve({ width: img.naturalWidth, height: img.naturalHeight })
      img.onerror = () => reject(new Error('logo decode failed'))
      img.src = dataUrl
    })
    if (!width || !height) return null
    return { dataUrl, format, width, height }
  } catch {
    return null
  }
}

// --- drawing primitives -----------------------------------------------------

type Weight = 'normal' | 'bold'

function font(doc: jsPDF, size: number, weight: Weight = 'normal', ink = INK) {
  doc.setFont('helvetica', weight)
  doc.setFontSize(size)
  doc.setTextColor(ink)
}

function rule(doc: jsPDF, y: number, from = M, to = RIGHT) {
  doc.setDrawColor(RULE)
  doc.setLineWidth(0.2)
  doc.line(from, y, to, y)
}

/** Wrap on the page's own metrics, and honour newlines the admin typed. */
function wrap(doc: jsPDF, value: string, width: number): string[] {
  return doc.splitTextToSize(pdfText(value), width) as string[]
}

// --- header -----------------------------------------------------------------

type Letterhead = Pick<
  AcademyProfile,
  'name' | 'logo_url' | 'address' | 'phone' | 'sst_number'
>

function drawLetterhead(
  doc: jsPDF,
  academy: Letterhead | null,
  logo: Logo | null,
  title: string,
  invoice: InvoiceDetail,
): number {
  const top = M
  let textX = M
  let logoBottom = top

  if (logo) {
    // Fit inside the box without distorting: whichever axis binds first wins.
    const scale = Math.min(38 / logo.width, 20 / logo.height)
    const w = logo.width * scale
    const h = logo.height * scale
    doc.addImage(logo.dataUrl, logo.format, M, top, w, h)
    textX = M + w + 6
    logoBottom = top + h
  }

  // Right block first — it fixes how much width the academy block may claim.
  font(doc, 20, 'bold')
  doc.text(title, RIGHT, top + 7, { align: 'right' })
  font(doc, 10, 'bold')
  doc.text(pdfText(invoice.invoice_no), RIGHT, top + 13, { align: 'right' })
  font(doc, 9, 'normal', MUTED)
  doc.text(
    pdfText(translate(INVOICE_STATUS_LABEL[invoice.status])),
    RIGHT,
    top + 18,
    { align: 'right' },
  )

  const blockW = Math.max(60, 124 - textX)
  let y = top + 5

  if (academy?.name) {
    font(doc, 14, 'bold')
    for (const line of wrap(doc, academy.name, blockW)) {
      doc.text(line, textX, y)
      y += 6
    }
    y += 0.5
  }

  font(doc, 9, 'normal', MUTED)
  const lines: string[] = []
  if (academy?.address) lines.push(...academy.address.split('\n'))
  if (academy?.phone)
    lines.push(`${translate('doc.tel')}: ${academy.phone}`)
  if (academy?.sst_number)
    lines.push(`${translate('doc.sst_no')}: ${academy.sst_number}`)

  for (const raw of lines) {
    if (!raw.trim()) continue
    for (const line of wrap(doc, raw, blockW)) {
      doc.text(line, textX, y)
      y += 4
    }
  }

  const bottom = Math.max(y, logoBottom, top + 22) + 5
  rule(doc, bottom)
  return bottom + 7
}

// --- parties ----------------------------------------------------------------

function drawParties(
  doc: jsPDF,
  invoice: InvoiceDetail,
  y: number,
  meta: Array<[string, string]>,
): number {
  const student = invoice.student
  font(doc, 8, 'bold', MUTED)
  doc.text(pdfText(translate('doc.bill_to')).toUpperCase(), M, y)

  // A record can legitimately have no name — the invite dialog asks only for an
  // email — and a bill addressed to "Unnamed" identifies nobody, which on a
  // document that outlives the screen is worse than blank. An address at least
  // says who owes what. It must then not print twice in the block below.
  const billTo = personName(student?.full_name, student?.email)
  font(doc, 10, 'bold')
  let ly = y + 5
  doc.text(pdfText(billTo ?? translate('common.unnamed')), M, ly)
  ly += 4.5

  font(doc, 9, 'normal', MUTED)
  // Postal block first (organization, then address as typed), then the
  // identifiers. Both are optional on a student record — a line only exists
  // when there is something to print.
  const details: string[] = []
  if (student?.organization) details.push(student.organization)
  if (student?.address) details.push(...student.address.split('\n'))
  if (student?.student_no)
    details.push(`${translate('doc.student_no')}: ${student.student_no}`)
  if (student?.email && student.email.trim() !== billTo)
    details.push(student.email)
  if (invoice.course?.title)
    details.push(`${translate('doc.course')}: ${invoice.course.title}`)
  for (const raw of details) {
    if (!raw.trim()) continue
    for (const line of wrap(doc, raw, 90)) {
      doc.text(line, M, ly)
      ly += 4
    }
  }

  // Right column: label/value pairs, both right-aligned against the same edge.
  let ry = y
  for (const [label, value] of meta) {
    font(doc, 9, 'normal', MUTED)
    doc.text(pdfText(label), COL_UNIT, ry, { align: 'right' })
    font(doc, 9, 'bold')
    doc.text(pdfText(value), RIGHT, ry, { align: 'right' })
    ry += 5
  }

  return Math.max(ly, ry) + 5
}

// --- tables -----------------------------------------------------------------

type Column = { x: number; label: string; align: 'left' | 'right' }

function drawTableHead(doc: jsPDF, y: number, columns: Column[]): number {
  doc.setFillColor(244, 244, 245)
  doc.rect(M - 2, y - 4.5, CONTENT_W + 4, 7, 'F')
  font(doc, 8, 'bold', 80)
  for (const col of columns) {
    doc.text(pdfText(col.label).toUpperCase(), col.x, y, {
      align: col.align === 'right' ? 'right' : undefined,
    })
  }
  return y + 7
}

/** Start a fresh page and repeat the table head, so a long invoice still reads. */
function pageBreak(doc: jsPDF, columns: Column[]): number {
  doc.addPage()
  return drawTableHead(doc, M + 6, columns)
}

function drawItems(doc: jsPDF, invoice: InvoiceDetail, y: number): number {
  const columns: Column[] = [
    { x: M, label: translate('common.description'), align: 'left' },
    { x: COL_QTY, label: translate('doc.col.qty'), align: 'right' },
    { x: COL_UNIT, label: translate('doc.col.unit_price'), align: 'right' },
    { x: COL_AMOUNT, label: translate('common.amount'), align: 'right' },
  ]
  let cursor = drawTableHead(doc, y, columns)

  if (invoice.items.length === 0) {
    font(doc, 9, 'normal', MUTED)
    doc.text(pdfText(translate('doc.no_items')), M, cursor)
    return cursor + 6
  }

  for (const item of invoice.items) {
    font(doc, 9.5, 'normal')
    const lines = wrap(doc, item.description, DESC_W)
    const height = Math.max(lines.length * 4.5, 6)
    if (cursor + height > BOTTOM) cursor = pageBreak(doc, columns)

    lines.forEach((line, i) => doc.text(line, M, cursor + i * 4.5))
    doc.text(String(item.quantity), COL_QTY, cursor, { align: 'right' })
    doc.text(money(item.unit_price_sen), COL_UNIT, cursor, { align: 'right' })
    doc.text(money(item.amount_sen), COL_AMOUNT, cursor, { align: 'right' })

    cursor += height + 1.5
    rule(doc, cursor - 3.5)
  }

  return cursor + 3
}

function drawPayments(doc: jsPDF, invoice: InvoiceDetail, y: number): number {
  const columns: Column[] = [
    { x: M, label: translate('doc.col.date'), align: 'left' },
    { x: COL_UNIT, label: translate('doc.col.method'), align: 'right' },
    { x: COL_AMOUNT, label: translate('common.amount'), align: 'right' },
  ]

  font(doc, 10, 'bold')
  doc.text(pdfText(translate('doc.payments_received')), M, y)
  let cursor = drawTableHead(doc, y + 7, columns)

  const received = invoice.payments.filter((p) => p.status === 'succeeded')
  if (received.length === 0) {
    font(doc, 9, 'normal', MUTED)
    doc.text(pdfText(translate('doc.no_payments')), M, cursor)
    return cursor + 6
  }

  for (const payment of received) {
    if (cursor + 6 > BOTTOM) cursor = pageBreak(doc, columns)
    font(doc, 9.5, 'normal')
    doc.text(pdfText(fmtDate(payment.paid_at ?? payment.created_at)), M, cursor)
    doc.text(
      pdfText(translate(PAYMENT_METHOD_LABEL[payment.method])),
      COL_UNIT,
      cursor,
      { align: 'right' },
    )
    doc.text(money(payment.amount_sen), COL_AMOUNT, cursor, { align: 'right' })
    cursor += 6
    rule(doc, cursor - 3.5)
  }

  return cursor + 3
}

// --- totals -----------------------------------------------------------------

type TotalRow = { label: string; value: string; strong?: boolean }

function drawTotals(doc: jsPDF, y: number, rows: TotalRow[]): number {
  let cursor = y
  const height = rows.length * 6 + 4
  if (cursor + height > BOTTOM) {
    doc.addPage()
    cursor = M + 6
  }

  for (const row of rows) {
    if (row.strong) {
      rule(doc, cursor - 4.5, COL_UNIT - 34, RIGHT)
      cursor += 1
    }
    font(doc, row.strong ? 10.5 : 9.5, row.strong ? 'bold' : 'normal', row.strong ? INK : MUTED)
    doc.text(pdfText(row.label), COL_UNIT, cursor, { align: 'right' })
    font(doc, row.strong ? 10.5 : 9.5, row.strong ? 'bold' : 'normal')
    doc.text(pdfText(row.value), RIGHT, cursor, { align: 'right' })
    cursor += 6
  }
  return cursor + 2
}

// --- footer -----------------------------------------------------------------

function drawNotes(doc: jsPDF, notes: string | null, y: number): number {
  if (!notes?.trim()) return y
  let cursor = y + 2
  font(doc, 8, 'bold', MUTED)
  doc.text(pdfText(translate('doc.notes')).toUpperCase(), M, cursor)
  cursor += 5
  font(doc, 9, 'normal', MUTED)
  for (const line of wrap(doc, notes, CONTENT_W)) {
    if (cursor > BOTTOM) {
      doc.addPage()
      cursor = M + 6
    }
    doc.text(line, M, cursor)
    cursor += 4.2
  }
  return cursor + 2
}

/** Run last: the page count is only known once every page exists. */
function drawFooters(doc: jsPDF) {
  const pages = doc.getNumberOfPages()
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page)
    font(doc, 8, 'normal', 140)
    doc.text(pdfText(translate('doc.footer')), M, PAGE_H - 12)
    if (pages > 1) {
      doc.text(
        pdfText(translate('doc.page', { page: String(page), pages: String(pages) })),
        RIGHT,
        PAGE_H - 12,
        { align: 'right' },
      )
    }
  }
}

// --- entry points -----------------------------------------------------------

export type DocumentInput = {
  invoice: InvoiceDetail
  academy: Letterhead | null
}

/**
 * A finished document that has not yet been handed anywhere.
 *
 * Building and delivering are separate steps because the same drawing serves
 * two destinations: the learner's download, and the on-screen preview in
 * Settings, which needs the bytes rather than a file on disk.
 */
export type BuiltDocument = { doc: jsPDF; fileName: string }

/** `INV-ABC123-invoice.pdf` — safe on every filesystem. */
function fileName(invoiceNo: string, suffix: string) {
  const base = invoiceNo.replace(/[^A-Za-z0-9._-]+/g, '-') || 'invoice'
  return `${base}-${suffix}.pdf`
}

async function newDoc(academy: Letterhead | null, title: string) {
  const [{ jsPDF: JsPDF }, logo] = await Promise.all([
    import('jspdf'),
    loadLogo(academy?.logo_url),
  ])
  const doc = new JsPDF({ unit: 'mm', format: 'a4', compress: true })
  doc.setProperties({ title, creator: academy?.name ?? 'Hawary LMS' })
  return { doc, logo }
}

export async function buildInvoicePdf({
  invoice,
  academy,
}: DocumentInput): Promise<BuiltDocument> {
  const title = translate('doc.invoice.title')
  const { doc, logo } = await newDoc(academy, `${title} ${invoice.invoice_no}`)

  let y = drawLetterhead(doc, academy, logo, title, invoice)
  y = drawParties(doc, invoice, y, [
    [translate('doc.issued'), fmtDate(invoice.issued_at ?? invoice.created_at)],
    [translate('doc.due'), fmtDate(invoice.due_at)],
  ])
  y = drawItems(doc, invoice, y)

  const balance = Math.max(0, invoice.total_sen - invoice.amount_paid_sen)
  y = drawTotals(doc, y + 2, [
    { label: translate('doc.subtotal'), value: money(invoice.subtotal_sen) },
    { label: translate('doc.tax'), value: money(invoice.tax_sen) },
    { label: translate('common.total'), value: money(invoice.total_sen), strong: true },
    { label: translate('doc.paid'), value: money(invoice.amount_paid_sen) },
    { label: translate('doc.balance'), value: money(balance), strong: true },
  ])
  drawNotes(doc, invoice.notes, y)
  drawFooters(doc)
  return {
    doc,
    fileName: fileName(invoice.invoice_no, translate('doc.file.invoice')),
  }
}

export async function buildReceiptPdf({
  invoice,
  academy,
}: DocumentInput): Promise<BuiltDocument> {
  const title = translate('doc.receipt.title')
  const { doc, logo } = await newDoc(academy, `${title} ${invoice.invoice_no}`)

  const received = invoice.payments.filter((p) => p.status === 'succeeded')
  // The receipt is dated by the money, not by the invoice: its date is the last
  // payment that actually landed.
  const lastPaidAt = received.reduce<string | null>((latest, p) => {
    const at = p.paid_at ?? p.created_at
    return !latest || at > latest ? at : latest
  }, null)

  let y = drawLetterhead(doc, academy, logo, title, invoice)
  y = drawParties(doc, invoice, y, [
    [translate('doc.receipt_date'), fmtDate(lastPaidAt)],
    [translate('doc.invoice_no'), invoice.invoice_no],
  ])
  y = drawItems(doc, invoice, y)

  const balance = Math.max(0, invoice.total_sen - invoice.amount_paid_sen)
  y = drawTotals(doc, y + 2, [
    { label: translate('doc.subtotal'), value: money(invoice.subtotal_sen) },
    { label: translate('doc.tax'), value: money(invoice.tax_sen) },
    { label: translate('common.total'), value: money(invoice.total_sen), strong: true },
  ])
  y = drawPayments(doc, invoice, y + 4)
  y = drawTotals(doc, y + 2, [
    {
      label: translate('doc.amount_received'),
      value: money(invoice.amount_paid_sen),
      strong: true,
    },
    { label: translate('doc.balance'), value: money(balance) },
  ])
  drawNotes(doc, invoice.notes, y)
  drawFooters(doc)
  return {
    doc,
    fileName: fileName(invoice.invoice_no, translate('doc.file.receipt')),
  }
}

// --- delivery ---------------------------------------------------------------

export async function downloadInvoicePdf(input: DocumentInput) {
  const { doc, fileName: name } = await buildInvoicePdf(input)
  doc.save(name)
}

export async function downloadReceiptPdf(input: DocumentInput) {
  const { doc, fileName: name } = await buildReceiptPdf(input)
  doc.save(name)
}
