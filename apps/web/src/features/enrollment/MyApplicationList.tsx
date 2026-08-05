import { Link } from 'react-router-dom'
import { Building2 } from 'lucide-react'
import { fmtDate } from '@/lib/format'
import { useT } from '@/lib/i18n'
import { enrollPath } from '@/lib/enrollDraft'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { APPLICATION_STATUS_LABEL, useMyApplications } from './api'

/**
 * The applicant's half of the story, beside PendingInviteList and for the same
 * reason: no email is sent when an application is decided, so this list is how
 * the person finds out. Renders nothing when there is nothing to show, so it can
 * sit unconditionally on a page that usually has none.
 */
export function MyApplicationList({
  className,
  enabled = true,
}: {
  className?: string
  enabled?: boolean
}) {
  const { t } = useT()
  const { data, isLoading } = useMyApplications(enabled)

  const applications = data ?? []
  if (isLoading || applications.length === 0) return null

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{t('enroll.mine.title')}</CardTitle>
        <CardDescription>{t('enroll.mine.description')}</CardDescription>
      </CardHeader>
      <ul className="divide-y border-t">
        {applications.map((a) => (
          <li key={a.id} className="flex items-center gap-3 px-6 py-3">
            <Avatar className="size-9 rounded-md">
              <AvatarImage
                src={a.academy_logo_url ?? undefined}
                alt=""
                className="object-contain"
              />
              <AvatarFallback className="rounded-md">
                <Building2 className="text-muted-foreground size-4" />
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <Link
                to={enrollPath(a.academy_slug, a.course_id)}
                className="block truncate text-sm font-medium hover:underline"
              >
                {a.course_title}
              </Link>
              <p className="text-muted-foreground truncate text-xs">
                {[
                  a.academy_name,
                  a.reviewed_at
                    ? t('enroll.mine.reviewed', { date: fmtDate(a.reviewed_at) })
                    : t('enroll.applied.on', { date: fmtDate(a.created_at) }),
                ].join(' · ')}
              </p>
            </div>
            <Badge
              variant={
                a.status === 'approved'
                  ? 'default'
                  : a.status === 'pending'
                    ? 'secondary'
                    : 'outline'
              }
              className="shrink-0"
            >
              {t(APPLICATION_STATUS_LABEL[a.status])}
            </Badge>
          </li>
        ))}
      </ul>
    </Card>
  )
}
