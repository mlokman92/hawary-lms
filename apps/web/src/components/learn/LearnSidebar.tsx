import {
  BookOpen,
  CalendarClock,
  ClipboardList,
  FileCheck2,
  LayoutDashboard,
  ListTodo,
  Receipt,
  UserRound,
} from 'lucide-react'
import { useT } from '@/lib/i18n'
import { ShellSidebar } from '@/components/shell/ShellSidebar'
import type { NavGroup } from '@/components/shell/nav'
import { LearnAcademySwitcher } from './LearnAcademySwitcher'

/**
 * Assessments and assignments sit under My courses as sub-navigation, mirroring
 * the staff rail. Notes stay reachable only through their module.
 *
 * My work is still its own item and is not the same list: it is the deadline
 * view across both kinds, filtered to what is outstanding. The sub-items are
 * the complete inventory of one kind, done or not.
 *
 * Every item is backed by something RLS actually admits for a student:
 *   Dashboard/My courses/My work — enrollments + published content
 *   Billing   — invoices/invoice_items/payments all admit app.owns_student
 *   Profile   — profiles UPDATE is `id = auth.uid()`
 */
export function LearnSidebar() {
  const { t } = useT()

  const groups: NavGroup[] = [
    {
      label: t('nav.group.learning'),
      items: [
        {
          title: t('nav.learn.dashboard'),
          to: '/learn',
          icon: LayoutDashboard,
          exact: true,
        },
        {
          title: t('nav.learn.courses'),
          to: '/learn/courses',
          icon: BookOpen,
          children: [
            {
              title: t('nav.assessments'),
              to: '/learn/assessments',
              icon: ClipboardList,
            },
            {
              title: t('nav.assignments'),
              to: '/learn/assignments',
              icon: FileCheck2,
            },
          ],
        },
        { title: t('nav.learn.work'), to: '/learn/work', icon: ListTodo },
        {
          title: t('nav.learn.appointments'),
          to: '/learn/appointments',
          icon: CalendarClock,
        },
      ],
    },
    {
      label: t('nav.group.account'),
      items: [
        { title: t('nav.learn.billing'), to: '/learn/billing', icon: Receipt },
        { title: t('nav.learn.profile'), to: '/learn/profile', icon: UserRound },
      ],
    },
  ]

  return (
    <ShellSidebar
      switcher={<LearnAcademySwitcher />}
      groups={groups}
      profileTo="/learn/profile"
    />
  )
}
