import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink, Settings2, UserPlus } from 'lucide-react'
import { useAcademy } from '@/lib/academy'
import { fmtDate } from '@/lib/format'
import { useT } from '@/lib/i18n'
import { enrollPath } from '@/lib/enrollDraft'
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
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { InviteLink } from '@/features/students/InviteLink'
import { useActiveStudentCounts, type Course } from '@/features/courses/api'
import { BulkEnrollDialog } from './BulkEnrollDialog'
import { EnrollmentSettingsDialog } from './EnrollmentSettingsDialog'
import {
  useEnrollmentSettings,
  usePendingApplicationCount,
  useSaveEnrollmentSettings,
} from './api'

/**
 * Everything about getting people onto this course, in one card:
 * bulk-enrol people the academy already has, and open a public page for people
 * it does not.
 *
 * The two switches commit immediately (the ToyyibPay settings idiom) — a switch
 * with a Save button beside it is a switch nobody trusts. Everything with a
 * value behind it lives in the dialog.
 */
export function EnrollmentSettingsCard({
  academyId,
  course,
  className,
}: {
  academyId: string
  course: Course
  className?: string
}) {
  const { t, tn } = useT()
  const { memberships } = useAcademy()
  const slug =
    memberships.find((m) => m.academyId === academyId)?.academy?.slug ?? ''

  const { data: settings } = useEnrollmentSettings(course.id)
  const { data: pending } = usePendingApplicationCount(academyId, course.id)
  const { data: counts } = useActiveStudentCounts(academyId)
  const save = useSaveEnrollmentSettings(academyId, course.id)

  const [configuring, setConfiguring] = useState(false)
  const [enrolling, setEnrolling] = useState(false)

  const taken = counts?.get(course.id) ?? 0
  const published = course.status === 'published'
  const isOpen = !!settings?.is_open
  const path = slug ? enrollPath(slug, course.id) : null
  const url = path ? `${window.location.origin}${path}` : null

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{t('enroll.card.title')}</CardTitle>
        <CardDescription>{t('enroll.card.description')}</CardDescription>
        <CardAction>
          <Button variant="outline" size="sm" onClick={() => setEnrolling(true)}>
            <UserPlus /> {t('enroll.bulk.action')}
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent className="grid gap-4 border-t pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="grid gap-0.5">
            <Label htmlFor="enroll-open" className="text-sm font-medium">
              {t('enroll.settings.title')}
            </Label>
            <p className="text-muted-foreground text-xs">
              {published
                ? t('enroll.settings.description')
                : t('enroll.settings.needs_publish')}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {pending ? (
              <Button asChild variant="ghost" size="sm">
                <Link to={`/enrollments?course=${course.id}`}>
                  <Badge variant="secondary">{pending}</Badge>
                  {tn('enroll.settings.pending', pending)}
                </Link>
              </Button>
            ) : null}
            <Switch
              id="enroll-open"
              checked={isOpen}
              disabled={!published || save.isPending}
              onCheckedChange={(v) => save.mutate({ is_open: v })}
              aria-label={t('enroll.settings.open')}
            />
          </div>
        </div>

        {isOpen && url && path ? (
          <div className="grid gap-3">
            <InviteLink url={url} note={t('enroll.settings.link_note')} />

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-muted-foreground text-xs">
                {settings?.capacity != null
                  ? t('enroll.settings.seats_capped', {
                      taken,
                      capacity: settings.capacity,
                    })
                  : t('enroll.settings.seats_uncapped', { taken })}
                {' · '}
                {settings?.closes_at
                  ? t('enroll.closes', { date: fmtDate(settings.closes_at) })
                  : t('enroll.settings.no_deadline')}
              </div>
              <div className="flex items-center gap-2">
                <Button asChild variant="outline" size="sm">
                  <a href={path} target="_blank" rel="noreferrer">
                    <ExternalLink /> {t('enroll.settings.preview')}
                  </a>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfiguring(true)}
                >
                  <Settings2 /> {t('enroll.settings.configure')}
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="enroll-listed"
                checked={settings?.is_listed ?? true}
                disabled={save.isPending}
                onCheckedChange={(v) => save.mutate({ is_listed: v })}
              />
              <Label htmlFor="enroll-listed" className="text-xs font-normal">
                {t('enroll.settings.listed')}
                <span className="text-muted-foreground block">
                  {t('enroll.settings.listed_hint')}
                </span>
              </Label>
            </div>
          </div>
        ) : published ? (
          <Button
            variant="outline"
            size="sm"
            className="justify-self-start"
            onClick={() => setConfiguring(true)}
          >
            <Settings2 /> {t('enroll.settings.configure')}
          </Button>
        ) : null}
      </CardContent>

      <EnrollmentSettingsDialog
        academyId={academyId}
        courseId={course.id}
        settings={settings ?? null}
        open={configuring}
        onOpenChange={setConfiguring}
      />
      <BulkEnrollDialog
        academyId={academyId}
        courseId={course.id}
        open={enrolling}
        onOpenChange={setEnrolling}
      />
    </Card>
  )
}
