import { Link } from 'react-router-dom'
import { formatMYR } from '@hawary/shared'
import { fmtDate } from '@/lib/format'
import { useT } from '@/lib/i18n'
import { ErrorBlock, LoadingBlock } from '@/components/patterns/QueryState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  INVOICE_STATUS_LABEL,
  INVOICE_STATUS_VARIANT,
  PAYMENT_METHOD_LABEL,
  collectedSen,
  collectionStatus,
  useInvoice,
} from './api'

function Amount({
  label,
  value,
  strong,
}: {
  label: string
  value: string
  strong?: boolean
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? 'font-semibold tabular-nums' : 'tabular-nums'}>
        {value}
      </span>
    </div>
  )
}

/**
 * An invoice, without leaving the list it was opened from.
 *
 * Read-only on purpose, and the invoice page's own figures: Paid is what staff
 * count as collected, so the panel and the page can never disagree. Recording
 * a payment, voiding and the PDFs stay on the page, one button away.
 */
export function InvoiceSheet({
  invoiceId,
  onClose,
}: {
  invoiceId: string | null
  onClose: () => void
}) {
  const { t } = useT()
  const one = useInvoice(invoiceId ?? undefined)
  const inv = one.data

  return (
    <Sheet open={!!invoiceId} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="gap-0 overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-md">
        <SheetHeader className="pr-14">
          <SheetTitle className="flex flex-wrap items-center gap-2">
            {inv ? inv.invoice_no : t('payments.table.invoice')}
            {inv ? (
              <Badge variant={INVOICE_STATUS_VARIANT[collectionStatus(inv)]}>
                {t(INVOICE_STATUS_LABEL[collectionStatus(inv)])}
              </Badge>
            ) : null}
          </SheetTitle>
          <SheetDescription>
            {inv
              ? [
                  inv.student?.full_name,
                  inv.student?.student_no,
                  inv.course?.title,
                ]
                  .filter(Boolean)
                  .join(' · ')
              : null}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-6 pb-6">
          {one.error ? (
            <ErrorBlock error={one.error} />
          ) : !inv ? (
            <LoadingBlock />
          ) : (
            <>
              <p className="text-muted-foreground text-xs">
                {t('payments.detail.dates', {
                  issued: fmtDate(inv.issued_at ?? inv.created_at),
                  due: fmtDate(inv.due_at),
                })}
              </p>

              {inv.items.length > 0 ? (
                <ul className="divide-y">
                  {inv.items.map((it) => (
                    <li
                      key={it.id}
                      className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0"
                    >
                      <span>
                        {it.description}
                        {it.quantity !== 1 ? ` × ${it.quantity}` : ''}
                      </span>
                      <span className="tabular-nums">
                        {formatMYR(it.amount_sen)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}

              <div className="space-y-1.5 border-t pt-3">
                <Amount
                  label={t('common.total')}
                  value={formatMYR(inv.total_sen)}
                  strong
                />
                <Amount
                  label={t('payments.amount.paid')}
                  value={formatMYR(collectedSen(inv))}
                />
                <Amount
                  label={t('payments.amount.balance')}
                  value={formatMYR(inv.total_sen - collectedSen(inv))}
                  strong
                />
              </div>

              {inv.payments.length > 0 ? (
                <ul className="divide-y border-t pt-3">
                  {inv.payments.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0"
                    >
                      <div>
                        <span className="font-medium tabular-nums">
                          {formatMYR(p.amount_sen)}
                        </span>
                        <span className="text-muted-foreground">
                          {' '}
                          · {t(PAYMENT_METHOD_LABEL[p.method])}
                        </span>
                        {p.note ? (
                          <div className="text-muted-foreground text-xs">
                            {p.note}
                          </div>
                        ) : null}
                      </div>
                      <span className="text-muted-foreground whitespace-nowrap">
                        {fmtDate(p.paid_at ?? p.created_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}

              <Button variant="outline" size="sm" className="self-start" asChild>
                <Link to={`/payments/${inv.id}`}>{t('common.open')}</Link>
              </Button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
