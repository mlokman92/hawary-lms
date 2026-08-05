import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CalendarClock, CheckCircle2, Users, XCircle } from 'lucide-react'
import { formatMYR } from '@hawary/shared'
import { useAuth } from '@/lib/auth'
import { useAcademy } from '@/lib/academy'
import { fmtDate } from '@/lib/format'
import { useT } from '@/lib/i18n'
import {
  clearEnrollDraft,
  enrollDirectoryPath,
  readEnrollDraft,
  setEnrollDraft,
} from '@/lib/enrollDraft'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { PublicShell } from '@/features/enrollment/PublicShell'
import { ApplyForm, type ApplyValues } from '@/features/enrollment/ApplyForm'
import {
  seatsLeft,
  useApplyToCourse,
  useEnrollmentPage,
  useMyApplication,
  useWithdrawApplication,
  type ApplicantField,
} from '@/features/enrollment/api'

/**
 * The public enrollment page for one course — the link that goes on a poster.
 *
 * Viewing it needs no account; applying does. A signed-out visitor still gets
 * the whole form, and their answers are stashed before the /signup hop so they
 * come back to a filled one (lib/enrollDraft.ts).
 */
export function EnrollCoursePage() {
  const { t, tn } = useT()
  const navigate = useNavigate()
  const { slug, courseId } = useParams<{ slug: string; courseId: string }>()
  const { session, user, loading: authLoading } = useAuth()
  const { memberships, refresh } = useAcademy()

  const { data: page, isLoading, error } = useEnrollmentPage(slug, courseId)
  const {
    data: application,
    isLoading: applicationLoading,
    refetch: refetchApplication,
  } = useMyApplication(courseId, user?.id)
  const apply = useApplyToCourse(courseId)
  const withdraw = useWithdrawApplication(courseId)
  const [failure, setFailure] = useState<string | null>(null)

  const here = `/enroll/${encodeURIComponent(slug ?? '')}/${courseId ?? ''}`

  // A membership of any role means the back-office already knows this person;
  // apply_to_course rejects staff, so say so before they fill anything in.
  const isStaffHere = useMemo(() => {
    if (!page) return false
    return memberships.some(
      (m) => m.academyId === page.academy.id && m.role !== 'student',
    )
  }, [memberships, page])

  // An approval happened while they were away: memberships gate every route, so
  // refresh before offering the link into /learn.
  useEffect(() => {
    if (application?.status === 'approved') void refresh()
  }, [application?.status, refresh])

  const initialValues: ApplyValues = useMemo(() => {
    const draft = courseId ? readEnrollDraft(courseId) : null
    const meta = (user?.user_metadata ?? {}) as Record<string, unknown>
    return {
      full_name: String(meta.full_name ?? ''),
      email: user?.email ?? '',
      phone: String(meta.phone ?? ''),
      ...(draft ?? {}),
    }
  }, [courseId, user])

  async function submit(values: ApplyValues) {
    setFailure(null)
    if (!session) {
      // Keep what they typed, then send them through sign-up and straight back.
      if (courseId) setEnrollDraft(courseId, values)
      navigate(`/signup?next=${encodeURIComponent(here)}`)
      return
    }
    try {
      await apply.mutateAsync(values)
      clearEnrollDraft()
      await refetchApplication()
    } catch (e) {
      setFailure(e instanceof Error ? e.message : t('common.error'))
    }
  }

  if (isLoading || authLoading || (!!session && applicationLoading)) {
    return (
      <PublicShell>
        <p className="text-muted-foreground py-16 text-center text-sm">
          {t('common.loading')}
        </p>
      </PublicShell>
    )
  }

  if (error || !page) {
    return (
      <PublicShell>
        <Card>
          <CardHeader>
            <CardTitle>{t('enroll.unavailable.title')}</CardTitle>
            <CardDescription>{t('enroll.unavailable.body')}</CardDescription>
          </CardHeader>
        </Card>
      </PublicShell>
    )
  }

  const left = seatsLeft(page.capacity, page.seats_taken)
  const isFull = left === 0
  const live = application?.status === 'pending' ? application : null
  const decided =
    application && application.status !== 'pending' ? application : null

  const meta = [
    page.course.code,
    page.course.price_sen > 0
      ? formatMYR(page.course.price_sen)
      : t('enroll.price_free'),
  ].filter(Boolean)

  return (
    <PublicShell academy={page.academy}>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="text-xl">{page.course.title}</CardTitle>
              {meta.length ? (
                <CardDescription className="mt-1">
                  {meta.join(' · ')}
                </CardDescription>
              ) : null}
            </div>
            {!page.is_open ? (
              <Badge variant="secondary" className="shrink-0">
                {t('enroll.closed.title')}
              </Badge>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="grid gap-3">
          {page.course.description ? (
            <p className="text-sm whitespace-pre-wrap">
              {page.course.description}
            </p>
          ) : null}
          {page.intro ? (
            <p className="text-muted-foreground text-sm whitespace-pre-wrap">
              {page.intro}
            </p>
          ) : null}

          <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 text-xs">
            <span className="flex items-center gap-1.5">
              <Users className="size-3.5" aria-hidden />
              {left === null
                ? t('enroll.seats.enrolled', { count: page.seats_taken })
                : tn('enroll.seats.left', left)}
            </span>
            {page.closes_at ? (
              <span className="flex items-center gap-1.5">
                <CalendarClock className="size-3.5" aria-hidden />
                {t(page.is_open ? 'enroll.closes' : 'enroll.closed_on', {
                  date: fmtDate(page.closes_at),
                })}
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* Decided applications come first: the answer is what they came back for. */}
      {decided ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              {decided.status === 'approved' ? (
                <CheckCircle2 className="text-primary size-4" aria-hidden />
              ) : (
                <XCircle className="text-muted-foreground size-4" aria-hidden />
              )}
              {t(
                decided.status === 'approved'
                  ? 'enroll.approved.title'
                  : decided.status === 'rejected'
                    ? 'enroll.rejected.title'
                    : 'enroll.withdrawn.title',
              )}
            </CardTitle>
            {decided.status !== 'withdrawn' ? (
              <CardDescription>
                {t(
                  decided.status === 'approved'
                    ? 'enroll.approved.body'
                    : 'enroll.rejected.body',
                )}
              </CardDescription>
            ) : null}
          </CardHeader>
          <CardContent className="grid gap-3">
            {decided.review_note ? (
              <div className="bg-muted rounded-md border p-3 text-sm">
                <p className="text-muted-foreground mb-1 text-xs font-medium">
                  {t('enroll.review_note')}
                </p>
                {decided.review_note}
              </div>
            ) : null}
            {decided.status === 'approved' ? (
              <Button asChild>
                <Link to="/learn">{t('enroll.approved.go')}</Link>
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {live ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t('enroll.applied.title')}
            </CardTitle>
            <CardDescription>{t('enroll.applied.body')}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-muted-foreground text-xs">
              {t('enroll.applied.on', { date: fmtDate(live.created_at) })}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={withdraw.isPending}
              onClick={() => {
                setFailure(null)
                withdraw.mutate(live.id, {
                  onError: (e) =>
                    setFailure(e instanceof Error ? e.message : t('common.error')),
                })
              }}
            >
              {withdraw.isPending
                ? t('enroll.withdrawing')
                : t('enroll.withdraw')}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {/* The form: only when there is nothing live and the intake is open. */}
      {!live && page.is_open && !isStaffHere ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {decided ? t('enroll.reapply') : t('enroll.form.title')}
            </CardTitle>
            <CardDescription>
              {session ? t('enroll.form.description') : t('enroll.cta.body')}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {isFull ? (
              <p className="bg-muted text-muted-foreground rounded-md border p-3 text-sm">
                {t('enroll.seats.full', { count: page.capacity ?? 0 })}
              </p>
            ) : null}
            <ApplyForm
              requiredFields={page.required_fields as ApplicantField[]}
              initialValues={initialValues}
              busy={apply.isPending}
              error={failure}
              submitLabel={
                session
                  ? t('enroll.form.submit')
                  : t('enroll.cta.create_account')
              }
              onSubmit={(values) => void submit(values)}
            />
            {!session ? (
              <p className="text-muted-foreground text-center text-sm">
                {t('enroll.cta.have_account')}{' '}
                <Link
                  to={`/signin?next=${encodeURIComponent(here)}`}
                  className="text-primary font-medium underline-offset-4 hover:underline"
                >
                  {t('enroll.cta.sign_in')}
                </Link>
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {!live && !decided && !page.is_open ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t('enroll.closed.title')}
            </CardTitle>
            <CardDescription>{t('enroll.closed.body')}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {isStaffHere ? (
        <p className="text-muted-foreground text-center text-sm">
          {t('enroll.cta.staff')}
        </p>
      ) : null}

      <p className="text-center text-sm">
        <Link
          to={enrollDirectoryPath(page.academy.slug)}
          className="text-muted-foreground underline-offset-4 hover:underline"
        >
          {t('enroll.view_courses')}
        </Link>
      </p>
    </PublicShell>
  )
}
