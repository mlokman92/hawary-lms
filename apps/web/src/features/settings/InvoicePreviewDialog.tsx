import { useEffect, useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  buildInvoicePdf,
  buildReceiptPdf,
  type BuiltDocument,
} from '@/features/payments/pdf'
import type { DocumentKind } from '@/features/payments/documents'
import type { AcademyProfile } from './academy'
import { sampleInvoice } from './sampleInvoice'

type Letterhead = Pick<
  AcademyProfile,
  'name' | 'logo_url' | 'address' | 'phone' | 'sst_number'
>

/**
 * What an invoice and a receipt from this academy actually look like.
 *
 * It draws the real `features/payments/pdf.ts` document against a sample
 * invoice, so what is on screen is the artefact a student would receive — not a
 * mock-up that can drift from it. Nothing is written and nothing is read: the
 * letterhead comes from the form's *current* values, which is the point. An
 * admin can fix a wrapped address or a logo that turned out too tall before
 * saving, and can preview at all on an academy that has never issued an invoice.
 */
export function InvoicePreviewDialog({
  academyId,
  academy,
  open,
  onOpenChange,
}: {
  academyId: string
  academy: Letterhead
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useT()
  const [kind, setKind] = useState<DocumentKind>('invoice')
  const [built, setBuilt] = useState<BuiltDocument | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Depend on the letterhead's *fields*, not the object: the parent builds it
  // inline, so a fresh identity arrives on every render and the document would
  // be redrawn for nothing. The five values are primitives, so this redraws
  // exactly when the page would actually look different — including on a
  // language switch, since `t` changes only then and the document is
  // translated copy.
  const { name, logo_url, address, phone, sst_number } = academy

  useEffect(() => {
    if (!open) return
    let cancelled = false
    let objectUrl: string | null = null

    // Clear first: the cleanup below revokes the previous object URL, so
    // holding on to it across a tab switch would leave the iframe pointed at a
    // URL that no longer resolves.
    setUrl(null)
    setBuilt(null)
    setBusy(true)
    setError(null)
    const build = kind === 'receipt' ? buildReceiptPdf : buildInvoicePdf
    build({
      invoice: sampleInvoice(academyId),
      academy: { name, logo_url, address, phone, sst_number },
    })
      .then((result) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(result.doc.output('blob'))
        setBuilt(result)
        setUrl(objectUrl)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : t('doc.error.failed'))
      })
      .finally(() => {
        if (!cancelled) setBusy(false)
      })

    return () => {
      cancelled = true
      // Object URLs pin the blob in memory until revoked, and this dialog can
      // be reopened and re-tabbed freely.
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [
    open,
    kind,
    academyId,
    name,
    logo_url,
    address,
    phone,
    sst_number,
    t,
  ])

  // Reopen on the invoice, which is what the button says it previews.
  useEffect(() => {
    if (!open) setKind('invoice')
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>{t('settings.preview.title')}</DialogTitle>
          <DialogDescription>{t('settings.preview.description')}</DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
          {/* A segmented control rather than shadcn Tabs: there is one panel,
              not two, and it would be the only Tabs in the app. */}
          <div className="bg-muted inline-flex w-fit gap-1 rounded-lg p-1">
            {(['invoice', 'receipt'] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={kind === value}
                onClick={() => setKind(value)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  kind === value
                    ? 'bg-background shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t(
                  value === 'invoice'
                    ? 'settings.preview.tab_invoice'
                    : 'settings.preview.tab_receipt',
                )}
              </button>
            ))}
          </div>

          <div className="bg-muted/40 relative min-h-0 flex-1 overflow-hidden rounded-lg border">
            {error ? (
              <p className="text-destructive p-6 text-center text-sm">{error}</p>
            ) : url ? (
              <iframe
                key={url}
                src={url}
                title={t('settings.preview.title')}
                className="h-[60vh] w-full"
              />
            ) : (
              <div className="text-muted-foreground grid h-[60vh] place-items-center text-sm">
                {busy ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin" />{' '}
                    {t('doc.download.preparing')}
                  </span>
                ) : null}
              </div>
            )}
          </div>

          <p className="text-muted-foreground text-xs">
            {t('settings.preview.sample_note')}
          </p>
        </div>

        <DialogFooter className="border-t px-6 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.close')}
          </Button>
          <Button
            type="button"
            disabled={!built}
            onClick={() => built?.doc.save(built.fileName)}
          >
            <Download /> {t('common.download')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
