import {
  BookOpen,
  ClipboardList,
  LayoutDashboard,
  Receipt,
  UserRound,
} from 'lucide-react'
import { useT } from '@/lib/i18n'
import { ShellSidebar } from '@/components/shell/ShellSidebar'
import type { NavGroup } from '@/components/shell/nav'
import { LearnAcademySwitcher } from './LearnAcademySwitcher'

/**
 * Notes, assessments and assignments are not destinations here either — they
 * live inside a course module and are reached from the course page, exactly as
 * on the staff side.
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
        { title: t('nav.learn.courses'), to: '/learn/courses', icon: BookOpen },
        { title: t('nav.learn.work'), to: '/learn/work', icon: ClipboardList },
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

  return <ShellSidebar switcher={<LearnAcademySwitcher />} groups={groups} />
}
