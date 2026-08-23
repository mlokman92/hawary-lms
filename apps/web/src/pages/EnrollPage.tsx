import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { formatMYR } from '@hawary/shared'
import { useAcademy } from '@/lib/academy'
import { useAuth } from '@/lib/auth'
import { clearEnrollIntent, enrollPath, setEnrollIntent } from '@/lib/enrollIntent'
import { fmtDate } from '@/lib/format'
import { useT } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { PublicShell } from '@/features/enrollment/PublicShell'
import {
  seatsLeft,
  useAcademyEnrollment,
  useJoinAcademy,
} from '@/features/enrollment/api'
import { errorMessage } from '@/lib/errors'

/**
 * The academy's one public join link.
 *
 * Picking a course IS the intent to join, so this page does both in a single
 * call: `join_academy` creates the student record and the membership, and files
 * the course as a pending enrolment. The person lands on their dashboard a
 * member, with no course open yet.
 *
 * Signed out, the intent is stashed before handing over to /signup or /signin —
 * `?next=` alone is not enough, because GoTrue drops it whenever the redirect
 * allow list does not cover the URL and the confirmation link then arrives with
 * nothing to say where the person was going.
 */
export function EnrollPage() {
  const { t, tn } = useT()
  const navigate = useNavigate()
  const { slug } = useParams<{ slug: string }>()
  const { session, loading: authLoading } = useAuth()
  const { memberships, refresh } = useAcademy()

  const { data, isLoading, error } = useAcademyEnrollment(slug)
  const join = useJoinAcademy()
  const [courseId, setCourseId] = useState('')
  const [failure, setFailure] = useState<string | null>(null)

  const here = slug ? enrollPath(slug) : '/'

  // Written on arrival, not on the button: someone who opens the link, wanders
  // off to sign in through another tab and comes back must still be recognised
  // as mid-join.
  useEffect(() => {
    if (slug) setEnrollIntent(slug)
  }, [slug])

  const membership = data
    ? memberships.find((m) => m.academyId === data.academy.id)
    : undefined
  const isStaffHere = !!membership && membership.role !== 'student'

  async function submit() {
    if (!slug || !courseId) return
    setFailure(null)
    try {
      await join.mutateAsync({ slug, courseId })
      clearEnrollIntent()
      // Memberships gate every route; refresh before handing over or the shell
      // still thinks this account belongs nowhere.
      await refresh()
      navigate('/learn', { replace: true })
    } catch (e) {
      setFailure(errorMessage(e, t('common.error')))
    }
  }

  if (isLoading || authLoading) {
    return (
      <PublicShell>
        <p className="text-muted-foreground py-16 text-center text-sm">
          {t('common.loading')}
        </p>
      </PublicShell>
    )
  }

  if (error || !data) {
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

  if (!data.is_open) {
    return (
      <PublicShell academy={data.academy}>
        <Card>
          <CardHeader>
            <CardTitle>{t('enroll.closed.title')}</CardTitle>
            <CardDescription>{t('enroll.closed.body')}</CardDescription>
          </CardHeader>
        </Card>
      </PublicShell>
    )
  }

  if (isStaffHere) {
    return (
      <PublicShell academy={data.academy}>
        <Card>
          <CardHeader>
            <CardDescription>{t('enroll.already_staff')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/">{t('enroll.go_dashboard')}</Link>
            </Button>
          </CardContent>
        </Card>
      </PublicShell>
    )
  }

  return (
    <PublicShell academy={data.academy}>
      <Card>
        <CardHeader>
          <CardTitle>{t('enroll.page.title')}</CardTitle>
          <CardDescription>{t('enroll.page.subtitle')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {data.intro ? (
            <p className="text-sm whitespace-pre-wrap">{data.intro}</p>
          ) : null}

          {data.courses.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {t('enroll.no_courses')}
            </p>
          ) : (
            <>
              <Label>{t('enroll.choose')}</Label>
              <RadioGroup value={courseId} onValueChange={setCourseId} className="gap-2">
                {data.courses.map((c) => {
                  const left = seatsLeft(c.capacity, c.seats_taken)
                  const meta = [
                    c.code,
                    c.price_sen > 0
                      ? formatMYR(c.price_sen)
                      : t('enroll.price_free'),
                    left === null
                      ? t('enroll.seats.enrolled', { count: c.seats_taken })
                      : tn('enroll.seats.left', left),
                    c.closes_at
                      ? t('enroll.closes', { date: fmtDate(c.closes_at) })
                      : null,
                  ].filter(Boolean)
                  return (
                    <Label
                      key={c.id}
                      htmlFor={c.id}
                      className="hover:bg-accent has-[:checked]:border-primary flex cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal transition-colors"
                    >
                      <RadioGroupItem value={c.id} id={c.id} className="mt-0.5" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">
                          {c.title}
                        </span>
                        <span className="text-muted-foreground block text-xs">
                          {meta.join(' · ')}
                        </span>
                        {c.description ? (
                          <span className="text-muted-foreground mt-1 line-clamp-2 block text-xs">
                            {c.description}
                          </span>
                        ) : null}
                      </span>
                    </Label>
                  )
                })}
              </RadioGroup>

              {failure ? (
                <p className="text-destructive text-sm">{failure}</p>
              ) : null}

              {session ? (
                <Button
                  className="w-full"
                  disabled={!courseId || join.isPending}
                  onClick={() => void submit()}
                >
                  {join.isPending ? t('enroll.joining') : t('enroll.join')}
                </Button>
              ) : (
                <div className="grid gap-2">
                  <Button asChild className="w-full">
                    <Link to={`/signup?next=${encodeURIComponent(here)}`}>
                      {t('enroll.cta.create_account')}
                    </Link>
                  </Button>
                  <p className="text-muted-foreground text-center text-sm">
                    {t('enroll.cta.have_account')}{' '}
                    <Link
                      to={`/signin?next=${encodeURIComponent(here)}`}
                      className="text-primary font-medium underline-offset-4 hover:underline"
                    >
                      {t('enroll.cta.sign_in')}
                    </Link>
                  </p>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </PublicShell>
  )
}
