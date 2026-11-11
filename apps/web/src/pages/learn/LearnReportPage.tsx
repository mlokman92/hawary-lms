import { useParams } from 'react-router-dom'
import { useStudentAcademy } from '@/lib/studentAcademy'
import { useT } from '@/lib/i18n'
import { BackLink } from '@/components/patterns/BackLink'
import { ReportThreadView } from '@/features/reports/ReportThreadView'

/**
 * The student's side of one thread.
 *
 * Same `ReportThreadView` the back office mounts — it works out from the
 * server's `my_role` that this reader comments rather than decides. A part of
 * the LPKC is sent once, so there is nothing more to send from here: the
 * student reads the corrected copy and may reply in words.
 */
export function LearnReportPage() {
  const { id } = useParams<{ id: string }>()
  const { t } = useT()
  const { academyId } = useStudentAcademy()

  if (!id) return null

  return (
    <div className="mx-auto w-full max-w-4xl">
      <BackLink to="/learn/reports">{t('report.learn.title')}</BackLink>
      <ReportThreadView academyId={academyId} reportId={id} />
    </div>
  )
}
