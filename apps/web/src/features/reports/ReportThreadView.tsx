import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  FileText,
  MoreHorizontal,
  Send,
} from 'lucide-react'
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
import { CpcSheet } from './CpcSheet'
import { FilePicker } from './FilePicker'
import { ReportTimeline } from './ReportTimeline'
import {
  LPKC_STAGE_LABEL,
  REPORT_STATUS,
  useCommentOnReport,
  useReassignReport,
  useReport,
  useSetReportBrief,
  type PendingFile,
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
 * A part of the LPKC is sent once (from the list), so a student here reads and
 * replies in words; staff reply, attach and approve.
 */
export function ReportThreadView({
  academyId,
  reportId,
}: {
  academyId: string | null
  reportId: string
}) {
  const { t } = useT()
  const { user } = useAuth()
  const { data: report, isLoading, error } = useReport(reportId)
  const comment = useCommentOnReport(academyId)
  const reassign = useReassignReport(academyId)
  const setBrief = useSetReportBrief(academyId)

  const [body, setBody] = useState('')
  const [files, setFiles] = useState<PendingFile[]>([])
  const [failure, setFailure] = useState<string | null>(null)
  const [draft, setDraft] = useState({
    introduction: '',
    objectives: '',
    problem: '',
  })
  const [briefFailure, setBriefFailure] = useState<string | null>(null)
  const [cpcOpen, setCpcOpen] = useState(false)

  if (isLoading) return <LoadingBlock className="mt-6" />
  if (error) return <ErrorBlock error={error} className="mt-6" />
  if (!report) return null

  const status = REPORT_STATUS[report.stage ?? report.status]
  const isStudent = report.my_role === 'student'
  const isAdmin = report.my_role === 'admin'
  const showCpc = !isStudent
  const canReassign = !isStudent

  const fields = [
    { key: 'introduction', labelKey: 'report.submit.introduction', text: report.introduction },
    { key: 'objectives', labelKey: 'report.submit.objectives', text: report.objectives },
    { key: 'problem', labelKey: 'report.submit.problem', text: report.problem_statement },
  ] as const
  const brief = fields.filter((b) => b.text?.trim())
  // Only the student whose report it is can fill a blank, and only a blank: to
  // change what is written they send a new version, as before. And only on the
  // summary — the report and the slides are a document, and have no such
  // fields to be missing.
  const missing =
    isStudent && report.lpkc_stage === 'summary'
      ? fields.filter((b) => !b.text?.trim())
      : []

  async function saveBrief() {
    setBriefFailure(null)
    try {
      await setBrief.mutateAsync({
        reportId,
        introduction: draft.introduction,
        objectives: draft.objectives,
        problemStatement: draft.problem,
      })
      setDraft({ introduction: '', objectives: '', problem: '' })
    } catch (e) {
      setBriefFailure(errorMessage(e, t('common.error')))
    }
  }

  async function post() {
    setFailure(null)
    try {
      await comment.mutateAsync({
        reportId,
        body,
        toStatus: null,
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

  // A part of the LPKC is sent once, so a student's reply is words only.
  // Staff still attach — the corrected copy arrives here.
  const canAttach = !isStudent

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
            {t(LPKC_STAGE_LABEL[report.lpkc_stage])}
            {' · '}
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

      {/* What the work is about, as the student wrote it. For staff, a report
          sent before these were asked for shows nothing here rather than
          three empty headings; for its student, each blank is a box. */}
      {brief.length > 0 || missing.length > 0 ? (
        <Card className="mt-6 gap-5 p-4">
          {brief.map((b) => (
            <section key={b.key}>
              <h2 className="text-muted-foreground text-xs font-medium">
                {t(b.labelKey)}
              </h2>
              <p className="mt-1 text-sm whitespace-pre-wrap">{b.text}</p>
            </section>
          ))}

          {missing.map((m) => (
            <section key={m.key}>
              <label
                htmlFor={`brief-${m.key}`}
                className="text-muted-foreground text-xs font-medium"
              >
                {t(m.labelKey)}
              </label>
              <Textarea
                id={`brief-${m.key}`}
                className="mt-1"
                rows={3}
                maxLength={5000}
                value={draft[m.key]}
                disabled={setBrief.isPending}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, [m.key]: e.target.value }))
                }
              />
            </section>
          ))}

          {missing.length > 0 ? (
            <div className="flex items-center justify-end gap-3">
              {briefFailure ? (
                <p className="text-destructive mr-auto text-sm">
                  {briefFailure}
                </p>
              ) : null}
              <Button
                size="sm"
                disabled={
                  setBrief.isPending ||
                  missing.every((m) => draft[m.key].trim() === '')
                }
                onClick={() => void saveBrief()}
              >
                {t('common.save')}
              </Button>
            </div>
          ) : null}
        </Card>
      ) : null}

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

          {/* Send is the whole act: the academy's reply makes the thread
              "correction complete"; a student's reply moves nothing. */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            {academyId && canAttach ? (
              <FilePicker
                academyId={academyId}
                files={files}
                onChange={setFiles}
                disabled={busy}
              />
            ) : (
              <span />
            )}

            <Button
              type="button"
              size="sm"
              disabled={busy || nothingToSay}
              onClick={() => void post()}
            >
              <Send />
              {t('report.send')}
            </Button>
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

      {/* Staff's standing action, pinned so it is there wherever the thread
          is scrolled: the chart every LPKC part is checked against. There is
          no approval — a part ends at "Correction complete". */}
      {showCpc ? (
        <>
          {/* Room to scroll the reply box's Send clear of the pinned buttons. */}
          <div className="h-20" aria-hidden />

          <Button
            variant="outline"
            className="bg-background fixed right-6 bottom-6 z-40 shadow-lg"
            onClick={() => setCpcOpen(true)}
            aria-label={t('report.cpc')}
          >
            <FileText />
            <span>{t('report.cpc')}</span>
          </Button>
          <CpcSheet open={cpcOpen} onOpenChange={setCpcOpen} />
        </>
      ) : null}
    </>
  )
}
