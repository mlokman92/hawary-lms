import { useState } from 'react'
import { Link } from 'react-router-dom'
import { MoreHorizontal, Send, Upload } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { useT } from '@/lib/i18n'
import { fmtDateTime, personName } from '@/lib/format'
import { errorMessage } from '@/lib/errors'
import { TONE_CLASS } from '@/lib/tone'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ErrorBlock, LoadingBlock } from '@/components/patterns/QueryState'
import { FilePicker } from './FilePicker'
import { ReportTimeline } from './ReportTimeline'
import {
  REPORT_STATUS,
  VERDICTS,
  useCommentOnReport,
  useReassignReport,
  useReport,
  type PendingFile,
  type ReportStatus,
} from './api'

/**
 * One report-check thread, rendered identically for everybody who may see it.
 *
 * The component decides FOR ITSELF what the reader may do, from `my_role` on
 * the server's own projection — the same discipline as `AppointmentDialog`, and
 * for the same reason: this mounts on two routes in two shells, and a rule
 * copied into both is a rule that will drift. A button that fails at the policy
 * is worse than no button.
 *
 * What differs between the two callers is the one thing that genuinely differs:
 * a student uploads the next version, staff record a verdict. Neither is a
 * cosmetic variation of the other, so `onResubmit` is a prop rather than a flag.
 */
export function ReportThreadView({
  academyId,
  reportId,
  onResubmit,
}: {
  academyId: string | null
  reportId: string
  /** Rendered as the student's action. Absent for staff, who never upload. */
  onResubmit?: () => void
}) {
  const { t } = useT()
  const { user } = useAuth()
  const { data: report, isLoading, error } = useReport(reportId)
  const comment = useCommentOnReport(academyId)
  const reassign = useReassignReport(academyId)

  const [body, setBody] = useState('')
  const [files, setFiles] = useState<PendingFile[]>([])
  const [failure, setFailure] = useState<string | null>(null)

  if (isLoading) return <LoadingBlock className="mt-6" />
  if (error) return <ErrorBlock error={error} className="mt-6" />
  if (!report) return null

  const status = REPORT_STATUS[report.status]
  const isStudent = report.my_role === 'student'
  const isAdmin = report.my_role === 'admin'
  const canDecide = !isStudent
  const canReassign = !isStudent
  const done = report.status === 'approved'

  async function post(toStatus: ReportStatus | null) {
    setFailure(null)
    try {
      await comment.mutateAsync({
        reportId,
        body,
        toStatus,
        files,
      })
      setBody('')
      setFiles([])
    } catch (e) {
      setFailure(errorMessage(e, t('common.error')))
    }
  }

  async function hand(to: string | null) {
    setFailure(null)
    try {
      await reassign.mutateAsync({ reportId, instructorId: to })
    } catch (e) {
      setFailure(errorMessage(e, t('common.error')))
    }
  }

  const busy = comment.isPending || reassign.isPending
  const nothingToSay = body.trim() === '' && files.length === 0

  return (
    <>
      <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">
              {report.title}
            </h1>
            <Badge variant="outline" className={cn(TONE_CLASS[status.tone])}>
              {t(status.labelKey)}
            </Badge>
            {report.version > 1 ? (
              <Badge variant="secondary">
                {t('report.version', { version: report.version })}
              </Badge>
            ) : null}
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            {/* Who it is about and who has it. On the student's side the
                checker's name is the only fact they cannot get anywhere else —
                `instructors` is staff-only, so this projection is their one
                sight of it. */}
            {report.course.title}
            {' · '}
            {isStudent
              ? t('report.checked_by', {
                  name:
                    personName(report.instructor?.full_name) ??
                    t('report.unassigned'),
                })
              : `${personName(report.student.full_name) ?? t('common.unnamed')}${
                  report.student.student_no
                    ? ` · ${report.student.student_no}`
                    : ''
                }`}
            {' · '}
            {t('report.submitted_at', { when: fmtDateTime(report.submitted_at) })}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* A student's one action, and only while there is something to do:
              an approved report has nothing left to resubmit. */}
          {isStudent && onResubmit && !done ? (
            <Button onClick={onResubmit}>
              <Upload />
              {t('report.resubmit')}
            </Button>
          ) : null}

          {/* Staff: the occasional actions. Reassigning is rare and
              irreversible-ish, so it belongs behind the menu, not beside the
              reply box. */}
          {canReassign ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" disabled={busy}>
                  <MoreHorizontal />
                  <span className="sr-only">{t('common.actions')}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => void hand(null)}>
                  {t('report.hand_on')}
                </DropdownMenuItem>
                {!isStudent && report.student.id ? (
                  <DropdownMenuItem asChild>
                    <Link to={`/students/${report.student.id}`}>
                      {t('report.open_student')}
                    </Link>
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>

      <Card className="mt-6 gap-0 py-0">
        <ReportTimeline events={report.events} myUserId={user?.id ?? null} />

        {/* The reply box is part of the thread, not a card below it: what you
            are about to add belongs where it will appear. */}
        <div className="border-t p-4">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            disabled={busy}
            placeholder={
              isStudent ? t('report.reply.student') : t('report.reply.staff')
            }
          />

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            {academyId ? (
              <FilePicker
                academyId={academyId}
                files={files}
                onChange={setFiles}
                disabled={busy}
              />
            ) : (
              <span />
            )}

            <div className="flex flex-wrap items-center gap-2">
              {/* The three verdicts, as three buttons rather than a select
                  plus a Save: a verdict is one decision and pressing it is the
                  whole act. `submitted` is not offered — only an upload puts a
                  report back into that state, and only the student uploads. */}
              {canDecide
                ? VERDICTS.map((v) => (
                    <Button
                      key={v}
                      type="button"
                      size="sm"
                      variant={v === 'approved' ? 'default' : 'outline'}
                      disabled={busy || report.status === v}
                      onClick={() => void post(v)}
                    >
                      {t(REPORT_STATUS[v].labelKey)}
                    </Button>
                  ))
                : null}

              <Button
                type="button"
                size="sm"
                variant={canDecide ? 'ghost' : 'default'}
                disabled={busy || nothingToSay}
                onClick={() => void post(null)}
              >
                <Send />
                {t('report.send')}
              </Button>
            </div>
          </div>

          {failure ? (
            <p className="text-destructive mt-2 text-sm">{failure}</p>
          ) : null}

          {/* Said once, where the decision is made: an admin acting on a
              report they do not hold is the normal case (they see all of
              them), and it is worth knowing the rota gave it to somebody. */}
          {isAdmin && report.instructor ? (
            <p className="text-muted-foreground mt-2 text-xs">
              {t('report.assigned_to', {
                name:
                  personName(report.instructor.full_name) ??
                  t('common.unnamed'),
              })}
            </p>
          ) : null}
        </div>
      </Card>
    </>
  )
}
