import { Link } from 'react-router-dom'
import { MoreHorizontal, Upload } from 'lucide-react'
import { formatMYR } from '@hawary/shared'
import { errorMessage } from '@/lib/errors'
import { fmtDate, fmtDateTime } from '@/lib/format'
import { useT } from '@/lib/i18n'
import { ErrorBlock, LoadingBlock } from '@/components/patterns/QueryState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  useBankTransfer,
  useOpenPaymentReceipt,
  useReceiptPreviewUrl,
  type BankTransferRow,
  type useReceiptPicker,
} from './receipts'

/**
 * One bank transfer and its receipt, beside the queue it was opened from.
 *
 * Open exactly while the address names a payment, so the address is the
 * record: what a colleague is sent opens on the same transfer, receipt drawn.
 *
 * `hint` is the row that was clicked, shown until the transfer's own read
 * answers; a pasted address has none and waits for it.
 */
export function ReceiptSheet({
  academyId,
  paymentId,
  hint,
  picker,
  onClose,
}: {
  academyId: string | null
  paymentId: string | null
  hint: BankTransferRow | undefined
  /** The page's one file input — an upload from here is the same upload. */
  picker: ReturnType<typeof useReceiptPicker>
  onClose: () => void
}) {
  const { t } = useT()
  const one = useBankTransfer(academyId, paymentId)
  const p = one.data ?? (one.data === undefined ? hint : undefined)
  const preview = useReceiptPreviewUrl(
    p?.id ?? null,
    p?.receipt_uploaded_at ?? null,
  )
  const open = useOpenPaymentReceipt()
  const failure = picker.error ?? open.error ?? preview.error

  return (
    <Sheet open={!!paymentId} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl">
        <SheetHeader className="pr-14">
          <SheetTitle>
            {p
              ? (p.student_full_name ?? t('common.unnamed'))
              : t('payments.receipts.receipt')}
          </SheetTitle>
          <SheetDescription>
            {p
              ? [p.student_no, p.course_title].filter(Boolean).join(' · ')
              : null}
          </SheetDescription>
        </SheetHeader>

        {!p ? (
          <div className="px-6">
            {one.error ? (
              <ErrorBlock error={one.error} />
            ) : one.isLoading ? (
              <LoadingBlock />
            ) : (
              <p className="text-muted-foreground text-sm">
                {t('payments.receipts.empty_match')}
              </p>
            )}
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-4 px-6 pb-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold tabular-nums">
                  {formatMYR(p.amount_sen)}
                </div>
                <div className="text-muted-foreground text-xs">
                  {t('payments.receipts.paid_on', {
                    date: fmtDate(p.paid_at ?? p.created_at),
                  })}
                  {' · '}
                  {t('payments.receipts.recorded')} {fmtDateTime(p.created_at)}
                  {p.recorded_by_name ? ` · ${p.recorded_by_name}` : ''}
                </div>
                {p.note ? <div className="mt-1 text-sm">{p.note}</div> : null}
              </div>
              {p.invoice_id ? (
                <Link
                  to={`/payments/${p.invoice_id}`}
                  className="font-medium whitespace-nowrap hover:underline"
                >
                  {p.invoice_no}
                </Link>
              ) : null}
            </div>

            {p.receipt_uploaded_at ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate">{p.receipt_file_name}</div>
                    <div className="text-muted-foreground text-xs">
                      {fmtDateTime(p.receipt_uploaded_at)}
                      {p.receipt_uploaded_by_name
                        ? ` · ${p.receipt_uploaded_by_name}`
                        : ''}
                    </div>
                  </div>
                  {picker.uploadingId === p.id ? (
                    <Button variant="outline" size="sm" disabled>
                      {t('common.uploading')}
                    </Button>
                  ) : (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={open.isPending}
                        onClick={() => open.mutate(p.id)}
                      >
                        {t('common.view')}
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm">
                            <MoreHorizontal />
                            <span className="sr-only">
                              {t('common.actions')}
                            </span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => picker.pick(p.id)}>
                            <Upload /> {t('payments.receipts.replace')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}
                </div>
                <div className="bg-muted/40 min-h-0 flex-1 overflow-auto rounded-lg border">
                  {!preview.data ? null : p.receipt_mime_type ===
                    'application/pdf' ? (
                    <iframe
                      key={preview.data}
                      src={preview.data}
                      title={p.receipt_file_name ?? ''}
                      className="h-full w-full"
                    />
                  ) : (
                    <img
                      src={preview.data}
                      alt={p.receipt_file_name ?? ''}
                      className="w-full"
                    />
                  )}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <Badge variant="secondary">
                  {t('payments.pstatus.pending')}
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={picker.busy}
                  onClick={() => picker.pick(p.id)}
                >
                  <Upload />{' '}
                  {picker.uploadingId === p.id
                    ? t('common.uploading')
                    : t('common.upload')}
                </Button>
              </div>
            )}

            {failure ? (
              <p className="text-destructive text-sm">
                {errorMessage(failure, t('upload.failed'))}
              </p>
            ) : null}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
