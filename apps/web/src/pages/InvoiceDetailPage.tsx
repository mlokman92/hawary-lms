import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { formatMYR } from '@hawary/shared'
import { useAcademy } from '@/lib/academy'
import { fmtDate } from '@/lib/format'
import { useT } from '@/lib/i18n'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { RecordPaymentDialog } from '@/features/payments/RecordPaymentDialog'
import { PayLinkCard } from '@/features/payments/PayLinkCard'
import {
  INVOICE_STATUS_LABEL,
  INVOICE_STATUS_VARIANT,
  PAYMENT_METHOD_LABEL,
  useInvoice,
  useVoidInvoice,
} from '@/features/payments/api'

function Amount({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? 'font-semibold' : 'tabular-nums'}>{value}</span>
    </div>
  )
}

export function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { t } = useT()
  const { activeAcademyId, active } = useAcademy()
  const academyId = activeAcademyId ?? ''
  const isAdmin = active?.role === 'admin'

  const { data: invoice, isLoading, error } = useInvoice(id)
  const voidInvoice = useVoidInvoice(academyId)
  const [payOpen, setPayOpen] = useState(false)

  if (isLoading) {
    return (
      <div className="text-muted-foreground py-16 text-center text-sm">
        {t('common.loading')}
      </div>
    )
  }
  if (error || !invoice) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <p className="text-muted-foreground text-sm">
          {t('payments.detail.not_found')}
        </p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/payments">{t('payments.detail.back')}</Link>
        </Button>
      </div>
    )
  }

  const balance = invoice.total_sen - invoice.amount_paid_sen
  const canPay = invoice.status !== 'paid' && invoice.status !== 'void'
  const canVoid = invoice.status !== 'paid' && invoice.status !== 'void'

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/payments">
          <ArrowLeft /> {t('payments.title')}
        </Link>
      </Button>

      <Card>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">
                {invoice.invoice_no}
              </h1>
              <Badge variant={INVOICE_STATUS_VARIANT[invoice.status]}>
                {t(INVOICE_STATUS_LABEL[invoice.status])}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-1 text-sm">
              {invoice.student?.full_name ?? t('common.student')}
              {invoice.student ? ` · ${invoice.student.student_no}` : ''}
            </p>
            {invoice.course ? (
              <p className="text-muted-foreground text-sm">
                {t('payments.detail.course', { title: invoice.course.title })}
              </p>
            ) : null}
            <p className="text-muted-foreground text-sm">
              {t('payments.detail.dates', {
                issued: fmtDate(invoice.issued_at ?? invoice.created_at),
                due: fmtDate(invoice.due_at),
              })}
            </p>
          </div>
          {isAdmin ? (
            <div className="flex items-center gap-2">
              {canPay ? (
                <Button onClick={() => setPayOpen(true)}>
                  {t('payments.record.title')}
                </Button>
              ) : null}
              {canVoid ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline">{t('payments.detail.void')}</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        {t('payments.detail.void_confirm_title')}
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        {t('payments.detail.void_confirm_body', {
                          invoice: invoice.invoice_no,
                        })}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => voidInvoice.mutate(invoice.id)}
                      >
                        {t('payments.detail.void_action')}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>{t('payments.detail.items')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('common.description')}</TableHead>
                  <TableHead className="text-right">
                    {t('payments.detail.qty')}
                  </TableHead>
                  <TableHead className="text-right">
                    {t('payments.detail.unit')}
                  </TableHead>
                  <TableHead className="text-right">{t('common.amount')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoice.items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground text-sm">
                      {t('payments.detail.no_items')}
                    </TableCell>
                  </TableRow>
                ) : (
                  invoice.items.map((it) => (
                    <TableRow key={it.id}>
                      <TableCell>{it.description}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {it.quantity}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMYR(it.unit_price_sen)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMYR(it.amount_sen)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            {invoice.notes ? (
              <p className="text-muted-foreground mt-4 text-sm">
                {invoice.notes}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('payments.detail.summary')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Amount
              label={t('payments.amount.subtotal')}
              value={formatMYR(invoice.subtotal_sen)}
            />
            <Amount
              label={t('payments.amount.tax')}
              value={formatMYR(invoice.tax_sen)}
            />
            <Amount
              label={t('common.total')}
              value={formatMYR(invoice.total_sen)}
              strong
            />
            <div className="my-1 border-t" />
            <Amount
              label={t('payments.amount.paid')}
              value={formatMYR(invoice.amount_paid_sen)}
            />
            <Amount
              label={t('payments.amount.balance')}
              value={formatMYR(balance)}
              strong
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('payments.title')}</CardTitle>
          {/*
            The same payments, in the ledger. The list below is already all of
            them, but it says only what was paid — not when it was typed in, by
            whom, or whether the row succeeded, which is exactly what tells a
            double entry apart from a second instalment. The log carries those
            three, so the link earns its line. It passes the invoice number
            because that is one of the six fields `payment_log_page` searches.
          */}
          {invoice.payments.length > 0 ? (
            <CardAction>
              <Button variant="ghost" size="sm" asChild>
                <Link
                  to={`/payments/log?q=${encodeURIComponent(invoice.invoice_no)}`}
                >
                  {t('payments.detail.all_payments')}
                </Link>
              </Button>
            </CardAction>
          ) : null}
        </CardHeader>
        <CardContent>
          {invoice.payments.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {t('payments.detail.no_payments')}
            </p>
          ) : (
            <ul className="divide-y">
              {invoice.payments.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0 text-sm"
                >
                  <div>
                    <span className="font-medium">{formatMYR(p.amount_sen)}</span>
                    <span className="text-muted-foreground">
                      {' '}
                      · {t(PAYMENT_METHOD_LABEL[p.method])}
                    </span>
                  </div>
                  <span className="text-muted-foreground">
                    {fmtDate(p.paid_at ?? p.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {isAdmin ? (
        <PayLinkCard
          academyId={academyId}
          invoiceId={invoice.id}
          initialToken={invoice.pay_token}
          canPay={['issued', 'partially_paid', 'overdue'].includes(invoice.status)}
          allowPartial={invoice.allow_partial_payment}
          minPartialSen={invoice.min_partial_sen}
          balanceSen={balance}
        />
      ) : null}

      {invoice.student ? (
        <RecordPaymentDialog
          academyId={academyId}
          invoiceId={invoice.id}
          studentId={invoice.student_id}
          totalSen={invoice.total_sen}
          paidSen={invoice.amount_paid_sen}
          open={payOpen}
          onOpenChange={setPayOpen}
        />
      ) : null}
    </div>
  )
}
