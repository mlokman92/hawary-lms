import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useStudentAcademy } from '@/lib/studentAcademy'
import { useT } from '@/lib/i18n'
import { BackLink } from '@/components/patterns/BackLink'
import { ReportThreadView } from '@/features/reports/ReportThreadView'
import { SubmitReportDialog } from '@/features/reports/SubmitReportDialog'
import { useMyReports } from '@/features/reports/api'

/**
 * The student's side of one thread.
 *
 * Same `ReportThreadView` the back office mounts — it works out from the
 * server's `my_role` that this reader comments rather than decides. The one
 * thing only this side can do is send the next version, so that is passed in as
 * `onResubmit`.
 *
 * The dialog needs the course row, not just the report, because `submit_report`
 * is keyed on (student, course); `my_reports` already holds it, and it is
 * cached from the list this page was reached from.
 */
export function LearnReportPage() {
  const { id } = useParams<{ id: string }>()
  const { t } = useT()
  const { academyId } = useStudentAcademy()
  const { data } = useMyReports(academyId)
  const [resubmit, setResubmit] = useState(false)

  if (!id) return null

  const row = (data?.courses ?? []).find((c) => c.report?.id === id) ?? null

  return (
    <div className="mx-auto w-full max-w-4xl">
      <BackLink to="/learn/reports">{t('nav.learn.reports')}</BackLink>
      <ReportThreadView
        academyId={academyId}
        reportId={id}
        onResubmit={row ? () => setResubmit(true) : undefined}
      />
      {academyId ? (
        <SubmitReportDialog
          academyId={academyId}
          row={row}
          open={resubmit}
          onOpenChange={setResubmit}
        />
      ) : null}
    </div>
  )
}
