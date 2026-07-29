import { lazy, Suspense, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  BookOpen,
  BookX,
  CheckCircle2,
  ChevronRight,
  Circle,
  CircleCheck,
  ClipboardList,
  CreditCard,
  EyeOff,
  FileCheck2,
  FileText,
  GraduationCap,
  Layers,
  Mail,
  MailQuestion,
  Plus,
  ShieldAlert,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react'
import { formatMYR } from '@hawary/shared'
import { cn } from '@/lib/utils'
import { useAcademy } from '@/lib/academy'
import { useT, type TFn, type TKey } from '@/lib/i18n'
import { fmtDate, fmtDays, localeFor } from '@/lib/format'
import { PageHeader } from '@/components/patterns/PageHeader'
import { StatTile } from '@/components/patterns/StatTile'
import { StatCard } from '@/components/patterns/StatCard'
import { ErrorBlock, LoadingBlock } from '@/components/patterns/QueryState'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import {
  countOf,
  useActiveStudentCounts,
  useCourses,
  type CourseRow,
  type CourseStatus,
} from '@/features/courses/api'
import { studentStats, useStudents } from '@/features/students/api'
import { STATUS_META } from '@/features/students/status'
import { StudentFormDialog } from '@/features/students/StudentFormDialog'
import {
  PAYMENT_METHOD_LABEL,
  useInvoices,
  type PaymentMethod,
} from '@/features/payments/api'
import { InvoiceFormDialog } from '@/features/payments/InvoiceFormDialog'
import { usePaymentSettings } from '@/features/settings/api'
import {
  REVENUE_MONTHS,
  collectedInMonth,
  contentReadiness,
  invoiceStats,
  revenueSeries,
  useModuleReadiness,
  usePaymentActivity,
  usePendingInvitations,
  useReconciliationCount,
  type ContentReadiness,
  type PendingInvitationRow,
} from '@/features/dashboard/api'

// Recharts is heavy; keep it out of the main bundle the way the note editor
// keeps Tiptap out. The dashboard is the index route — every staff login pays
// for anything imported eagerly here.
const RevenueChart = lazy(() =>
  import('@/features/dashboard/RevenueChart').then((m) => ({
    default: m.RevenueChart,
  })),
)

// Module constants hold the translation key, not the copy: they are built once,
// before any language is known, while every call site has a `t`.
const COURSE_STATUS: Record<
  CourseStatus,
  { variant: 'default' | 'secondary' | 'outline'; labelKey: TKey }
> = {
  published: { variant: 'default', labelKey: 'common.published' },
  draft: { variant: 'secondary', labelKey: 'common.draft' },
  archived: { variant: 'outline', labelKey: 'dash.course.archived' },
}

const setupHiddenKey = (academyId: string) =>
  `hawary.dash.setup.hidden.${academyId}`

function initials(name: string | null) {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return parts
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('')
}

/** Never render the raw enum — 'bank_transfer' is not a label. */
function methodLabel(t: TFn, method: PaymentMethod) {
  return t(PAYMENT_METHOD_LABEL[method] ?? 'payments.method.other')
}

/** Non-archived courses, busiest first, with how much of each is live. */
function CourseReadinessList({
  courses,
  counts,
  content,
  pending,
}: {
  courses: CourseRow[]
  counts: Map<string, number> | undefined
  content: ContentReadiness
  /** Module readiness arrives after the course list does. */
  pending: boolean
}) {
  const { t, tn } = useT()
  return (
    <ul className="divide-y">
      {courses.map((c) => {
        const readiness = content.byCourse.get(c.id)
        const total = readiness?.total ?? 0
        const live = readiness?.live ?? 0
        const drafts = readiness?.drafts ?? 0
        return (
          <li key={c.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <Link
                to={`/courses/${c.id}`}
                className="truncate text-sm font-medium hover:underline"
              >
                {c.title}
              </Link>
              <Badge
                variant={COURSE_STATUS[c.status].variant}
                className="shrink-0 capitalize"
              >
                {t(COURSE_STATUS[c.status].labelKey)}
              </Badge>
            </div>

            {pending ? (
              // "No modules yet" is a claim, not a placeholder — don't make it
              // about a course whose modules simply haven't loaded.
              <div className="bg-muted mt-2 h-1.5 w-full rounded-full" />
            ) : total > 0 ? (
              <div className="mt-2 flex items-center gap-3">
                <Progress
                  value={Math.round((live / total) * 100)}
                  className="h-1.5 flex-1"
                />
                <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                  {t('dash.course.modules_live', { live, total })}
                </span>
              </div>
            ) : (
              // A 0% bar reads as failure rather than "not started yet".
              <p className="text-muted-foreground mt-2 text-xs">
                {t('dash.course.no_modules')}
              </p>
            )}

            <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums">
              <span className="flex items-center gap-1.5">
                <Users className="size-3.5 shrink-0" aria-hidden />
                {counts?.get(c.id) ?? 0}
                <span className="sr-only">{t('dash.course.sr.students')}</span>
              </span>
              <span className="flex items-center gap-1.5">
                <FileText className="size-3.5 shrink-0" aria-hidden />
                {countOf(c.notes)}
                <span className="sr-only">{t('dash.course.sr.notes')}</span>
              </span>
              <span className="flex items-center gap-1.5">
                <ClipboardList className="size-3.5 shrink-0" aria-hidden />
                {countOf(c.assessments)}
                <span className="sr-only">
                  {t('dash.course.sr.assessments')}
                </span>
              </span>
              <span className="flex items-center gap-1.5">
                <FileCheck2 className="size-3.5 shrink-0" aria-hidden />
                {countOf(c.assignments)}
                <span className="sr-only">
                  {t('dash.course.sr.assignments')}
                </span>
              </span>
              {drafts > 0 ? (
                <span className="text-amber-600 dark:text-amber-400">
                  {tn('dash.course.drafts', drafts)}
                </span>
              ) : null}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function inviteName(inv: PendingInvitationRow) {
  return inv.student?.full_name ?? inv.instructor?.full_name ?? inv.email
}

function daysUntil(iso: string) {
  return Math.ceil((Date.parse(iso) - Date.now()) / 86_400_000)
}

export function Dashboard() {
  const navigate = useNavigate()
  const { t, tn, lang } = useT()
  const { activeAcademyId, active, loading: academyLoading } = useAcademy()
  const isStaff = active?.role === 'admin' || active?.role === 'trainer'
  const isAdmin = active?.role === 'admin'

  const [addStudentOpen, setAddStudentOpen] = useState(false)
  const [invoiceOpen, setInvoiceOpen] = useState(false)
  const [hiddenAcademy, setHiddenAcademy] = useState<string | null>(null)

  // Core — these three gate the page.
  const students = useStudents(activeAcademyId)
  const courses = useCourses(activeAcademyId)
  const invoices = useInvoices(activeAcademyId)
  // Secondary — each resolves behind its own card.
  const studentCounts = useActiveStudentCounts(activeAcademyId)
  const readiness = useModuleReadiness(activeAcademyId)
  const invitations = usePendingInvitations(activeAcademyId)
  const activity = usePaymentActivity(activeAcademyId)
  // Admin-only: passing null disables the query, so a trainer never fires it.
  const settings = usePaymentSettings(isAdmin ? activeAcademyId : null)
  const reconciliation = useReconciliationCount(isAdmin ? activeAcademyId : null)

  const stats = useMemo(
    () => invoiceStats(invoices.data ?? []),
    [invoices.data],
  )
  const content = useMemo(
    () => contentReadiness(readiness.data ?? [], courses.data ?? []),
    [readiness.data, courses.data],
  )
  const people = useMemo(
    () => studentStats(students.data ?? []),
    [students.data],
  )
  const noCourse = useMemo(
    () => (students.data ?? []).filter((s) => s.enrollments.length === 0),
    [students.data],
  )
  // `lang` is a real dependency: the series carries its own month labels.
  const revenue = useMemo(
    () => revenueSeries(activity.data ?? [], invoices.data ?? [], lang),
    [activity.data, invoices.data, lang],
  )
  const revenueTotals = useMemo(
    () =>
      revenue.reduce(
        (t, p) => ({
          invoiced: t.invoiced + p.invoiced,
          collected: t.collected + p.collected,
        }),
        { invoiced: 0, collected: 0 },
      ),
    [revenue],
  )
  const collectedThisMonth = useMemo(
    () => collectedInMonth(activity.data ?? [], 0),
    [activity.data],
  )
  const collectedLastMonth = useMemo(
    () => collectedInMonth(activity.data ?? [], 1),
    [activity.data],
  )
  // Sum only the courses the "across N courses" sub-line counts. The
  // course_enrollment_stats view has no course-status filter, so an archived
  // course still holding active enrollments would inflate the numerator while
  // the denominator dropped.
  const activeEnrollments = useMemo(() => {
    const counts = studentCounts.data
    return (courses.data ?? [])
      .filter((c) => c.status !== 'archived')
      .reduce((sum, c) => sum + (counts?.get(c.id) ?? 0), 0)
  }, [courses.data, studentCounts.data])
  const courseCards = useMemo(() => {
    const counts = studentCounts.data
    return (courses.data ?? [])
      .filter((c) => c.status !== 'archived')
      .sort((a, b) => {
        const byStudents = (counts?.get(b.id) ?? 0) - (counts?.get(a.id) ?? 0)
        return byStudents !== 0
          ? byStudents
          : b.created_at.localeCompare(a.created_at)
      })
      .slice(0, 5)
  }, [courses.data, studentCounts.data])

  const courseRows = courses.data ?? []
  const invites = invitations.data ?? []
  const publishedCount = courseRows.filter((c) => c.status === 'published').length
  const draftCount = courseRows.filter((c) => c.status === 'draft').length
  const liveCourses = courseRows.filter((c) => c.status !== 'archived').length
  // isSuccess, not just a falsy read: "we haven't asked yet" and "the query
  // failed" are not the same as "the gateway is off", and an admin who has
  // connected ToyyibPay should never see the alarm flash on a cold load.
  const gatewayOff =
    settings.isSuccess && settings.data?.toyyibpay_enabled !== true
  const reconCount = reconciliation.data ?? 0

  // The setup checklist. Every step reads data the page already has, so it
  // costs nothing, and it removes itself for good once the academy is running.
  const steps: {
    label: string
    done: boolean
    cta: string
    to?: string
    onClick?: () => void
  }[] = [
    {
      label: t('dash.setup.step.course'),
      done: courseRows.length > 0,
      cta: t('nav.courses'),
      to: '/courses',
    },
    {
      label: t('dash.setup.step.module'),
      done: content.modulesTotal > 0,
      cta: t('nav.courses'),
      to: '/courses',
    },
    {
      label: t('dash.setup.step.student'),
      done: (students.data ?? []).length > 0,
      cta: t('dash.action.add_student'),
      onClick: () => setAddStudentOpen(true),
    },
    {
      label: t('dash.setup.step.enroll'),
      done: (students.data ?? []).some((s) => s.enrollments.length > 0),
      cta: t('nav.students'),
      to: '/students',
    },
    {
      label: t('dash.setup.step.publish'),
      done: publishedCount > 0,
      cta: t('nav.courses'),
      to: '/courses',
    },
    // Trainers cannot complete this one — set_toyyibpay_credentials rejects
    // them — so it leaves both the list and the denominator.
    ...(isAdmin
      ? [
          {
            label: t('dash.setup.step.gateway'),
            done: settings.data?.toyyibpay_enabled === true,
            cta: t('nav.settings'),
            to: '/settings',
          },
        ]
      : []),
  ]
  const stepsDone = steps.filter((s) => s.done).length
  const setupDismissed =
    (hiddenAcademy !== null && hiddenAcademy === activeAcademyId) ||
    (!!activeAcademyId &&
      localStorage.getItem(setupHiddenKey(activeAcademyId)) === '1')
  // Two steps read secondary queries. Until those land every established
  // academy briefly looks unfinished, so hold the whole card back rather than
  // flashing a checklist at someone who finished setting up months ago.
  const setupReady = !readiness.isLoading && (!isAdmin || !settings.isLoading)
  const checklistVisible =
    setupReady && !setupDismissed && stepsDone < steps.length

  const hideSetup = () => {
    if (!activeAcademyId) return
    localStorage.setItem(setupHiddenKey(activeAcademyId), '1')
    setHiddenAcademy(activeAcademyId)
  }

  const attentionTotal =
    stats.overdueCount + noCourse.length + invites.length + content.notLiveCount
  const soonestInvite = invites.reduce<number | null>((soonest, inv) => {
    const d = daysUntil(inv.expires_at)
    return soonest === null || d < soonest ? d : soonest
  }, null)

  const coreLoading =
    academyLoading ||
    !activeAcademyId ||
    students.isLoading ||
    courses.isLoading ||
    invoices.isLoading
  const coreError = students.error ?? courses.error ?? invoices.error
  // Two of the four attention numbers arrive after the page does. Hold the
  // headline count until they land rather than printing a total that visibly
  // corrects itself a moment later.
  const attentionPending = readiness.isLoading || invitations.isLoading

  // Long-form weekday date: `lib/format.ts` has no helper this shape, so the
  // locale is picked here from the same language the rest of the page uses.
  const todayLabel = new Date().toLocaleDateString(
    localeFor(lang),
    {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    },
  )

  const attentionLine =
    coreLoading || attentionPending
      ? t('dash.header.checking')
      : attentionTotal === 0
        ? t('dash.header.all_clear')
        : tn('dash.header.attention', attentionTotal)

  const header = (
    <PageHeader
      title={t('nav.dashboard')}
      description={t('dash.header.desc', {
        date: todayLabel,
        status: attentionLine,
      })}
    >
      {isStaff ? (
        <Button variant="outline" onClick={() => setAddStudentOpen(true)}>
          <UserPlus /> {t('dash.action.add_student')}
        </Button>
      ) : null}
      {isAdmin ? (
        <Button onClick={() => setInvoiceOpen(true)}>
          <Plus /> {t('dash.action.new_invoice')}
        </Button>
      ) : null}
    </PageHeader>
  )

  if (coreLoading) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        {header}
        <LoadingBlock label={t('dash.loading')} className="mt-6" />
      </div>
    )
  }

  if (coreError) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        {header}
        <ErrorBlock error={coreError} className="mt-6" />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      {header}

      {/* Setup checklist — the empty state for a brand-new academy */}
      {checklistVisible ? (
        <Card className="mt-6 gap-0 py-0">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 pb-3">
            <div>
              <h2 className="text-sm font-medium">{t('dash.setup.title')}</h2>
              <p className="text-muted-foreground mt-0.5 text-xs">
                {t('dash.setup.subtitle')}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold tabular-nums">
                {stepsDone}/{steps.length}
              </span>
              <Button variant="ghost" size="sm" onClick={hideSetup}>
                {t('dash.setup.hide')}
              </Button>
            </div>
          </div>
          <div className="px-4">
            <Progress
              value={Math.round((stepsDone / steps.length) * 100)}
              className="h-1.5"
            />
          </div>
          <ul className="mt-4 divide-y border-t">
            {steps.map((step) => (
              <li key={step.label} className="flex items-center gap-3 px-4 py-3">
                {step.done ? (
                  <CircleCheck className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <Circle className="text-muted-foreground size-4 shrink-0" />
                )}
                <span
                  className={cn(
                    'text-sm',
                    step.done
                      ? 'text-muted-foreground line-through decoration-1'
                      : 'font-medium',
                  )}
                >
                  {step.label}
                </span>
                {step.done ? null : step.to ? (
                  <Button
                    size="sm"
                    variant="outline"
                    asChild
                    className="ml-auto shrink-0"
                  >
                    <Link to={step.to}>{step.cta}</Link>
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={step.onClick}
                    className="ml-auto shrink-0"
                  >
                    {step.cta}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* Attention — the only numbers above the fold, each one a link to its fix */}
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label={t('common.overdue')}
          value={formatMYR(stats.overdue)}
          hint={
            stats.overdue === 0
              ? t('dash.tile.overdue.none')
              : tn('dash.tile.overdue.hint', stats.overdueCount, {
                  days: fmtDays(stats.oldestOverdueDays),
                })
          }
          icon={AlertTriangle}
          tone={stats.overdue === 0 ? 'muted' : 'danger'}
          to="/payments"
        />
        <StatTile
          label={t('dash.tile.no_course.label')}
          value={String(noCourse.length)}
          hint={
            noCourse.length === 0
              ? t('dash.tile.no_course.none')
              : t('dash.tile.no_course.hint')
          }
          icon={BookX}
          tone={noCourse.length === 0 ? 'muted' : 'accent'}
          to="/students?status=unenrolled"
        />
        <StatTile
          label={t('dash.tile.invites.label')}
          value={String(invites.length)}
          hint={
            invites.length === 0
              ? t('dash.tile.invites.none')
              : soonestInvite === null || soonestInvite > 7
                ? t('dash.tile.invites.far')
                : soonestInvite <= 0
                  ? t('dash.tile.invites.today')
                  : t('dash.tile.invites.soonest', {
                      days: fmtDays(soonestInvite),
                    })
          }
          icon={MailQuestion}
          tone={invites.length === 0 ? 'muted' : 'warning'}
          to="/students"
        />
        <StatTile
          label={t('dash.tile.not_live.label')}
          value={String(content.notLiveCount)}
          hint={
            content.notLiveCount === 0
              ? t('dash.tile.not_live.none')
              : t('dash.tile.not_live.hint')
          }
          icon={EyeOff}
          tone={content.notLiveCount === 0 ? 'muted' : 'info'}
          to="/courses"
        />
      </div>

      {/* Admin alerts — only the things a trainer could not resolve */}
      {isAdmin && (reconCount > 0 || (gatewayOff && !checklistVisible)) ? (
        <div className="mt-4 space-y-3">
          {reconCount > 0 ? (
            <Card className="border-destructive/40 bg-destructive/5 flex-row items-start gap-3 p-4">
              <div className="bg-background flex size-9 shrink-0 items-center justify-center rounded-lg">
                <ShieldAlert className="text-destructive size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {tn('dash.alert.recon.title', reconCount)}
                </p>
                <p className="text-muted-foreground mt-0.5 text-sm">
                  {t('dash.alert.recon.body')}
                </p>
              </div>
              <Button asChild variant="outline" size="sm" className="shrink-0">
                <Link to="/payments">{t('dash.alert.recon.cta')}</Link>
              </Button>
            </Card>
          ) : null}

          {/* Suppressed while the checklist is up — step 6 already says this. */}
          {gatewayOff && !checklistVisible ? (
            <Card className="flex-row items-start gap-3 border-amber-500/40 bg-amber-500/5 p-4 dark:border-amber-400/30 dark:bg-amber-400/5">
              <div className="bg-background flex size-9 shrink-0 items-center justify-center rounded-lg">
                <CreditCard className="size-4 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {t('dash.alert.gateway.title')}
                </p>
                <p className="text-muted-foreground mt-0.5 text-sm">
                  {t('dash.alert.gateway.body')}
                </p>
              </div>
              <Button asChild variant="outline" size="sm" className="shrink-0">
                <Link to="/settings">{t('dash.alert.gateway.cta')}</Link>
              </Button>
            </Card>
          ) : null}
        </div>
      ) : null}

      {/* Health — how big are we, deliberately below the exceptions */}
      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label={t('common.students')}
          value={String(people.total)}
          sub={t('dash.stat.students.sub', {
            active: people.active,
            trial: people.trial,
          })}
          icon={Users}
        />
        <StatCard
          label={t('dash.stat.enrollments.label')}
          value={String(activeEnrollments)}
          sub={tn('dash.stat.enrollments.sub', liveCourses)}
          icon={GraduationCap}
        />
        <StatCard
          label={t('dash.stat.published.label')}
          value={String(publishedCount)}
          sub={t('dash.stat.published.sub', {
            drafts: draftCount,
            live: content.modulesLive,
            total: content.modulesTotal,
          })}
          icon={BookOpen}
        />
        <StatCard
          label={t('dash.stat.collected.label')}
          value={formatMYR(collectedThisMonth)}
          sub={
            activity.data === undefined
              ? '—'
              : collectedThisMonth === collectedLastMonth
                ? t('dash.stat.collected.same')
                : t('dash.stat.collected.delta', {
                    delta: `${
                      collectedThisMonth > collectedLastMonth ? '+' : '−'
                    }${formatMYR(
                      Math.abs(collectedThisMonth - collectedLastMonth),
                    )}`,
                  })
          }
          icon={Wallet}
          tone="positive"
        />
      </div>

      {/* Revenue overview */}
      <div className="mt-8">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-medium">{t('dash.revenue.title')}</h2>
            <p className="text-muted-foreground mt-0.5 text-xs">
              {t('dash.revenue.description', { months: REVENUE_MONTHS })}
            </p>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link to="/payments">
              {t('dash.view_all')} <ChevronRight />
            </Link>
          </Button>
        </div>

        <Card className="gap-4 p-4">
          <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2">
            <div>
              <p className="text-muted-foreground text-xs">
                {t('dash.revenue.collected_window', { months: REVENUE_MONTHS })}
              </p>
              <p className="text-lg font-semibold tabular-nums">
                {/* The ledger arrives after the invoice book — don't print a
                    confident RM 0.00 in the meantime. */}
                {activity.isLoading
                  ? '—'
                  : formatMYR(revenueTotals.collected)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">
                {t('dash.revenue.invoiced_window', { months: REVENUE_MONTHS })}
              </p>
              <p className="text-lg font-semibold tabular-nums">
                {formatMYR(revenueTotals.invoiced)}
              </p>
            </div>
          </div>

          {activity.isLoading ? (
            <div className="text-muted-foreground flex h-56 items-center justify-center text-sm">
              {t('dash.revenue.loading')}
            </div>
          ) : activity.error ? (
            <div className="text-destructive flex h-56 items-center justify-center text-sm">
              {activity.error.message}
            </div>
          ) : revenueTotals.invoiced === 0 && revenueTotals.collected === 0 ? (
            <div className="flex h-56 flex-col items-center justify-center gap-3 text-center">
              <Wallet className="text-muted-foreground size-6" aria-hidden />
              <div>
                <p className="text-sm font-medium">
                  {t('dash.revenue.empty.title')}
                </p>
                <p className="text-muted-foreground mt-1 text-sm">
                  {t('dash.revenue.empty.body', { months: REVENUE_MONTHS })}
                </p>
              </div>
              {isAdmin ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setInvoiceOpen(true)}
                >
                  <Plus /> {t('dash.revenue.empty.cta')}
                </Button>
              ) : null}
            </div>
          ) : (
            <Suspense
              fallback={
                <div className="text-muted-foreground flex h-56 items-center justify-center text-sm">
                  {t('dash.revenue.chart_loading')}
                </div>
              }
            >
              <RevenueChart data={revenue} />
            </Suspense>
          )}
        </Card>
      </div>

      {/* Work queues */}
      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <Card className="gap-0 py-0">
          <div className="flex items-center justify-between gap-2 border-b p-4">
            <h2 className="text-sm font-medium">{t('dash.people.title')}</h2>
            <Button asChild variant="ghost" size="sm">
              <Link to="/students?status=unenrolled">{t('dash.view_all')}</Link>
            </Button>
          </div>

          {noCourse.length === 0 ? (
            <div className="p-4">
              {(students.data ?? []).length === 0 ? (
                <div className="py-2 text-center">
                  <p className="text-muted-foreground text-sm">
                    {t('dash.people.no_students')}
                  </p>
                  {isStaff ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => setAddStudentOpen(true)}
                    >
                      <UserPlus /> {t('dash.people.add_first')}
                    </Button>
                  ) : null}
                </div>
              ) : (
                <p className="text-muted-foreground py-2 text-center text-sm">
                  {t('dash.people.all_enrolled')}
                </p>
              )}
            </div>
          ) : (
            <ul className="divide-y">
              {noCourse.slice(0, 5).map((s) => (
                <li key={s.id}>
                  <Link
                    to={`/students/${s.id}`}
                    className="hover:bg-accent flex items-center gap-3 p-4 transition-colors"
                  >
                    <Avatar className="size-8">
                      <AvatarImage src={s.avatar_url ?? undefined} alt="" />
                      <AvatarFallback className="text-xs">
                        {initials(s.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {s.full_name ?? t('common.unnamed')}
                      </p>
                      <p className="text-muted-foreground truncate text-xs">
                        {t('dash.people.joined', {
                          no: s.student_no,
                          date: fmtDate(s.created_at),
                        })}
                      </p>
                    </div>
                    <Badge
                      variant={STATUS_META[s.status].variant}
                      className="shrink-0"
                    >
                      {t(STATUS_META[s.status].labelKey)}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <div className="border-t p-4">
            <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              {t('dash.invites.title')}
            </h3>
            {invitations.isLoading ? (
              <p className="text-muted-foreground mt-3 text-sm">
                {t('dash.invites.loading')}
              </p>
            ) : invitations.error ? (
              <p className="text-destructive mt-3 text-sm">
                {invitations.error.message}
              </p>
            ) : invites.length === 0 ? (
              <div className="mt-3">
                <p className="text-muted-foreground text-sm">
                  {t('dash.invites.empty')}
                </p>
                {isStaff ? (
                  <Button variant="outline" size="sm" asChild className="mt-3">
                    <Link to="/students">
                      <UserPlus /> {t('dash.invites.cta')}
                    </Link>
                  </Button>
                ) : null}
              </div>
            ) : (
              <ul className="mt-3 space-y-3">
                {invites.slice(0, 4).map((inv) => {
                  const left = daysUntil(inv.expires_at)
                  return (
                    <li key={inv.id} className="flex items-center gap-3">
                      <div className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-lg">
                        <Mail className="text-muted-foreground size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {inviteName(inv)}
                        </p>
                        <p className="text-muted-foreground truncate text-xs">
                          {inv.email}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <Badge variant="outline">
                          {t(
                            inv.role === 'student'
                              ? 'common.student'
                              : 'common.instructor',
                          )}
                        </Badge>
                        <p
                          className={cn(
                            'mt-0.5 text-xs tabular-nums',
                            left <= 3
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-muted-foreground',
                          )}
                        >
                          {left <= 0
                            ? t('dash.invites.expires_today')
                            : t('dash.invites.expires_in', {
                                days: fmtDays(left),
                              })}
                        </p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </Card>

        <Card className="gap-0 py-0">
          <div className="flex items-center justify-between gap-2 border-b p-4">
            <h2 className="text-sm font-medium">{t('dash.courses.title')}</h2>
            <Button asChild variant="ghost" size="sm">
              <Link to="/courses">
                {t('dash.courses.all')} <ChevronRight />
              </Link>
            </Button>
          </div>
          {courseCards.length === 0 ? (
            <div className="flex min-h-[14rem] flex-col items-center justify-center gap-3 px-6 text-center">
              <Layers className="text-muted-foreground size-6" aria-hidden />
              <div>
                <p className="text-sm font-medium">
                  {t('dash.courses.empty.title')}
                </p>
                <p className="text-muted-foreground mt-1 text-sm">
                  {t('dash.courses.empty.body')}
                </p>
              </div>
              {isStaff ? (
                <Button variant="outline" asChild>
                  <Link to="/courses">
                    <Plus /> {t('dash.courses.empty.cta')}
                  </Link>
                </Button>
              ) : null}
            </div>
          ) : (
            <CourseReadinessList
              courses={courseCards}
              counts={studentCounts.data}
              content={content}
              pending={readiness.isLoading}
            />
          )}
        </Card>
      </div>

      {/* Recent payments — the payoff for a clear morning */}
      <div className="mt-8">
        <h2 className="text-sm font-medium">{t('dash.payments.title')}</h2>
        <p className="text-muted-foreground mb-3 text-xs">
          {t('dash.payments.subtitle')}
        </p>
        <Card className="gap-0 py-0">
          {activity.isLoading ? (
            <div className="text-muted-foreground p-8 text-center text-sm">
              {t('dash.payments.loading')}
            </div>
          ) : activity.error ? (
            <div className="text-destructive p-8 text-center text-sm">
              {activity.error.message}
            </div>
          ) : (activity.data ?? []).length === 0 ? (
            <p className="text-muted-foreground p-8 text-center text-sm">
              {t('dash.payments.empty')}
            </p>
          ) : (
            <ul className="divide-y">
              {(activity.data ?? []).slice(0, 5).map((p) => (
                <li key={p.id} className="flex items-center gap-3 p-4">
                  <div className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-lg">
                    <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {p.student?.full_name ?? '—'}
                    </p>
                    <p className="text-muted-foreground truncate text-xs">
                      {p.invoice?.invoice_no ?? '—'} · {fmtDate(p.paid_at)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-medium tabular-nums">
                      {formatMYR(p.amount_sen)}
                    </p>
                    <Badge variant="outline" className="mt-0.5">
                      {methodLabel(t, p.method)}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {activeAcademyId ? (
        <>
          <StudentFormDialog
            academyId={activeAcademyId}
            open={addStudentOpen}
            onOpenChange={setAddStudentOpen}
          />
          {isAdmin ? (
            <InvoiceFormDialog
              academyId={activeAcademyId}
              open={invoiceOpen}
              onOpenChange={setInvoiceOpen}
              onCreated={(id) => navigate(`/payments/${id}`)}
            />
          ) : null}
        </>
      ) : null}
    </div>
  )
}
