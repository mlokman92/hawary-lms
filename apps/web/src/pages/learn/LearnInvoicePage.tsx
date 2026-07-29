import { Link, useParams } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import { formatMYR } from '@hawary/shared'
import { fmtDate } from '@/lib/format'
import { useT } from '@/lib/i18n'
import {
  INVOICE_STATUS_KEY,
  PAYMENT_METHOD_KEY,
  useMyInvoice,
} from '@/features/learn/billing'
import { INVOICE_STATUS_VARIANT } from '@/features/payments/api'
import { BackLink } from '@/components/patterns/BackLink'
import { NotFoundBlock, RouteLoading } from '@/components/patterns/QueryState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

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
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? 'font-semibold' : 'tabular-nums'}>{value}</span>
    </div>
  )
}

/**
 * The learner's read-only view of one of their own invoices.
 *
 * Reuses useInvoice() verbatim — its student/items/payments embeds all resolve
 * under app.owns_student. Every admin affordance is omitted rather than
 * disabled: Record payment / Void are `app.is_admin` writes, and
 * `ensure_pay_token` raises "Not authorized" for a non-admin, so a "generate
 * pay link" button could only ever fail. An existing pay_token is different —
 * get_public_invoice is granted to anon, so that link genuinely works.
 */
export function LearnInvoicePage() {
  const { id } = useParams<{ id: string }>()
  const { t } = useT()
  const { data: invoice, isLoading, error } = useMyInvoice(id)

  if (isLoading) return <RouteLoading />

  if (error || !invoice) {
    return (
      <NotFoundBlock
        message={t('lacct.invoice.not_available')}
        backTo="/learn/billing"
        backLabel={t('lacct.invoice.back')}
      />
    )
  }

  const balance = invoice.total_sen - invoice.amount_paid_sen
  const payable =
    !!invoice.pay_token &&
    balance > 0 &&
    ['issued', 'partially_paid', 'overdue'].includes(invoice.status)

  return (
    <div className="mx-auto w-full max-w-4xl">
      <BackLink to="/learn/billing">{t('lacct.billing.title')}</BackLink>

      <div className="mt-4 space-y-6">
        <Card>
          <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold tracking-tight">
                  {invoice.invoice_no}
                </h1>
                <Badge
                  variant={INVOICE_STATUS_VARIANT[invoice.status]}
                  className="capitalize"
                >
                  {t(INVOICE_STATUS_KEY[invoice.status])}
                </Badge>
              </div>
              {invoice.course ? (
                <p className="text-muted-foreground mt-1 text-sm">
                  {t('lacct.invoice.course', { title: invoice.course.title })}
                </p>
              ) : null}
              <p className="text-muted-foreground text-sm">
                {t('lacct.invoice.dates', {
                  issued: fmtDate(invoice.issued_at ?? invoice.created_at),
                  due: fmtDate(invoice.due_at),
                })}
              </p>
            </div>
            {payable ? (
              <Button asChild variant="outline">
                <Link to={`/pay/${invoice.pay_token}`}>
                  {t('lacct.invoice.pay_online')} <ExternalLink />
                </Link>
              </Button>
            ) : null}
          </CardContent>
        </Card>

        <div className="grid gap-6 md:grid-cols-3">
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>{t('lacct.invoice.items')}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('common.description')}</TableHead>
                    <TableHead className="text-right">
                      {t('lacct.col.qty')}
                    </TableHead>
                    <TableHead className="text-right">
                      {t('lacct.col.unit')}
                    </TableHead>
                    <TableHead className="text-right">
                      {t('common.amount')}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoice.items.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="text-muted-foreground text-sm"
                      >
                        {t('lacct.invoice.no_items')}
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
              {/* The note is usually addressed to the student — it is the one
                  place an academy explains a charge. */}
              {invoice.notes ? (
                <p className="text-muted-foreground mt-4 text-sm">
                  {invoice.notes}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('lacct.invoice.summary')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Amount
                label={t('lacct.amount.subtotal')}
                value={formatMYR(invoice.subtotal_sen)}
              />
              <Amount
                label={t('lacct.amount.tax')}
                value={formatMYR(invoice.tax_sen)}
              />
              <Amount
                label={t('common.total')}
                value={formatMYR(invoice.total_sen)}
                strong
              />
              <div className="my-1 border-t" />
              <Amount
                label={t('lacct.amount.paid')}
                value={formatMYR(invoice.amount_paid_sen)}
              />
              <Amount
                label={t('lacct.amount.balance')}
                value={formatMYR(balance)}
                strong
              />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t('lacct.invoice.payments')}</CardTitle>
          </CardHeader>
          <CardContent>
            {invoice.payments.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                {t('lacct.invoice.no_payments')}
              </p>
            ) : (
              <ul className="divide-y">
                {invoice.payments.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-3 py-2 text-sm first:pt-0 last:pb-0"
                  >
                    <div>
                      <span className="font-medium">
                        {formatMYR(p.amount_sen)}
                      </span>
                      <span className="text-muted-foreground capitalize">
                        {' '}
                        · {t(PAYMENT_METHOD_KEY[p.method])}
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
      </div>
    </div>
  )
}
