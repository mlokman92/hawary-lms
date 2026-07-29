import { useNavigate } from 'react-router-dom'
import { Receipt, Wallet } from 'lucide-react'
import { formatMYR } from '@hawary/shared'
import { fmtDate } from '@/lib/format'
import { useT } from '@/lib/i18n'
import { useStudentAcademy } from '@/lib/studentAcademy'
import { useMyStudent } from '@/features/learn/api'
import { INVOICE_STATUS_KEY, useMyInvoices } from '@/features/learn/billing'
import { INVOICE_STATUS_VARIANT } from '@/features/payments/api'
import { PageHeader } from '@/components/patterns/PageHeader'
import { StatCard } from '@/components/patterns/StatCard'
import { EmptyState } from '@/components/patterns/EmptyState'
import { ErrorBlock, LoadingBlock } from '@/components/patterns/QueryState'
import { NoStudentRecord } from '@/components/learn/NoStudentRecord'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export function LearnBillingPage() {
  const navigate = useNavigate()
  const { t } = useT()
  const { academyId } = useStudentAcademy()
  const {
    data: student,
    isLoading: studentLoading,
    error: studentError,
  } = useMyStudent(academyId)
  const { rows, totals, isLoading, error } = useMyInvoices(
    academyId,
    student?.id,
  )

  // Rendered in every branch so the h1 never pops in — same as /payments.
  const header = (
    <PageHeader
      title={t('lacct.billing.title')}
      description={t('lacct.billing.description')}
    />
  )

  if (studentLoading) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        {header}
        <LoadingBlock className="mt-6" />
      </div>
    )
  }

  if (studentError) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        {header}
        <ErrorBlock error={studentError} className="mt-6" />
      </div>
    )
  }

  if (!student) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        {header}
        <div className="mt-6">
          <NoStudentRecord detail={t('lacct.billing.no_record_detail')} />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      {header}

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard
          label={t('lacct.amount.billed')}
          value={formatMYR(totals.billed)}
          icon={Receipt}
        />
        <StatCard
          label={t('lacct.amount.paid')}
          value={formatMYR(totals.paid)}
          icon={Wallet}
          tone="positive"
        />
        <StatCard
          label={t('lacct.amount.outstanding')}
          value={formatMYR(totals.outstanding)}
          icon={Receipt}
          tone={totals.outstanding > 0 ? 'warning' : 'muted'}
        />
      </div>

      <div className="mt-8">
        {isLoading ? (
          <LoadingBlock />
        ) : error ? (
          <ErrorBlock error={error} />
        ) : rows.length === 0 ? (
          <EmptyState title={t('lacct.billing.empty')} />
        ) : (
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('lacct.col.invoice')}</TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                  <TableHead>{t('common.due')}</TableHead>
                  <TableHead className="text-right">
                    {t('common.total')}
                  </TableHead>
                  <TableHead className="text-right">
                    {t('lacct.amount.balance')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((inv) => {
                  const balance = Math.max(
                    0,
                    inv.total_sen - inv.amount_paid_sen,
                  )
                  return (
                    <TableRow
                      key={inv.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/learn/billing/${inv.id}`)}
                    >
                      <TableCell>
                        <div className="font-medium">{inv.invoice_no}</div>
                        {inv.course ? (
                          <div className="text-muted-foreground text-xs">
                            {inv.course.title}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={INVOICE_STATUS_VARIANT[inv.status]}
                          className="capitalize"
                        >
                          {t(INVOICE_STATUS_KEY[inv.status])}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {fmtDate(inv.due_at)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMYR(inv.total_sen)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMYR(balance)}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  )
}
