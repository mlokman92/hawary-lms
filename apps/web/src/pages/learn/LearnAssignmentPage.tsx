import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import { fmtDateTime } from '@/lib/format'
import { useT } from '@/lib/i18n'
import { useStudentAcademy } from '@/lib/studentAcademy'
import {
  useDeleteSubmission,
  useLearnAssignment,
  useMyStudent,
  useMySubmission,
  useSaveSubmission,
} from '@/features/learn/api'
import { SUBMISSION_STATUS_META } from '@/features/learn/status'
import { BackLink } from '@/components/patterns/BackLink'
import { NotFoundBlock, RouteLoading } from '@/components/patterns/QueryState'
import { BlocksView } from '@/components/BlocksView'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

export function LearnAssignmentPage() {
  const { id = '' } = useParams<{ id: string }>()
  const { t, tn } = useT()
  const { academyId } = useStudentAcademy()
  const { data: student, isLoading: studentLoading } = useMyStudent(academyId)
  const { data: assignment, isLoading, error } = useLearnAssignment(id)
  const { data: submission, isPending: submissionPending } = useMySubmission(
    id,
    student?.id ?? null,
  )

  const save = useSaveSubmission(academyId ?? '', id, student?.id ?? '')
  const remove = useDeleteSubmission(id, student?.id ?? '')
  const [content, setContent] = useState('')
  const [seeded, setSeeded] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (seeded || submission === undefined) return
    setContent(submission?.content ?? '')
    setSeeded(true)
  }, [seeded, submission])

  // The guard has to cover the query the seed effect reads from. useMySubmission
  // only enables once useMyStudent resolves, so it always lands AFTER the
  // assignment — mounting the textarea before then lets the seed clobber typed
  // text, and leaves submission?.id undefined so a save would INSERT into a
  // table with unique(assignment_id, student_id).
  // Gated on `student &&` because with no student record the query stays
  // disabled and isPending would never clear. On error isPending goes false, so
  // a failed fetch renders the page rather than hanging on the spinner.
  if (isLoading || studentLoading || (student && submissionPending))
    return <RouteLoading />

  if (error || !assignment) {
    return (
      <NotFoundBlock
        message={t('lwork.assignment.not_available')}
        backTo="/learn/courses"
        backLabel={t('lwork.back_to_courses')}
      />
    )
  }

  const status = submission?.status ?? 'draft'
  const meta = SUBMISSION_STATUS_META[status]
  // The UPDATE policy's USING clause is `status = 'draft'`, so anything else is
  // read-only at the database — including 'returned', which used to render an
  // enabled editor whose save could only ever fail.
  const locked = !!submission && status !== 'draft'
  const released = status === 'graded' || status === 'returned'
  const overdue =
    !!assignment.due_at &&
    !assignment.allow_late &&
    new Date(assignment.due_at) < new Date()
  // guard_submission_write raises a raw Postgres string on a late hand-in;
  // don't offer the action we know the server will reject.
  const canSubmit = !locked && !overdue && !!content.trim() && !save.isPending

  async function run(submit: boolean) {
    setErr(null)
    try {
      await save.mutateAsync({ id: submission?.id, content, submit })
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('lwork.assignment.error.save'))
    }
  }

  async function discard() {
    if (!submission) return
    setErr(null)
    try {
      await remove.mutateAsync(submission.id)
      setContent('')
    } catch (e) {
      setErr(
        e instanceof Error ? e.message : t('lwork.assignment.error.delete'),
      )
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <BackLink to={`/learn/courses/${assignment.course_id}`}>
        {t('common.course')}
      </BackLink>

      <div className="mt-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            {assignment.title}
          </h1>
          <Badge variant={meta.variant}>{t(meta.labelKey)}</Badge>
        </div>
        <p className="text-muted-foreground mt-1 text-sm">
          {[
            tn('lwork.points', assignment.total_points),
            assignment.due_at
              ? t('lwork.due_at', { date: fmtDateTime(assignment.due_at) })
              : null,
            assignment.allow_late ? t('lwork.late_allowed') : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>

      <div className="mt-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('lwork.assignment.brief')}</CardTitle>
          </CardHeader>
          <CardContent>
            <BlocksView body={assignment.instructions} />
          </CardContent>
        </Card>

        {released ? (
          <Card>
            <CardHeader>
              <CardTitle>{t('lwork.assignment.result')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm">
                <span className="font-medium tabular-nums">
                  {submission?.grade ?? '—'}
                </span>{' '}
                <span className="text-muted-foreground">
                  / {assignment.total_points}
                </span>
              </p>
              {submission?.feedback ? (
                <p className="text-sm whitespace-pre-line">
                  {submission.feedback}
                </p>
              ) : (
                <p className="text-muted-foreground text-sm">
                  {t('lwork.assignment.no_feedback')}
                </p>
              )}
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>{t('lwork.assignment.your_submission')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              rows={12}
              value={content}
              disabled={locked}
              onChange={(e) => setContent(e.target.value)}
              placeholder={t('lwork.assignment.answer_placeholder')}
            />

            {submission?.submitted_at ? (
              <p className="text-muted-foreground text-xs">
                {t('lwork.assignment.submitted_at', {
                  date: fmtDateTime(submission.submitted_at),
                })}
              </p>
            ) : null}
            {err ? <p className="text-destructive text-sm">{err}</p> : null}
            {overdue && !locked ? (
              <p className="text-destructive text-sm">
                {t('lwork.assignment.overdue')}
              </p>
            ) : null}

            {locked ? (
              <p className="text-muted-foreground text-sm">
                {status === 'returned'
                  ? t('lwork.assignment.locked_returned')
                  : t('lwork.assignment.locked_submitted')}
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={save.isPending}
                  onClick={() => void run(false)}
                >
                  {save.isPending
                    ? t('common.saving')
                    : t('lwork.assignment.save_draft')}
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button disabled={!canSubmit}>{t('common.submit')}</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        {t('lwork.assignment.confirm_submit.title')}
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        {t('lwork.assignment.confirm_submit.body')}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>
                        {t('common.cancel')}
                      </AlertDialogCancel>
                      <AlertDialogAction onClick={() => void run(true)}>
                        {t('common.submit')}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                {submission ? (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        className="text-destructive hover:text-destructive ml-auto"
                        disabled={remove.isPending}
                      >
                        <Trash2 /> {t('lwork.assignment.delete_draft')}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          {t('lwork.assignment.confirm_delete.title')}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          {t('lwork.assignment.confirm_delete.body')}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>
                          {t('common.cancel')}
                        </AlertDialogCancel>
                        <AlertDialogAction onClick={() => void discard()}>
                          {t('common.delete')}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
