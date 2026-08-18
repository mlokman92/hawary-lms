import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Clock, Plus, Wallet } from 'lucide-react'
import { formatMYR } from '@hawary/shared'
import { useAcademy } from '@/lib/academy'
import { fmtDate } from '@/lib/format'
import { useT } from '@/lib/i18n'
import { useCourses } from '@/features/courses/api'
import { PageHeader } from '@/components/patterns/PageHeader'
import { StatCard } from '@/components/patterns/StatCard'
import { EmptyState } from '@/components/patterns/EmptyState'
import { Pager } from '@/components/patterns/Pager'
import { ErrorBlock, LoadingBlock } from '@/components/patterns/QueryState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
  ALL_COURSES,
  INVOICE_STATUS_LABEL,
  INVOICE_STATUS_VARIANT,
  NO_COURSE,
  PAGE_SIZE,
  useInvoicePage,
  useInvoiceStats,
} from '@/features/payments/api'

/**
 * A tile's figure, or a dash while the aggregate is still in flight.
 *
 * The tiles now resolve separately from the rows, and printing a confident
 * RM 0.00 for the half-second in between reads as "this academy has billed
 * nothing" — a claim, not a placeholder.
 */
function money(sen: number | undefined): string {
  return sen === undefined ? '—' : formatMYR(sen)
}

export function PaymentsPage() {
  const navigate = useNavigate()
  const { t } = useT()
  const { activeAcademyId, active } = useAcademy()
  const academyId = activeAcademyId ?? ''
  const isAdmin = active?.role === 'admin'
  const { data: courses } = useCourses(activeAcademyId)
  const [open, setOpen] = useState(false)
  const [courseFilter, setCourseFilter] = useState(ALL_COURSES)
  const [showAllCourses, setShowAllCourses] = useState(false)
  const [page, setPage] = useState(1)

  // Page 4 of every invoice is not page 4 of one course's invoices.
  useEffect(() => setPage(1), [courseFilter])

  // The rows are one page; the tiles are the whole filtered set. Two queries
  // because a page of 50 cannot answer "how much is outstanding".
  const { data, isLoading, error } = useInvoicePage(
    activeAcademyId,
    courseFilter,
    page,
  )
  const { data: stats } = useInvoiceStats(activeAcademyId, courseFilter)

  const allCourses = courses ?? []
  const published = allCourses.filter((c) => c.status === 'published')
  const unpublishedCount = allCourses.length - published.length
  const courseOptions = showAllCourses ? allCourses : published

  const rows = data?.rows ?? []
  const total = data?.total ?? 0
  const filtering = courseFilter !== ALL_COURSES

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader title={t('payments.title')} description={t('payments.subtitle')}>
        {isAdmin ? (
          <Button onClick={() => setOpen(true)}>
            <Plus /> {t('payments.new_invoice')}
          </Button>
        ) : null}
      </PageHeader>

      {/* Course filter — drives the stats and the records below. */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-sm">{t('common.course')}</span>
        <Select value={courseFilter} onValueChange={setCourseFilter}>
          <SelectTrigger size="sm" className="w-56">
            <SelectValue placeholder={t('payments.filter.all_courses')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_COURSES}>{t('payments.filter.all_courses')}</SelectItem>
            <SelectItem value={NO_COURSE}>
              {t('payments.filter.no_course')}
            </SelectItem>
            {courseOptions.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.title}
                {c.status !== 'published'
                  ? ` · ${t(
                      c.status === 'draft'
                        ? 'common.draft'
                        : 'payments.course_status.archived',
                    )}`
                  : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {unpublishedCount > 0 ? (
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground text-xs underline"
            onClick={() => setShowAllCourses((v) => !v)}
          >
            {showAllCourses
              ? t('payments.filter.published_only')
              : t('payments.filter.show_all', { count: unpublishedCount })}
          </button>
        ) : null}
      </div>

      {/* Stats */}
      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label={t('payments.stat.invoiced')}
          value={money(stats?.total)}
          icon={Wallet}
        />
        <StatCard
          label={t('payments.stat.collected')}
          value={money(stats?.collected)}
          icon={CheckCircle2}
          tone="positive"
        />
        <StatCard
          label={t('payments.stat.outstanding')}
          value={money(stats?.outstanding)}
          icon={Clock}
          tone="warning"
        />
        <StatCard
          label={t('common.overdue')}
          value={money(stats?.overdue)}
          icon={AlertTriangle}
          tone="danger"
        />
      </div>

      {/* Records */}
      <div className="mt-8">
        <h2 className="mb-3 text-sm font-medium">
          {t('payments.records.heading')}
        </h2>
        {isLoading ? (
          <LoadingBlock />
        ) : error ? (
          <ErrorBlock error={error} />
        ) : rows.length === 0 && filtering ? (
          <EmptyState title={t('payments.empty.no_match')} />
        ) : rows.length === 0 ? (
          <EmptyState size="block" title={t('payments.empty.none')}>
            {isAdmin ? (
              <Button variant="outline" onClick={() => setOpen(true)}>
                <Plus /> {t('payments.empty.create_first')}
              </Button>
            ) : null}
          </EmptyState>
        ) : (
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('payments.table.invoice')}</TableHead>
                  <TableHead>{t('common.student')}</TableHead>
                  <TableHead>{t('common.course')}</TableHead>
                  <TableHead className="text-right">{t('common.total')}</TableHead>
                  <TableHead className="text-right">
                    {t('payments.amount.paid')}
                  </TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                  <TableHead>{t('common.due')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((inv) => (
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
                    <TableCell>
                      {inv.course ? (
                        <span className="text-sm">{inv.course.title}</span>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMYR(inv.total_sen)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMYR(inv.amount_paid_sen)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={INVOICE_STATUS_VARIANT[inv.status]}>
                        {t(INVOICE_STATUS_LABEL[inv.status])}
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

        <Pager
          page={page}
          total={total}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
        />
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
