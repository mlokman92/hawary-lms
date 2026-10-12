import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useStudentAcademy } from '@/lib/studentAcademy'
import { useT } from '@/lib/i18n'
import { BackLink } from '@/components/patterns/BackLink'
import { ReportThreadView } from '@/features/reports/ReportThreadView'
import { SubmitReportDialog } from '@/features/reports/SubmitReportDialog'
import { reportTargets, useMyReports } from '@/features/reports/api'

/**
 * The student's side of one thread.
 *
 * Same `ReportThreadView` the back office mounts — it works out from the
 * server's `my_role` that this reader comments rather than decides. The one
 * thing only this side can do is send the next version, so that is passed in as
 * `onResubmit`.
 *
 * The dialog needs the course and the part, not just the report, because
 * `submit_report` is keyed on (student, course, part); `my_reports` already
 * holds both, and it is cached from the list this page was reached from.
 */
export function LearnReportPage() {
  const { id } = useParams<{ id: string }>()
  const { t } = useT()
  const { academyId } = useStudentAcademy()
  const { data } = useMyReports(academyId)
  const [resubmit, setResubmit] = useState(false)

  if (!id) return null

  const target =
    reportTargets(data?.courses ?? []).find((x) => x.report?.id === id) ?? null

  return (
    <div className="mx-auto w-full max-w-4xl">
      <BackLink to="/learn/reports">{t('report.learn.title')}</BackLink>
      <ReportThreadView
        academyId={academyId}
        reportId={id}
        onResubmit={target ? () => setResubmit(true) : undefined}
      />
      {academyId ? (
        <SubmitReportDialog
          academyId={academyId}
          target={target}
          open={resubmit}
          onOpenChange={setResubmit}
        />
      ) : null}
    </div>
  )
}
