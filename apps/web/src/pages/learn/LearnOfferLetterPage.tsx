import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Download, FileText } from 'lucide-react'
import { normalizeIcNumber } from '@hawary/shared'
import { useStudentAcademy } from '@/lib/studentAcademy'
import { useT } from '@/lib/i18n'
import { errorMessage } from '@/lib/errors'
import { fmtDay } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { PageHeader } from '@/components/patterns/PageHeader'
import { EmptyState } from '@/components/patterns/EmptyState'
import { ErrorBlock, LoadingBlock } from '@/components/patterns/QueryState'
import { NoStudentRecord } from '@/components/learn/NoStudentRecord'
import {
  useMyStudent,
  useUpdateMyDetails,
  type Student,
} from '@/features/learn/api'
import { useMyInvoices } from '@/features/learn/billing'
import {
  useMyDocumentCourse,
  type DocumentCourse,
} from '@/features/documents/api'
import { downloadOfferLetter } from '@/features/offer-letter/letter'

/**
 * The student's own offer letter.
 *
 * Three things have to be true before there is a letter to hand over, and the
 * page shows the first that is not:
 *   1. a course with a start date — it is the date the letter carries;
 *   2. a payment, of any amount, on any of their invoices. `amount_paid_sen`
 *      is the student's side of the ledger: it counts a bank transfer whether
 *      or not the academy has filed the receipt, so a student who paid is not
 *      kept waiting on the academy's paperwork;
 *   3. an IC number and a personal address, which the letter prints. Whichever
 *      is missing is asked for here, saved to the record, and then the letter
 *      downloads — one step, not a trip to the profile page and back.
 *
 * These are what the academy asks for, not an access boundary: the letter is
 * drawn in the browser from the student's own record.
 */
export function LearnOfferLetterPage() {
  const { t } = useT()
  const { academyId } = useStudentAcademy()
  const student = useMyStudent(academyId)
  const course = useMyDocumentCourse(academyId, student.data?.id)
  const invoices = useMyInvoices(academyId, student.data?.id)

  const header = <PageHeader title={t('sdoc.offer.title')} />
  const error = student.error ?? course.error ?? invoices.error
  const loading =
    student.isLoading ||
    (!!student.data && (course.isLoading || invoices.isLoading))

  let body
  if (loading) body = <LoadingBlock />
  else if (error) body = <ErrorBlock error={error} />
  else if (!student.data) body = <NoStudentRecord />
  else if (!course.data?.start_date)
    body = (
      <EmptyState
        size="block"
        icon={FileText}
        title={t('sdoc.offer.not_ready')}
      />
    )
  else if (!invoices.rows.some((i) => i.amount_paid_sen > 0))
    body = (
      <EmptyState
        size="block"
        icon={FileText}
        title={t('sdoc.offer.pay_first')}
      >
        <Button asChild>
          <Link to="/learn/billing">{t('sdoc.offer.go_to_billing')}</Link>
        </Button>
      </EmptyState>
    )
  else
    body = (
      <OfferLetterCard
        key={student.data.id}
        academyId={academyId}
        student={student.data}
        course={course.data}
      />
    )

  return (
    <div className="mx-auto w-full max-w-3xl">
      {header}
      <div className="mt-6">{body}</div>
    </div>
  )
}

function OfferLetterCard({
  academyId,
  student,
  course,
}: {
  academyId: string | null
  student: Student
  course: DocumentCourse
}) {
  const { t } = useT()
  const update = useUpdateMyDetails(academyId)
  // An IC number staff typed freehand can be one the save would refuse, so it
  // counts as missing too — and is offered back to be corrected.
  const storedIc = normalizeIcNumber(student.ic_number ?? '')
  const needsIc = !storedIc
  const needsAddress = !(student.personal_address ?? '').trim()

  const [icNumber, setIcNumber] = useState(student.ic_number ?? '')
  const [address, setAddress] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

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
    if (needsAddress && !address.trim()) {
      setErr(t('sdoc.offer.address_required'))
      return
    }

    setBusy(true)
    try {
      // The function writes every field it is given, so the two this page does
      // not ask about go back exactly as they are.
      const row =
        needsIc || needsAddress
          ? await update.mutateAsync({
              studentId: student.id,
              icNumber: ic,
              organization: student.organization ?? '',
              address: student.address ?? '',
              personalAddress: needsAddress
                ? address
                : (student.personal_address ?? ''),
            })
          : student
      await downloadOfferLetter({
        fullName: row.full_name,
        icNumber: row.ic_number,
        address: row.personal_address,
        startDate: course.start_date,
      })
    } catch (e2) {
      setErr(errorMessage(e2, t('sdoc.download_failed')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-4">
          <div>
            <p className="text-sm font-medium">{course.title}</p>
            <p className="text-muted-foreground text-xs">
              {fmtDay(course.start_date)}
            </p>
          </div>

          {needsIc ? (
            <div className="grid gap-2">
              <Label htmlFor="letter_ic">{t('students.field.ic')}</Label>
              <Input
                id="letter_ic"
                value={icNumber}
                maxLength={30}
                autoComplete="off"
                onChange={(e) => setIcNumber(e.target.value)}
                placeholder={t('students.form.ic_placeholder')}
              />
            </div>
          ) : null}
          {needsAddress ? (
            <div className="grid gap-2">
              <Label htmlFor="letter_address">
                {t('students.field.personal_address')}
              </Label>
              <Textarea
                id="letter_address"
                rows={3}
                value={address}
                maxLength={500}
                autoComplete="street-address"
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>
          ) : null}

          {err ? <p className="text-destructive text-sm">{err}</p> : null}

          <div>
            <Button type="submit" disabled={busy}>
              <Download />{' '}
              {needsIc || needsAddress
                ? t('sdoc.offer.save_and_download')
                : t('common.download')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
