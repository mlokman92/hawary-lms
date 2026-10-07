import { useState } from 'react'
import { Platform } from 'react-native'
import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'
import { formatMYR } from '@hawary/shared'
import { fmtDate } from '@/lib/format'
import { translate } from '@/lib/i18n'
import { errorMessage } from '@/lib/errors'
import {
  fetchAcademyProfile,
  type AcademyProfile,
} from '@/features/settings/academy'
import {
  fetchInvoiceDetail,
  PAYMENT_METHOD_LABEL,
  type Invoice,
  type InvoiceDetail,
} from './api'

/**
 * Invoice and receipt PDFs on a phone.
 *
 * The web app draws these with jsPDF (`apps/web/src/features/payments/pdf.ts`).
 * Here the same content is laid out as HTML and handed to the platform's own
 * PDF renderer, then to the share sheet — which is what "download" means on a
 * phone: save to Files, send on WhatsApp, print.
 *
 * Same blocks, same order, same `doc.*` strings as the web documents, so the
 * two read as one document. Keep them in step when either changes.
 */
export type DocumentKind = 'invoice' | 'receipt'

/** A receipt acknowledges money; an unpaid invoice has none to acknowledge. */
export function hasReceipt(invoice: Pick<Invoice, 'amount_paid_sen'>): boolean {
  return invoice.amount_paid_sen > 0
}

const esc = (v: string | null | undefined): string =>
  (v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const lines = (v: string | null | undefined): string =>
  esc(v).replace(/\n/g, '<br/>')

function documentHtml(
  kind: DocumentKind,
  invoice: InvoiceDetail,
  academy: AcademyProfile | null,
): string {
  const t = translate
  const paid = invoice.payments.filter((p) => p.status === 'succeeded')
  const lastPaid = paid
    .map((p) => p.paid_at ?? p.created_at)
    .sort()
    .at(-1)
  const balance = invoice.total_sen - invoice.amount_paid_sen
  const studentName =
    invoice.student?.full_name || invoice.student?.email || ''

  const meta: [string, string][] =
    kind === 'invoice'
      ? [
          [t('doc.invoice_no'), invoice.invoice_no],
          [t('doc.issued'), fmtDate(invoice.issued_at ?? invoice.created_at)],
          [t('doc.due'), fmtDate(invoice.due_at)],
        ]
      : [
          [t('doc.invoice_no'), invoice.invoice_no],
          [t('doc.receipt_date'), fmtDate(lastPaid ?? invoice.updated_at)],
        ]

  const items =
    invoice.items.length === 0
      ? `<tr><td colspan="4" class="muted">${esc(t('doc.no_items'))}</td></tr>`
      : invoice.items
          .map(
            (it) => `<tr>
              <td>${esc(it.description)}</td>
              <td class="num">${it.quantity}</td>
              <td class="num">${esc(formatMYR(it.unit_price_sen))}</td>
              <td class="num">${esc(formatMYR(it.amount_sen))}</td>
            </tr>`,
          )
          .join('')

  const totals: [string, string, boolean][] = [
    [t('doc.subtotal'), formatMYR(invoice.subtotal_sen), false],
    [t('doc.tax'), formatMYR(invoice.tax_sen), false],
    [t('common.total'), formatMYR(invoice.total_sen), true],
    [t('doc.paid'), formatMYR(invoice.amount_paid_sen), false],
    kind === 'invoice'
      ? [t('doc.balance'), formatMYR(balance), true]
      : [t('doc.amount_received'), formatMYR(invoice.amount_paid_sen), true],
  ]

  const payments =
    kind === 'receipt'
      ? `<h3>${esc(t('doc.payments_received'))}</h3>
         <table>
           <thead><tr>
             <th>${esc(t('doc.col.date'))}</th>
             <th>${esc(t('doc.col.method'))}</th>
             <th class="num">${esc(t('common.amount'))}</th>
           </tr></thead>
           <tbody>${
             paid.length === 0
               ? `<tr><td colspan="3" class="muted">${esc(t('doc.no_payments'))}</td></tr>`
               : paid
                   .map(
                     (p) => `<tr>
                       <td>${esc(fmtDate(p.paid_at ?? p.created_at))}</td>
                       <td>${esc(t(PAYMENT_METHOD_LABEL[p.method]))}</td>
                       <td class="num">${esc(formatMYR(p.amount_sen))}</td>
                     </tr>`,
                   )
                   .join('')
           }</tbody>
         </table>`
      : ''

  return `<!doctype html>
<html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>
  @page { size: A4; margin: 16mm; }
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #111; font-size: 11pt; }
  h1 { font-size: 20pt; margin: 0; letter-spacing: 1px; }
  h3 { font-size: 11pt; margin: 22px 0 6px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; }
  .logo { max-height: 56px; max-width: 160px; margin-bottom: 6px; }
  .muted { color: #666; }
  .small { font-size: 9.5pt; }
  .right { text-align: right; }
  .grid { display: flex; justify-content: space-between; margin-top: 22px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th { text-align: left; font-size: 9.5pt; color: #666; border-bottom: 1px solid #ccc; padding: 6px 4px; }
  td { padding: 7px 4px; border-bottom: 1px solid #eee; vertical-align: top; }
  .num { text-align: right; white-space: nowrap; }
  .totals { width: 46%; margin-left: 54%; margin-top: 10px; }
  .totals td { border: 0; padding: 3px 4px; }
  .strong td { font-weight: 700; border-top: 1px solid #ccc; }
  .foot { margin-top: 36px; font-size: 9pt; color: #777; text-align: center; }
</style></head>
<body>
  <div class="head">
    <div>
      ${academy?.logo_url ? `<img class="logo" src="${esc(academy.logo_url)}"/><br/>` : ''}
      <strong>${esc(academy?.name)}</strong>
      <div class="small muted">
        ${academy?.address ? `${lines(academy.address)}<br/>` : ''}
        ${academy?.phone ? `${esc(t('doc.tel'))}: ${esc(academy.phone)}<br/>` : ''}
        ${academy?.sst_number ? `${esc(t('doc.sst_no'))}: ${esc(academy.sst_number)}` : ''}
      </div>
    </div>
    <div class="right">
      <h1>${esc(t(kind === 'invoice' ? 'doc.invoice.title' : 'doc.receipt.title'))}</h1>
      <div class="small">
        ${meta.map(([k, v]) => `<span class="muted">${esc(k)}:</span> ${esc(v)}`).join('<br/>')}
      </div>
    </div>
  </div>

  <div class="grid">
    <div>
      <div class="small muted">${esc(t('doc.bill_to'))}</div>
      <strong>${esc(studentName)}</strong>
      <div class="small">
        ${invoice.student?.organization ? `${esc(invoice.student.organization)}<br/>` : ''}
        ${invoice.student?.address ? `${lines(invoice.student.address)}<br/>` : ''}
        ${invoice.student?.student_no ? `${esc(t('doc.student_no'))}: ${esc(invoice.student.student_no)}<br/>` : ''}
        ${invoice.student?.email ? `${esc(invoice.student.email)}<br/>` : ''}
        ${invoice.course ? `${esc(t('doc.course'))}: ${esc(invoice.course.title)}` : ''}
      </div>
    </div>
  </div>

  <table>
    <thead><tr>
      <th>${esc(t('common.description'))}</th>
      <th class="num">${esc(t('doc.col.qty'))}</th>
      <th class="num">${esc(t('doc.col.unit_price'))}</th>
      <th class="num">${esc(t('common.amount'))}</th>
    </tr></thead>
    <tbody>${items}</tbody>
  </table>

  <table class="totals">
    ${totals
      .map(
        ([k, v, strong]) =>
          `<tr class="${strong ? 'strong' : ''}"><td>${esc(k)}</td><td class="num">${esc(v)}</td></tr>`,
      )
      .join('')}
  </table>

  ${payments}

  ${invoice.notes ? `<h3>${esc(t('doc.notes'))}</h3><div class="small">${lines(invoice.notes)}</div>` : ''}

  <div class="foot">${esc(t('doc.footer'))}</div>
</body></html>`
}

/** Build the PDF and open the share sheet on it. */
export async function shareInvoiceDocument(
  kind: DocumentKind,
  invoice: InvoiceDetail,
  academyId: string,
): Promise<void> {
  const academy = await fetchAcademyProfile(academyId)
  // The web preview cannot write a file to share; the browser's print dialog
  // ("Save as PDF") is the same document by another route.
  if (Platform.OS === 'web') {
    await Print.printAsync({ html: documentHtml(kind, invoice, academy) })
    return
  }
  const { uri } = await Print.printToFileAsync({
    html: documentHtml(kind, invoice, academy),
    // A4 at 72 PPI.
    width: 595,
    height: 842,
  })
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error(translate('doc.error.failed'))
  }
  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: `${invoice.invoice_no} ${translate(
      kind === 'invoice' ? 'doc.file.invoice' : 'doc.file.receipt',
    )}`,
  })
}

/**
 * The buttons' state. Takes an invoice id OR an already-loaded detail: a list
 * row has only the header, so items and payments are fetched on tap — a list
 * of thirty invoices should not fetch thirty item sets to draw three columns.
 */
export function useInvoiceDocuments(academyId: string | null) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function share(kind: DocumentKind, source: InvoiceDetail | string) {
    if (!academyId) return
    const id = typeof source === 'string' ? source : source.id
    setBusy(`${kind}:${id}`)
    setError(null)
    try {
      const detail =
        typeof source === 'string' ? await fetchInvoiceDetail(source) : source
      await shareInvoiceDocument(kind, detail, academyId)
    } catch (e) {
      setError(errorMessage(e, translate('doc.error.failed')))
    } finally {
      setBusy(null)
    }
  }

  return { busy, error, share }
}
