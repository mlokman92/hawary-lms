import { useState, type FormEvent } from 'react'
import { normalizeIcNumber } from '@hawary/shared'
import { useStudentAcademy } from '@/lib/studentAcademy'
import { useT } from '@/lib/i18n'
import { errorMessage } from '@/lib/errors'
import { fmtDate } from '@/lib/format'
import { TONE_CLASS } from '@/lib/tone'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/patterns/PageHeader'
import { ErrorBlock, LoadingBlock } from '@/components/patterns/QueryState'
import { NoStudentRecord } from '@/components/learn/NoStudentRecord'
import {
  useMyStudent,
  useUpdateMyDetails,
  type Student,
} from '@/features/learn/api'
import {
  KWSP_APPLICATION_STATUS,
  kwspState,
  useApplyForKwspLetter,
  useStudentDocuments,
  type DocumentStudent,
} from '@/features/documents/api'

/**
 * The student's KWSP application: asking the academy for its letter to KWSP
 * (Surat Pengesahan Pendaftaran Pelajar). See docs/documents.md.
 *
 * Applying is one button. The letter is drawn from the record, so there is
 * nothing to fill in — except an IC number when the record has none, since the
 * letter is two lines of it; that is asked for here and saved on the way.
 *
 * What comes back is a status, not a file: an admin answers by creating the
 * letter, and the academy prints, signs and hands it over.
 */
export function LearnKwspPage() {
  const { t } = useT()
  const { academyId } = useStudentAcademy()
  const student = useMyStudent(academyId)
  const docs = useStudentDocuments(student.data?.id)

  const error = student.error ?? docs.error
  const loading = student.isLoading || (!!student.data && docs.isLoading)

  let body
  if (loading) body = <LoadingBlock />
  else if (error) body = <ErrorBlock error={error} />
  else if (!student.data || !docs.data) body = <NoStudentRecord />
  else
    body = (
      <ApplicationCard
        key={student.data.id}
        academyId={academyId}
        student={student.data}
        application={docs.data}
      />
    )

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        title={t('nav.learn.kwsp')}
        description={t('sdoc.kwsp_app.description')}
      />
      <div className="mt-6">{body}</div>
    </div>
  )
}

function ApplicationCard({
  academyId,
  student,
  application,
}: {
  academyId: string | null
  student: Student
  application: Pick<DocumentStudent, 'kwspAppliedAt' | 'kwspCreatedAt'>
}) {
  const { t } = useT()
  const update = useUpdateMyDetails(academyId)
  const apply = useApplyForKwspLetter(student.id)
  // An IC number staff typed freehand can be one the save would refuse, so it
  // counts as missing too — and is offered back to be corrected.
  const storedIc = normalizeIcNumber(student.ic_number ?? '')
  const needsIc = !storedIc

  const [icNumber, setIcNumber] = useState(student.ic_number ?? '')
  const [err, setErr] = useState<string | null>(null)

  const state = kwspState(application)

  if (state !== 'none') {
    const status = KWSP_APPLICATION_STATUS[state]
    return (
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Badge variant="outline" className={TONE_CLASS[status.tone]}>
            {t(status.labelKey)}
          </Badge>
          <span className="text-muted-foreground text-xs">
            {state === 'created'
              ? fmtDate(application.kwspCreatedAt)
              : t('sdoc.kwsp.applied_on', {
                  date: fmtDate(application.kwspAppliedAt),
                })}
          </span>
        </CardContent>
      </Card>
    )
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setErr(null)

    const ic = needsIc ? normalizeIcNumber(icNumber) : storedIc
    if (!ic) {
      setErr(
        t(ic === null ? 'lacct.profile.ic_invalid' : 'sdoc.offer.ic_required'),
      )
      return
    }

    try {
      // The function writes every field it is given, so the three this page
      // does not ask about go back exactly as they are.
      if (needsIc) {
        await update.mutateAsync({
          studentId: student.id,
          icNumber: ic,
          organization: student.organization ?? '',
          address: student.address ?? '',
          personalAddress: student.personal_address ?? '',
        })
      }
      await apply.mutateAsync()
    } catch (e2) {
      setErr(errorMessage(e2, t('common.error')))
    }
  }

  const busy = update.isPending || apply.isPending

  return (
    <Card>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-4">
          {needsIc ? (
            <div className="grid gap-2">
              <Label htmlFor="kwsp_ic">{t('students.field.ic')}</Label>
              <Input
                id="kwsp_ic"
                value={icNumber}
                maxLength={30}
                autoComplete="off"
                onChange={(e) => setIcNumber(e.target.value)}
                placeholder={t('students.form.ic_placeholder')}
                className="sm:max-w-xs"
              />
            </div>
          ) : null}

          {err ? <p className="text-destructive text-sm">{err}</p> : null}

          <div>
            {/* Stays off once applied: the status replaces this form as soon
                as the record is read again. */}
            <Button type="submit" disabled={busy || apply.isSuccess}>
              {busy ? t('sdoc.kwsp_app.applying') : t('sdoc.kwsp_app.apply')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
