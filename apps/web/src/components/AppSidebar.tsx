import {
  BookOpen,
  CalendarClock,
  ClipboardCheck,
  ChartColumn,
  FileCheck,
  ChartLine,
  ClipboardList,
  FileCheck2,
  FileText,
  HandCoins,
  IdCard,
  LayoutDashboard,
  ListChecks,
  Presentation,
  Receipt,
  ScrollText,
  Settings,
  ShieldCheck,
  UserPlus,
  Users,
} from 'lucide-react'
import { useAcademy } from '@/lib/academy'
import { useT, type TFn } from '@/lib/i18n'
import { usePendingEnrollmentCount } from '@/features/enrollment/api'
import { useUpcomingAppointmentCount } from '@/features/appointments/api'
import { useReportCounts } from '@/features/reports/api'
import { useAnalyticsAccess } from '@/features/analytics/api'
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
const nav = (
  t: TFn,
  pendingEnrollments: number,
  upcomingAppointments: number,
  reportsToCheck: number,
): NavItem[] => [
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
  {
    title: t('nav.reports'),
    to: '/lpkc',
    icon: ClipboardCheck,
    // Work waiting on somebody, so urgent (the default tone) rather than the
    // diary's neutral count: a report nobody has looked at is a student
    // waiting, which is the whole reason this module exists.
    badge: reportsToCheck,
  },
  { title: t('nav.students'), to: '/students', icon: Users },
  { title: t('nav.instructors'), to: '/instructors', icon: Presentation },
  {
    title: t('nav.appointments'),
    to: '/appointments',
    icon: CalendarClock,
    // Sessions still to come. Neutral, not urgent: a booked diary is the
    // feature working, and nothing here is waiting on a decision the way a
    // pending enrolment is.
    badge: upcomingAppointments,
    badgeTone: 'neutral',
    children: [
      // The diary shows a week and has nowhere to put a cancelled session.
      // Finding one particular session is a different question, so it gets a
      // destination — the same split as Payments and its Log.
      {
        title: t('nav.appointment_list'),
        to: '/appointments/list',
        icon: ListChecks,
      },
    ],
  },
]

// Money is an admin destination. A trainer is staff so they can teach — build a
// course, mark work, take a session — and none of that needs to know what a
// student was charged. The SELECT policies on invoices/payments now say the
// same thing (`app.is_admin`), so leaving these in the shared list would only
// have pointed a trainer at a page that renders an empty ledger. Settings is
// narrower still: every control on it is a Director write.
const adminNav = (t: TFn, isDirector: boolean): NavItem[] => [
  {
    title: t('nav.payments'),
    to: '/payments',
    icon: Receipt,
    children: [
      // The invoice book and the ledger are different questions — "what is
      // owed" vs "what arrived" — so the log is a destination, not a tab.
      { title: t('nav.payment_log'), to: '/payments/log', icon: ScrollText },
      // And "where did it come from" is a third: the log is a flat list and
      // the answer is a hierarchy, so it cannot be a filter on the log.
      { title: t('nav.payment_report'), to: '/payments/report', icon: ChartColumn },
      // The paperwork behind the ledger: which bank transfers still have no
      // receipt. A destination because it is a queue to work through.
      {
        title: t('nav.payment_receipts'),
        to: '/payments/receipts',
        icon: FileCheck,
      },
    ],
  },
  { title: t('nav.incentives'), to: '/incentives', icon: HandCoins },
  // What the academy issues to a student and what it collects from one. Admin
  // only: an IC copy is nobody else's business (`student_ic_copies` says the
  // same), and the letter sits with it so the pair has one address.
  {
    title: t('nav.documents'),
    to: '/documents',
    icon: FileText,
    children: [
      {
        title: t('nav.offer_letter'),
        to: '/documents/offer-letters',
        icon: ScrollText,
      },
      { title: t('nav.ic_copy'), to: '/documents/ic-copies', icon: IdCard },
    ],
  },
  { title: t('nav.members'), to: '/members', icon: ShieldCheck },
  ...(isDirector
    ? [{ title: t('nav.settings'), to: '/settings', icon: Settings }]
    : []),
]

export function AppSidebar() {
  const { active, activeAcademyId } = useAcademy()
  const { t } = useT()
  const { data: pendingEnrollments } = usePendingEnrollmentCount(activeAcademyId)
  const { data: upcomingAppointments } =
    useUpcomingAppointmentCount(activeAcademyId)
  // RLS already narrows this to the reader's own reports, so the badge means
  // "waiting on you" for a trainer and "waiting on the academy" for an admin —
  // which is the right answer for each of them.
  const { data: reportCounts } = useReportCounts(activeAcademyId)
  // Not folded into adminNav: the page is let in by `app.can_view_analytics`,
  // which names one account by address whatever its role here.
  const { allowed: canViewAnalytics } = useAnalyticsAccess()

  const items = nav(
    t,
    pendingEnrollments ?? 0,
    upcomingAppointments ?? 0,
    (reportCounts?.submitted ?? 0) + (reportCounts?.in_review ?? 0),
  )
  const groups: NavGroup[] = [
    {
      label: t('nav.group.platform'),
      items: [
        ...(active?.role === 'admin'
          ? [...items, ...adminNav(t, active.isDirector)]
          : items),
        ...(canViewAnalytics
          ? [{ title: t('nav.analytics'), to: '/analytics', icon: ChartLine }]
          : []),
      ],
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
