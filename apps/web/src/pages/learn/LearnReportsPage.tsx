import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ClipboardCheck, Upload } from 'lucide-react'
import { useStudentAcademy } from '@/lib/studentAcademy'
import { useT } from '@/lib/i18n'
import { fmtDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { TONE_CLASS } from '@/lib/tone'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/patterns/PageHeader'
import { EmptyState } from '@/components/patterns/EmptyState'
import { ErrorBlock, LoadingBlock } from '@/components/patterns/QueryState'
import { SubmitReportDialog } from '@/features/reports/SubmitReportDialog'
import {
  REPORT_STATUS,
  useMyReports,
  type MyReportRow,
} from '@/features/reports/api'

/**
 * The student's reports: one row per course they are on.
 *
 * Keyed on ENROLMENTS, not on reports, so a course with nothing sent yet is a
 * row with a Send button rather than an absence to interpret. That is the same
 * argument `/courses/:id/billing` makes about students who were never invoiced:
 * the thing you cannot see is the thing you came to find out about.
 *
 * When the academy has nobody in the checking rota the page says so and offers
 * nothing — the pool is the switch, so there is no separate setting to read and
 * no half-open state to render.
 */
export function LearnReportsPage() {
  const { t } = useT()
  const navigate = useNavigate()
  const { academyId } = useStudentAcademy()
  const { data, isLoading, error } = useMyReports(academyId)

  const [submitFor, setSubmitFor] = useState<MyReportRow | null>(null)

  const header = (
    <PageHeader
      title={t('nav.learn.reports')}
      description={t('report.learn.desc')}
    />
  )

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-4xl">
        {header}
        <LoadingBlock className="mt-6" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-4xl">
        {header}
        <ErrorBlock error={error} className="mt-6" />
      </div>
    )
  }

  const rows = data?.courses ?? []

  return (
    <div className="mx-auto w-full max-w-4xl">
      {header}

      <div className="mt-6">
        {!data?.is_open ? (
          <EmptyState
            size="block"
            icon={ClipboardCheck}
            title={t('report.learn.closed')}
            body={t('report.learn.closed_hint')}
          />
        ) : rows.length === 0 ? (
          <EmptyState
            size="block"
            icon={ClipboardCheck}
            title={t('report.learn.no_courses')}
          />
        ) : (
          <Card className="gap-0 py-0">
            <ul className="divide-y">
              {rows.map((row) => {
                const r = row.report
                const meta = r ? REPORT_STATUS[r.status] : null
                return (
                  <li
                    key={row.course_id}
                    className="flex items-center gap-3 px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      {r ? (
                        <Link
                          to={`/learn/reports/${r.id}`}
                          className="block truncate text-sm font-medium hover:underline"
                        >
                          {r.title}
                        </Link>
                      ) : (
                        <p className="truncate text-sm font-medium">
                          {row.course_title}
                        </p>
                      )}
                      <p className="text-muted-foreground truncate text-xs">
                        {r
                          ? [
                              row.course_title,
                              r.instructor_name
                                ? t('report.checked_by', {
                                    name: r.instructor_name,
                                  })
                                : null,
                              fmtDateTime(r.last_at),
                            ]
                              .filter(Boolean)
                              .join(' · ')
                          : t('report.learn.nothing_sent')}
                      </p>
                    </div>

                    {meta ? (
                      <Badge
                        variant="outline"
                        className={cn('shrink-0', TONE_CLASS[meta.tone])}
                      >
                        {t(meta.labelKey)}
                      </Badge>
                    ) : null}

                    {/* The action is on the row that needs it. An approved
                        report has nothing left to send, so the button goes —
                        a disabled one would only raise the question. */}
                    {!r || r.status !== 'approved' ? (
                      <Button
                        size="sm"
                        variant={r ? 'outline' : 'default'}
                        className="shrink-0"
                        onClick={() => setSubmitFor(row)}
                      >
                        <Upload />
                        {r ? t('report.resubmit') : t('report.submit.send')}
                      </Button>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </Card>
        )}
      </div>

      {academyId ? (
        <SubmitReportDialog
          academyId={academyId}
          row={submitFor}
          open={!!submitFor}
          onOpenChange={(o) => !o && setSubmitFor(null)}
          onDone={(id) => navigate(`/learn/reports/${id}`)}
        />
      ) : null}
    </div>
  )
}
