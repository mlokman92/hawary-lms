import { Link, useParams } from 'react-router-dom'
import { CalendarClock, Users } from 'lucide-react'
import { formatMYR } from '@hawary/shared'
import { fmtDate } from '@/lib/format'
import { useT } from '@/lib/i18n'
import { enrollPath } from '@/lib/enrollDraft'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { EmptyState } from '@/components/patterns/EmptyState'
import { PublicShell } from '@/features/enrollment/PublicShell'
import { seatsLeft, useEnrollmentDirectory } from '@/features/enrollment/api'

/**
 * The academy's own enrollment page: whatever is open right now.
 *
 * An index over the same per-course settings, not a second way to configure
 * anything — a course appears here when it is open AND listed, so a private
 * intake keeps a working link without being advertised.
 */
export function EnrollDirectoryPage() {
  const { t, tn } = useT()
  const { slug } = useParams<{ slug: string }>()
  const { data, isLoading, error } = useEnrollmentDirectory(slug)

  if (isLoading) {
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

  return (
    <PublicShell academy={data.academy}>
      <p className="text-muted-foreground -mt-2 text-center text-sm">
        {t('enroll.directory.subtitle')}
      </p>

      {data.courses.length === 0 ? (
        <EmptyState
          title={t('enroll.directory.empty')}
          body={t('enroll.directory.empty_hint')}
        />
      ) : (
        data.courses.map((course) => {
          const left = seatsLeft(course.capacity, course.seats_taken)
          return (
            <Card
              key={course.id}
              className="hover:border-foreground/20 relative transition-colors"
            >
              <CardHeader>
                {/* Stretched link: the whole card is the hit target. */}
                <Link
                  to={enrollPath(data.academy.slug, course.id)}
                  className="after:absolute after:inset-0 focus-visible:outline-none"
                >
                  <CardTitle className="text-base">{course.title}</CardTitle>
                </Link>
                <CardDescription>
                  {[
                    course.code,
                    course.price_sen > 0
                      ? formatMYR(course.price_sen)
                      : t('enroll.price_free'),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                {course.description ? (
                  <p className="text-muted-foreground line-clamp-3 text-sm">
                    {course.description}
                  </p>
                ) : null}
                <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  <span className="flex items-center gap-1.5">
                    <Users className="size-3.5" aria-hidden />
                    {left === null
                      ? t('enroll.seats.enrolled', { count: course.seats_taken })
                      : tn('enroll.seats.left', left)}
                  </span>
                  {course.closes_at ? (
                    <span className="flex items-center gap-1.5">
                      <CalendarClock className="size-3.5" aria-hidden />
                      {t('enroll.closes', { date: fmtDate(course.closes_at) })}
                    </span>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          )
        })
      )}
    </PublicShell>
  )
}
