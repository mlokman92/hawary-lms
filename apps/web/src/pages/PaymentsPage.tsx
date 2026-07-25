import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { formatMYR } from '@hawary/shared'
import { useAcademy } from '@/lib/academy'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { InvoiceFormDialog } from '@/features/payments/InvoiceFormDialog'
import {
  INVOICE_STATUS_VARIANT,
  useInvoices,
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

export function PaymentsPage() {
  const navigate = useNavigate()
  const { activeAcademyId, active } = useAcademy()
  const academyId = activeAcademyId ?? ''
  const isAdmin = active?.role === 'admin'
  const { data: invoices, isLoading, error } = useInvoices(activeAcademyId)
  const [open, setOpen] = useState(false)

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Payments</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Invoice students and record payments.
          </p>
        </div>
        {isAdmin ? (
          <Button onClick={() => setOpen(true)}>
            <Plus /> New invoice
          </Button>
        ) : null}
      </div>

      <div className="mt-6">
        {isLoading ? (
          <div className="text-muted-foreground rounded-xl border p-8 text-center text-sm">
            Loading…
          </div>
        ) : error ? (
          <div className="text-destructive rounded-xl border p-8 text-center text-sm">
            {error.message}
          </div>
        ) : !invoices || invoices.length === 0 ? (
          <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 rounded-xl border border-dashed text-center">
            <p className="text-muted-foreground text-sm">No invoices yet.</p>
            {isAdmin ? (
              <Button variant="outline" onClick={() => setOpen(true)}>
                <Plus /> Create your first invoice
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Due</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => (
                  <TableRow
                    key={inv.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/payments/${inv.id}`)}
                  >
                    <TableCell>
                      <div className="font-medium">{inv.invoice_no}</div>
                      <div className="text-muted-foreground text-xs">
                        {fmtDate(inv.issued_at ?? inv.created_at)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>{inv.student?.full_name ?? '—'}</div>
                      {inv.student ? (
                        <div className="text-muted-foreground text-xs">
                          {inv.student.student_no}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMYR(inv.total_sen)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMYR(inv.amount_paid_sen)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={INVOICE_STATUS_VARIANT[inv.status]}
                        className="capitalize"
                      >
                        {inv.status.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {fmtDate(inv.due_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {activeAcademyId ? (
        <InvoiceFormDialog
          academyId={academyId}
          open={open}
          onOpenChange={setOpen}
          onCreated={(id) => navigate(`/payments/${id}`)}
        />
      ) : null}
    </div>
  )
}
