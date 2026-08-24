import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ExternalLink, Search, SlidersHorizontal, UserPlus } from 'lucide-react'
import { useAcademy } from '@/lib/academy'
import { enrollPath } from '@/lib/enrollIntent'
import { errorMessage } from '@/lib/errors'
import { fmtDate } from '@/lib/format'
import { useT } from '@/lib/i18n'
import { PageHeader } from '@/components/patterns/PageHeader'
import { EmptyState } from '@/components/patterns/EmptyState'
import { ErrorBlock, LoadingBlock } from '@/components/patterns/QueryState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { InviteLink } from '@/features/students/InviteLink'
import { BulkEnrollDialog } from '@/features/enrollment/BulkEnrollDialog'
import { CourseLimitsDialog } from '@/features/enrollment/CourseLimitsDialog'
import {
  ENROLLMENT_STATUS_LABEL,
  useAcademyEnrollmentSettings,
  useApproveEnrollment,
  useCourseOpenings,
  useEnrollmentRequests,
  useRejectEnrollment,
  useSaveAcademyEnrollment,
  useSaveCourseOpening,
  type CourseOpening,
} from '@/features/enrollment/api'

type Filter = 'pending' | 'enrolled' | 'all'

/**
 * Everything about getting people into the academy and onto a course.
 *
 * It lives here rather than on the course page because the link is one per
 * academy, and because a course page should be about the course. The three
 * blocks are the three questions: is the door open, which courses can be picked,
 * and who is waiting.
 */
export function EnrollmentsPage() {
  const { t } = useT()
  const { activeAcademyId, active, memberships } = useAcademy()
  const academyId = activeAcademyId ?? ''
  const isAdmin = active?.role === 'admin'
  const slug =
    memberships.find((m) => m.academyId === activeAcademyId)?.academy?.slug ?? ''

  const { data: settings } = useAcademyEnrollmentSettings(activeAcademyId)
  const { data: openings } = useCourseOpenings(activeAcademyId)
  const { data: requests, isLoading, error } = useEnrollmentRequests(activeAcademyId)
  const saveAcademy = useSaveAcademyEnrollment(academyId)
  const saveOpening = useSaveCourseOpening(academyId)
  const approve = useApproveEnrollment(activeAcademyId)
  const reject = useRejectEnrollment(activeAcademyId)

  // The only new element on this page. Until now a failed approve was entirely
  // silent — there was no onError anywhere here — so this carries the approval
  // failure as well as the email one.
  const [problem, setProblem] = useState<string | null>(null)
  const busy = approve.isPending || reject.isPending

  const [intro, setIntro] = useState('')
  const [limitsFor, setLimitsFor] = useState<CourseOpening | null>(null)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('pending')

  // Course lives in the URL so other pages can deep-link into it.
  const [params, setParams] = useSearchParams()
  const course = params.get('course') ?? 'all'
  const setCourse = (id: string) =>
    setParams(id === 'all' ? {} : { course: id }, { replace: true })

  useEffect(() => setIntro(settings?.intro ?? ''), [settings])

  const url = slug ? `${window.location.origin}${enrollPath(slug)}` : null
  const courses = useMemo(
    () => (openings ?? []).map((c) => ({ id: c.id, title: c.title })),
    [openings],
  )

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (requests ?? []).filter((r) => {
      if (course !== 'all' && r.course_id !== course) return false
      if (filter === 'pending' && r.status !== 'pending') return false
      if (filter === 'enrolled' && r.status !== 'active') return false
      if (!q) return true
      return [
        r.students?.full_name,
        r.students?.email,
        r.students?.phone,
        r.courses?.title,
      ].some((v) => v?.toLowerCase().includes(q))
    })
  }, [requests, course, filter, search])

  const pendingCount = (requests ?? []).filter(
    (r) => r.status === 'pending',
  ).length

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader
        title={t('nav.enrollments')}
        description={t('enroll.staff.subtitle')}
      >
        <Button variant="outline" onClick={() => setBulkOpen(true)}>
          <UserPlus /> {t('enroll.bulk.action')}
        </Button>
      </PageHeader>

      {/* 1 — the door */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{t('enroll.link.title')}</CardTitle>
          <CardDescription>{t('enroll.link.description')}</CardDescription>
          <CardAction>
            <Switch
              checked={!!settings?.is_open}
              disabled={!isAdmin || saveAcademy.isPending}
              onCheckedChange={(v) => saveAcademy.mutate({ is_open: v })}
              aria-label={t('enroll.link.open')}
            />
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-3">
          {settings?.is_open && url ? (
            <>
              <InviteLink url={url} />
              <div className="grid gap-2">
                <Label htmlFor="enroll-intro">{t('enroll.link.intro')}</Label>
                <Textarea
                  id="enroll-intro"
                  rows={2}
                  placeholder={t('enroll.link.intro_placeholder')}
                  value={intro}
                  disabled={!isAdmin}
                  onChange={(e) => setIntro(e.target.value)}
                  onBlur={() => {
                    if (!isAdmin) return
                    const next = intro.trim() || null
                    if (next !== (settings?.intro ?? null)) {
                      saveAcademy.mutate({ intro: next })
                    }
                  }}
                />
              </div>
              <Button asChild variant="outline" size="sm" className="justify-self-start">
                <a href={enrollPath(slug)} target="_blank" rel="noreferrer">
                  <ExternalLink /> {t('enroll.link.preview')}
                </a>
              </Button>
            </>
          ) : (
            <p className="text-muted-foreground text-sm">
              {isAdmin ? t('enroll.link.closed_note') : t('enroll.link.admin_only')}
            </p>
          )}
        </CardContent>
      </Card>

      {/* 2 — which courses can be picked */}
      <Card className="mt-6 gap-0 pb-0">
        <CardHeader className="pb-4">
          <CardTitle>{t('enroll.courses.title')}</CardTitle>
          <CardDescription>{t('enroll.courses.description')}</CardDescription>
        </CardHeader>
        {(openings ?? []).length === 0 ? (
          <p className="text-muted-foreground border-t px-6 py-6 text-sm">
            {t('enroll.courses.empty')}
          </p>
        ) : (
          <ul className="divide-y border-t">
            {(openings ?? []).map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-6 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.title}</p>
                  <p className="text-muted-foreground truncate text-xs">
                    {[
                      c.status !== 'published' ? t('common.draft') : null,
                      c.capacity != null
                        ? t('enroll.courses.seats_capped', {
                            taken: c.seatsTaken,
                            capacity: c.capacity,
                          })
                        : t('enroll.courses.seats_uncapped', {
                            taken: c.seatsTaken,
                          }),
                      c.closesAt
                        ? t('enroll.closes', { date: fmtDate(c.closesAt) })
                        : t('enroll.courses.no_deadline'),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setLimitsFor(c)}
                >
                  <SlidersHorizontal /> {t('enroll.courses.limits')}
                </Button>
                <Switch
                  checked={c.isOpen}
                  disabled={c.status !== 'published' || saveOpening.isPending}
                  onCheckedChange={(v) =>
                    saveOpening.mutate({ courseId: c.id, is_open: v })
                  }
                  aria-label={c.title}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* 3 — who is waiting */}
      <div className="mt-8">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-56 flex-1">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('enroll.requests.search_placeholder')}
              className="pl-8"
            />
          </div>
          <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">
                {t('enroll.requests.pending')}
                {pendingCount > 0 ? ` (${pendingCount})` : ''}
              </SelectItem>
              <SelectItem value="enrolled">
                {t('enroll.requests.enrolled')}
              </SelectItem>
              <SelectItem value="all">{t('common.all')}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={course} onValueChange={setCourse}>
            <SelectTrigger className="w-56" aria-label={t('common.course')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('common.all_courses')}</SelectItem>
              {courses.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {problem ? (
          <p className="text-destructive mb-3 text-sm">{problem}</p>
        ) : null}

        {isLoading ? (
          <LoadingBlock />
        ) : error ? (
          <ErrorBlock error={error} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={UserPlus}
            title={
              (requests ?? []).length
                ? t('enroll.requests.no_match')
                : t('enroll.requests.empty')
            }
            body={
              (requests ?? []).length ? undefined : t('enroll.requests.empty_hint')
            }
          />
        ) : (
          <Card className="gap-0 py-0">
            <ul className="divide-y">
              {rows.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {r.students?.full_name ?? r.students?.student_no ?? '—'}
                    </p>
                    <p className="text-muted-foreground truncate text-xs">
                      {[r.courses?.title, r.students?.email, r.students?.phone]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <span className="text-muted-foreground hidden w-24 shrink-0 text-right text-xs tabular-nums md:block">
                    {fmtDate(r.created_at)}
                  </span>
                  {r.status === 'pending' ? (
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => {
                          setProblem(null)
                          reject.mutate(r.id, {
                            onError: (e) =>
                              setProblem(
                                errorMessage(e, t('enroll.requests.failed')),
                              ),
                          })
                        }}
                      >
                        {t('enroll.requests.reject')}
                      </Button>
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => {
                          setProblem(null)
                          approve.mutate(r.id, {
                            onSuccess: ({ result, email }) => {
                              if (!result.approved) {
                                setProblem(
                                  result.reason === 'already_active'
                                    ? t('enroll.requests.stale')
                                    : t('enroll.requests.failed'),
                                )
                                return
                              }
                              // A student with no address is not a failure
                              // worth reporting — the row above already shows
                              // a blank email.
                              if (email && !email.ok && email.code !== 'no_email') {
                                setProblem(t('enroll.email.failed'))
                              }
                            },
                            onError: (e) =>
                              setProblem(
                                errorMessage(e, t('enroll.requests.failed')),
                              ),
                          })
                        }}
                      >
                        {t('enroll.requests.approve')}
                      </Button>
                    </div>
                  ) : (
                    <Badge variant="outline" className="shrink-0">
                      {t(ENROLLMENT_STATUS_LABEL[r.status])}
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      <CourseLimitsDialog
        academyId={academyId}
        course={limitsFor}
        open={!!limitsFor}
        onOpenChange={(o) => {
          if (!o) setLimitsFor(null)
        }}
      />
      {activeAcademyId ? (
        <BulkEnrollDialog
          academyId={academyId}
          courses={courses}
          open={bulkOpen}
          onOpenChange={setBulkOpen}
        />
      ) : null}
    </div>
  )
}
