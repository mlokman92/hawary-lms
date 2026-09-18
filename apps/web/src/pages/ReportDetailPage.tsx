import { useParams } from 'react-router-dom'
import { useAcademy } from '@/lib/academy'
import { useT } from '@/lib/i18n'
import { BackLink } from '@/components/patterns/BackLink'
import { ReportThreadView } from '@/features/reports/ReportThreadView'

/**
 * Staff side of one report-check thread.
 *
 * A thin wrapper on purpose: everything about the thread — what it says, and
 * what this reader may do to it — lives in `ReportThreadView`, which reads the
 * server's own `my_role`. The two routes differ in their shell and in where
 * Back goes, and in nothing else.
 */
export function ReportDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { t } = useT()
  const { activeAcademyId } = useAcademy()

  if (!id) return null

  return (
    <div className="mx-auto w-full max-w-4xl">
      <BackLink to="/reports">{t('nav.reports')}</BackLink>
      <ReportThreadView academyId={activeAcademyId} reportId={id} />
    </div>
  )
}
