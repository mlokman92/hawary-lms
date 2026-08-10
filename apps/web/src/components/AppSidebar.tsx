import {
  BookOpen,
  CalendarClock,
  ClipboardList,
  FileCheck2,
  LayoutDashboard,
  Presentation,
  Receipt,
  Settings,
  ShieldCheck,
  UserPlus,
  Users,
} from 'lucide-react'
import { useAcademy } from '@/lib/academy'
import { useT, type TFn } from '@/lib/i18n'
import { usePendingEnrollmentCount } from '@/features/enrollment/api'
import { AcademySwitcher } from './AcademySwitcher'
import { ShellSidebar } from './shell/ShellSidebar'
import type { NavGroup, NavItem } from './shell/nav'

// Assessments and assignments hang off Courses as sub-navigation. They belong
// to a course module and are still created there, but finding one used to mean
// remembering which module it was in and expanding that course; the sub-items
// give the academy-wide list a permanent address. Notes stay module-only —
// they are reading material, not work with a deadline attached.
//
// Built per render rather than held as a module constant: the titles are
// translated, so they have to be read after the language is known.
const nav = (t: TFn, pendingEnrollments: number): NavItem[] => [
  { title: t('nav.dashboard'), to: '/', icon: LayoutDashboard, exact: true },
  {
    title: t('nav.courses'),
    to: '/courses',
    icon: BookOpen,
    children: [
      {
        title: t('nav.assessments'),
        to: '/assessments',
        icon: ClipboardList,
      },
      {
        title: t('nav.assignments'),
        to: '/assignments',
        icon: FileCheck2,
      },
      {
        title: t('nav.enrollments'),
        to: '/enrollments',
        icon: UserPlus,
        // People waiting on a decision. Nobody is notified when a request
        // arrives, so without this the only way to find out is to go and look.
        badge: pendingEnrollments,
      },
    ],
  },
  { title: t('nav.students'), to: '/students', icon: Users },
  { title: t('nav.instructors'), to: '/instructors', icon: Presentation },
  { title: t('nav.appointments'), to: '/appointments', icon: CalendarClock },
  { title: t('nav.payments'), to: '/payments', icon: Receipt },
]

const adminNav = (t: TFn): NavItem[] => [
  { title: t('nav.members'), to: '/members', icon: ShieldCheck },
  { title: t('nav.settings'), to: '/settings', icon: Settings },
]

export function AppSidebar() {
  const { active, activeAcademyId } = useAcademy()
  const { t } = useT()
  const { data: pendingEnrollments } = usePendingEnrollmentCount(activeAcademyId)

  const items = nav(t, pendingEnrollments ?? 0)
  const groups: NavGroup[] = [
    {
      label: t('nav.group.platform'),
      items: active?.role === 'admin' ? [...items, ...adminNav(t)] : items,
    },
  ]

  return (
    <ShellSidebar
      switcher={<AcademySwitcher />}
      groups={groups}
      profileTo="/profile"
    />
  )
}
