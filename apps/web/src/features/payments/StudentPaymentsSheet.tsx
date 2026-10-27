import { Link } from 'react-router-dom'
import { formatMYR } from '@hawary/shared'
import { fmtDate, personName } from '@/lib/format'
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
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_VARIANT,
  usePaymentLogPage,
  type PaymentLogFilters,
} from './api'

/**
 * Every payment one student has made, without leaving the list it was opened
 * from — asked on /documents/kwsp-letters before a letter is created.
 *
 * The ledger's own read scoped to the student, so it and /payments/log cannot
 * disagree. One page of it: a student does not make fifty payments. Read-only;
 * invoices and everything else are on the student's page, one button away.
 */
export function StudentPaymentsSheet({
  academyId,
  student,
  onClose,
}: {
  academyId: string | null
  student: {
    id: string
    full_name: string | null
    email: string | null
    student_no: string | null
  } | null
  onClose: () => void
}) {
  const { t } = useT()
  const filters: PaymentLogFilters = {
    search: '',
    status: null,
    scope: { studentId: student?.id ?? null },
  }
  const payments = usePaymentLogPage(academyId, filters, 'paid', 1, !!student)
  const rows = payments.data ?? []

  return (
    <Sheet open={!!student} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="gap-0 overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-md">
        <SheetHeader className="pr-14">
          <SheetTitle>{t('payments.history.title')}</SheetTitle>
          <SheetDescription>
            {student
              ? [
                  personName(student.full_name, student.email),
                  student.student_no,
                ]
                  .filter(Boolean)
                  .join(' · ')
              : null}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-6 pb-6">
          {payments.error ? (
            <ErrorBlock error={payments.error} />
          ) : !payments.data || payments.isPlaceholderData ? (
            <LoadingBlock />
          ) : rows.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {t('payments.log.empty')}
            </p>
          ) : (
            <ul className="divide-y">
              {rows.map((p) => (
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
                    {p.status !== 'succeeded' ? (
                      <Badge
                        variant={PAYMENT_STATUS_VARIANT[p.status]}
                        className="ml-2"
                      >
                        {t(PAYMENT_STATUS_LABEL[p.status])}
                      </Badge>
                    ) : null}
                    {p.invoice_id ? (
                      <div className="text-xs">
                        <Link
                          to={`/payments/${p.invoice_id}`}
                          className="hover:underline"
                        >
                          {p.invoice_no}
                        </Link>
                      </div>
                    ) : null}
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
          )}

          {student ? (
            <Button variant="outline" size="sm" className="self-start" asChild>
              <Link to={`/students/${student.id}`}>{t('common.open')}</Link>
            </Button>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}
