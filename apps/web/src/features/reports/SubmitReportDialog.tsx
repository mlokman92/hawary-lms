import { useEffect, useState } from 'react'
import { useT } from '@/lib/i18n'
import { errorMessage } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { FilePicker } from './FilePicker'
import {
  LPKC_STAGE_LABEL,
  useSubmitReport,
  type PendingFile,
  type ReportTarget,
} from './api'

/**
 * Send one part of the LPKC for checking, or send the next version of it.
 *
 * One dialog for both because the server has one RPC for both: a resubmission
 * is the next version of the same thread and keeps the same checker. Only the
 * wording changes, which is what `target.report` decides.
 *
 * What it asks for is what the part is made of. The summary IS its
 * introduction, objectives and problem statement — required on every send, and
 * seeded from the thread so a new version starts from what is there — and
 * takes no documents at all. The report and the slides are a document, so
 * those ask for one and for nothing else. The server makes the same split.
 *
 * The title is the project's, so a new part starts from the title the student
 * gave another one.
 */
export function SubmitReportDialog({
  academyId,
  target,
  open,
  onOpenChange,
  onDone,
}: {
  academyId: string
  target: ReportTarget | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone?: (reportId: string) => void
}) {
  const { t } = useT()
  const submit = useSubmitReport(academyId)

  const [title, setTitle] = useState('')
  const [introduction, setIntroduction] = useState('')
  const [objectives, setObjectives] = useState('')
  const [problem, setProblem] = useState('')
  const [files, setFiles] = useState<PendingFile[]>([])
  const [error, setError] = useState<string | null>(null)

  const existing = target?.report ?? null
  const isSummary = target?.stage === 'summary'
  const titleHint = target?.titleHint ?? ''

  // Reset per opening, and seed the text from the thread being added to: a
  // resubmission is nearly always the same work again, so making somebody
  // retype their title — or their introduction — would be asking a question
  // whose answer is already on screen. A summary sent before the three fields
  // were asked for seeds them empty, and so must be filled in.
  useEffect(() => {
    if (!open) return
    setTitle(existing?.title ?? titleHint)
    setIntroduction(existing?.introduction ?? '')
    setObjectives(existing?.objectives ?? '')
    setProblem(existing?.problem_statement ?? '')
    setFiles([])
    setError(null)
  }, [
    open,
    titleHint,
    existing?.title,
    existing?.introduction,
    existing?.objectives,
    existing?.problem_statement,
  ])

  async function save() {
    if (!target) return
    setError(null)
    try {
      const res = await submit.mutateAsync({
        courseId: target.courseId,
        stage: target.stage,
        title,
        introduction,
        objectives,
        problemStatement: problem,
        files,
      })
      onOpenChange(false)
      onDone?.(res.id)
    } catch (e) {
      setError(errorMessage(e, t('common.error')))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          {/* Which part this is, in the academy's own words — the one thing
              the student has to be sure of before attaching anything. */}
          <DialogTitle>
            {target ? t(LPKC_STAGE_LABEL[target.stage]) : null}
          </DialogTitle>
          <DialogDescription>
            {existing
              ? t('report.submit.desc_again', {
                  version: existing.version + 1,
                })
              : t('report.submit.desc', { course: target?.courseTitle ?? '' })}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="report-title">{t('report.submit.what')}</Label>
            <Input
              id="report-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={submit.isPending}
            />
          </div>

          {isSummary ? (
            <>
              <div className="grid gap-2">
                <Label htmlFor="report-introduction">
                  {t('report.submit.introduction')}
                </Label>
                <Textarea
                  id="report-introduction"
                  value={introduction}
                  onChange={(e) => setIntroduction(e.target.value)}
                  rows={4}
                  maxLength={5000}
                  disabled={submit.isPending}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="report-objectives">
                  {t('report.submit.objectives')}
                </Label>
                <Textarea
                  id="report-objectives"
                  value={objectives}
                  onChange={(e) => setObjectives(e.target.value)}
                  rows={4}
                  maxLength={5000}
                  disabled={submit.isPending}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="report-problem">{t('report.submit.problem')}</Label>
                <Textarea
                  id="report-problem"
                  value={problem}
                  onChange={(e) => setProblem(e.target.value)}
                  rows={4}
                  maxLength={5000}
                  disabled={submit.isPending}
                />
              </div>
            </>
          ) : null}

          {isSummary ? null : (
            <div className="grid gap-2">
              <Label>{t('report.submit.files')}</Label>
              <FilePicker
                academyId={academyId}
                files={files}
                onChange={setFiles}
                disabled={submit.isPending}
              />
            </div>
          )}

          {error ? (
            <p className="text-destructive text-sm">{error}</p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submit.isPending}
          >
            {t('common.cancel')}
          </Button>
          <Button
            onClick={() => void save()}
            // The RPC requires the same things, so refusing here says what a
            // round trip would, sooner: the summary's three fields, or — for
            // the report and the slides — a document.
            disabled={
              submit.isPending ||
              title.trim() === '' ||
              (isSummary
                ? introduction.trim() === '' ||
                  objectives.trim() === '' ||
                  problem.trim() === ''
                : files.length === 0)
            }
          >
            {submit.isPending ? t('report.submit.sending') : t('report.submit.send')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
