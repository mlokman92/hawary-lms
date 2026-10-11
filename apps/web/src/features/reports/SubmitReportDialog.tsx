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
import { useSubmitReport, type MyReportRow, type PendingFile } from './api'

/**
 * Send documents for checking, or send the next version of them.
 *
 * One dialog for both because the server has one RPC for both: a resubmission
 * is the next version of the same thread, keeps the same checker, and carries
 * the same two fields. Only the wording changes, which is what `row.report`
 * decides.
 *
 * The title is free text and deliberately so — "LPKC, slide dan portfolio" is
 * how this academy actually describes a batch, and a document-type picker would
 * be an entity invented to hold three words.
 *
 * The introduction, objectives and problem statement are required on every
 * send, not only the first: they sit on the thread, so a new version starts from
 * what is there and the student edits it.
 */
export function SubmitReportDialog({
  academyId,
  row,
  open,
  onOpenChange,
  onDone,
}: {
  academyId: string
  row: MyReportRow | null
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

  const existing = row?.report ?? null

  // Reset per opening, and seed the text from the thread being added to: a
  // resubmission is nearly always the same work again, so making somebody
  // retype "LPKC, slide dan portfolio" — or their introduction — would be
  // asking a question whose answer is already on screen. A report sent before
  // these were asked for seeds them empty, and so must be filled in.
  useEffect(() => {
    if (!open) return
    setTitle(existing?.title ?? '')
    setIntroduction(existing?.introduction ?? '')
    setObjectives(existing?.objectives ?? '')
    setProblem(existing?.problem_statement ?? '')
    setFiles([])
    setError(null)
  }, [
    open,
    existing?.title,
    existing?.introduction,
    existing?.objectives,
    existing?.problem_statement,
  ])

  async function save() {
    if (!row) return
    setError(null)
    try {
      const res = await submit.mutateAsync({
        courseId: row.course_id,
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
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {existing ? t('report.submit.title_again') : t('report.submit.title')}
          </DialogTitle>
          <DialogDescription>
            {existing
              ? t('report.submit.desc_again', {
                  version: existing.version + 1,
                })
              : t('report.submit.desc', { course: row?.course_title ?? '' })}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="report-title">{t('report.submit.what')}</Label>
            <Input
              id="report-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('report.submit.what_hint')}
              disabled={submit.isPending}
            />
          </div>

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

          <div className="grid gap-2">
            <Label>{t('report.submit.files')}</Label>
            <FilePicker
              academyId={academyId}
              files={files}
              onChange={setFiles}
              disabled={submit.isPending}
            />
          </div>

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
            // All of these are required by the RPC, so refusing here says
            // the same thing a round trip would, sooner.
            disabled={
              submit.isPending ||
              files.length === 0 ||
              title.trim() === '' ||
              introduction.trim() === '' ||
              objectives.trim() === '' ||
              problem.trim() === ''
            }
          >
            {submit.isPending ? t('report.submit.sending') : t('report.submit.send')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
