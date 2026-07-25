import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { formatMYR } from '@hawary/shared'
import { useAcademy } from '@/lib/academy'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
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
import {
  INVOICE_STATUS_VARIANT,
  useInvoice,
  useVoidInvoice,
} from '@/features/payments/api'

function fmtDate(iso: string | null) {
  return iso
    ? new Date(iso).toLocaleDateString('en-MY', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : '—'
}

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
  const { activeAcademyId, active } = useAcademy()
  const academyId = activeAcademyId ?? ''
  const isAdmin = active?.role === 'admin'

  const { data: invoice, isLoading, error } = useInvoice(id)
  const voidInvoice = useVoidInvoice(academyId)
  const [payOpen, setPayOpen] = useState(false)

  if (isLoading) {
    return (
      <div className="text-muted-foreground py-16 text-center text-sm">
        Loading…
      </div>
    )
  }
  if (error || !invoice) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <p className="text-muted-foreground text-sm">Invoice not found.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/payments">Back to payments</Link>
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
          <ArrowLeft /> Payments
        </Link>
      </Button>

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
                {invoice.status.replace('_', ' ')}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-1 text-sm">
              {invoice.student?.full_name ?? 'Student'}
              {invoice.student ? ` · ${invoice.student.student_no}` : ''}
            </p>
            <p className="text-muted-foreground text-sm">
              Issued {fmtDate(invoice.issued_at ?? invoice.created_at)} · Due{' '}
              {fmtDate(invoice.due_at)}
            </p>
          </div>
          {isAdmin ? (
            <div className="flex items-center gap-2">
              {canPay ? (
                <Button onClick={() => setPayOpen(true)}>Record payment</Button>
              ) : null}
              {canVoid ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline">Void</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Void this invoice?</AlertDialogTitle>
                      <AlertDialogDescription>
                        {invoice.invoice_no} will be marked void. Recorded
                        payments are kept for your records.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => voidInvoice.mutate(invoice.id)}
                      >
                        Void invoice
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
            <CardTitle>Items</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Unit</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoice.items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground text-sm">
                      No line items.
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
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Amount label="Subtotal" value={formatMYR(invoice.subtotal_sen)} />
            <Amount label="Tax / SST" value={formatMYR(invoice.tax_sen)} />
            <Amount label="Total" value={formatMYR(invoice.total_sen)} strong />
            <div className="my-1 border-t" />
            <Amount label="Paid" value={formatMYR(invoice.amount_paid_sen)} />
            <Amount label="Balance" value={formatMYR(balance)} strong />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Payments</CardTitle>
        </CardHeader>
        <CardContent>
          {invoice.payments.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No payments recorded yet.
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
                    <span className="text-muted-foreground capitalize">
                      {' '}
                      · {p.method.replace('_', ' ')}
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
