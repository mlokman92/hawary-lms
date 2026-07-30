import { useCallback, useState } from 'react'
import { translate } from '@/lib/i18n'
import { fetchAcademyProfile } from '@/features/settings/academy'
import { fetchInvoiceDetail, type Invoice, type InvoiceDetail } from './api'
import { downloadInvoicePdf, downloadReceiptPdf } from './pdf'

export type DocumentKind = 'invoice' | 'receipt'

/**
 * A receipt is a record of money received, so there has to be some. A draft or
 * an unpaid invoice has nothing to acknowledge.
 */
export function hasReceipt(invoice: Pick<Invoice, 'amount_paid_sen'>): boolean {
  return invoice.amount_paid_sen > 0
}

/**
 * Download an invoice or receipt PDF.
 *
 * The list page holds only the invoice header, so both the line items and the
 * academy letterhead are fetched on click rather than for every visible row —
 * a billing list with thirty invoices should not fetch thirty item sets to
 * render five columns. Both reads resolve under the caller's own RLS
 * (`invoices` → `app.owns_student`, `academies` → `app.is_member`), so a
 * learner gets exactly their own documents with no new grants.
 */
export function useInvoiceDocuments(academyId: string | null) {
  // Keyed by `${kind}:${invoiceId}` so two buttons in one row spin separately.
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const download = useCallback(
    async (kind: DocumentKind, invoice: string | InvoiceDetail) => {
      const invoiceId = typeof invoice === 'string' ? invoice : invoice.id
      setBusy(`${kind}:${invoiceId}`)
      setError(null)
      try {
        const [detail, academy] = await Promise.all([
          typeof invoice === 'string' ? fetchInvoiceDetail(invoice) : invoice,
          academyId ? fetchAcademyProfile(academyId) : Promise.resolve(null),
        ])
        const input = { invoice: detail, academy }
        if (kind === 'receipt') await downloadReceiptPdf(input)
        else await downloadInvoicePdf(input)
      } catch (err) {
        setError(
          err instanceof Error ? err.message : translate('doc.error.failed'),
        )
      } finally {
        setBusy(null)
      }
    },
    [academyId],
  )

  return { download, busy, error, clearError: () => setError(null) }
}
