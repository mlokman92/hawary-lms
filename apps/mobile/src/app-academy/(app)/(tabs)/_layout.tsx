import { useAcademyQueue } from '@/features/grading/api'
import { useReportCounts } from '@/features/reports/api'
import { AppTabs } from '@/shell/nav'
import { useScope } from '@/shell/scope'

/**
 * The staff tab bar: what is in front of me today, the two queues that end in
 * a decision (marking, LPKC), and the people. Everything occasional — courses,
 * the diary, money — is under More.
 *
 * The badges are what is waiting on the reader. RLS already narrows both
 * counts to a trainer's own courses and reports, so no filter is added here.
 */
export default function AcademyTabs() {
  const { academyId } = useScope()
  const { data: assessments } = useAcademyQueue('assessment', academyId)
  const { data: assignments } = useAcademyQueue('assignment', academyId)
  const { data: reports } = useReportCounts(academyId)

  const toMark =
    (assessments ?? []).filter((r) => r.status === 'submitted').length +
    (assignments ?? []).filter((r) => r.status === 'submitted').length
  const toCheck = (reports?.submitted ?? 0) + (reports?.in_review ?? 0)

  return (
    <AppTabs
      tabs={[
        { name: 'index', titleKey: 'm.tab.today', icon: 'sun' },
        { name: 'marking', titleKey: 'm.tab.marking', icon: 'check-square', badge: toMark },
        { name: 'lpkc', titleKey: 'nav.reports', icon: 'clipboard', badge: toCheck },
        { name: 'students', titleKey: 'nav.students', icon: 'users' },
        { name: 'more', titleKey: 'm.tab.more', icon: 'menu' },
      ]}
    />
  )
}
