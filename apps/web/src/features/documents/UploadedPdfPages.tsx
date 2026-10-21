import { useRef, useState, type ChangeEvent } from 'react'
import { ExternalLink, Upload } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { errorMessage } from '@/lib/errors'
import { fmtDate, personName } from '@/lib/format'
import { TONE_CLASS } from '@/lib/tone'
import { cn } from '@/lib/utils'
import { useStudentAcademy } from '@/lib/studentAcademy'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/patterns/PageHeader'
import { ErrorBlock, LoadingBlock } from '@/components/patterns/QueryState'
import { NoStudentRecord } from '@/components/learn/NoStudentRecord'
import { useMyStudent } from '@/features/learn/api'
import { DocumentStudentList } from './DocumentStudentList'
import { EmploymentLetterReview } from './EmploymentLetterReview'
import {
  EMPLOYMENT_LETTER_STATUS,
  useMyPdf,
  useOpenPdf,
  useUploadMyPdf,
  type DocumentStudent,
  type UploadedPdf,
  type UploadedPdfKind,
} from './api'

/**
 * The two documents a student uploads — the IC copy and the employment letter
 * — are one shape: a PDF, one per student, sent by the student and read by an
 * admin. These are their two pages, written once. See docs/documents.md.
 */

/** Where each kind sits on a roster row. */
const onFile: Record<UploadedPdfKind, (s: DocumentStudent) => UploadedPdf | null> =
  {
    ic: (s) => s.icCopy,
    employment: (s) => s.employmentLetter,
  }

/** The latest intake at the top. */
const courseStart = (s: DocumentStudent) => s.course?.start_date

/** Employment letters still waiting on an admin, ahead of the rest. */
const awaitingReview = (s: DocumentStudent) =>
  s.employmentLetter?.status === 'pending'

/**
 * Who has sent theirs, and the file itself. Read-only for staff: the student
 * uploads their own. Opening one mints a link for that click — the bucket is
 * private and nothing here holds a URL.
 *
 * Newest course first, and opens on the students who have uploaded: what an
 * admin comes here to look at.
 *
 * The employment letter is also reviewed: each row says where it stands, the
 * letters waiting on an admin come first, and the row carries the answer.
 */
export function UploadedPdfRoster({
  kind,
  title,
}: {
  kind: UploadedPdfKind
  title: string
}) {
  const { t } = useT()
  const open = useOpenPdf(kind)
  const [error, setError] = useState<string | null>(null)
  const pick = onFile[kind]
  const reviewed = kind === 'employment'

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader title={title} />
      {error ? <p className="text-destructive mt-4 text-sm">{error}</p> : null}
      <DocumentStudentList
        latestFirst={courseStart}
        first={reviewed ? awaitingReview : undefined}
        statusFilter={{
          label: t('common.status'),
          allLabel: t('sdoc.offer.all_statuses'),
          defaultValue: 'uploaded',
          options: [
            { value: 'uploaded', label: t('sdoc.file.uploaded') },
            ...(reviewed
              ? (['pending', 'accepted', 'rejected'] as const).map((v) => ({
                  value: v,
                  label: t(EMPLOYMENT_LETTER_STATUS[v].labelKey),
                }))
              : []),
            { value: 'missing', label: t('sdoc.file.not_uploaded') },
          ],
          matches: (s, value) => {
            const file = pick(s)
            if (value === 'missing') return !file
            if (value === 'uploaded') return !!file
            return file?.status === value
          },
        }}
        lastHead={title}
        lastCell={(s) => {
          const file = pick(s)
          const review =
            reviewed && file?.status
              ? EMPLOYMENT_LETTER_STATUS[file.status]
              : null
          return file ? (
            <div className="flex items-center justify-end gap-3">
              <span className="text-muted-foreground text-xs">
                {fmtDate(file.created_at)}
              </span>
              {review ? (
                <span
                  className={cn('text-xs', TONE_CLASS[review.tone])}
                  // What the student was told, for the admin who told them.
                  title={file.review_note ?? undefined}
                >
                  {t(review.labelKey)}
                </span>
              ) : null}
              <Button
                variant="outline"
                size="sm"
                disabled={open.isPending && open.variables === s.id}
                onClick={() => {
                  setError(null)
                  open.mutate(s.id, {
                    onError: (e) => setError(errorMessage(e, t('common.error'))),
                  })
                }}
              >
                <ExternalLink /> {t('common.view')}
              </Button>
              {reviewed ? (
                <EmploymentLetterReview
                  studentId={s.id}
                  studentName={personName(s.full_name, s.email) ?? s.student_no}
                  letter={file}
                  onError={setError}
                />
              ) : null}
            </div>
          ) : (
            <span className="text-muted-foreground text-sm">
              {t('sdoc.file.not_uploaded')}
            </span>
          )
        }}
      />
    </div>
  )
}

/** The bucket's own cap; checked here only so the message is translated. */
const MAX_MB = 10

/**
 * The student's own copy: send it, look at it, send a better one.
 *
 * PDF only. The picker is narrowed to PDF and the file is checked here so the
 * refusal arrives in the reader's language, but the rule is the function's —
 * it reads the file's first bytes, not the name it arrived under.
 */
export function OwnPdfUpload({
  kind,
  title,
  pdfOnly,
}: {
  kind: UploadedPdfKind
  title: string
  /** The refusal for a file that is not a PDF, naming the document. */
  pdfOnly: string
}) {
  const { t } = useT()
  const { academyId } = useStudentAcademy()
  const student = useMyStudent(academyId)
  const studentId = student.data?.id
  const copy = useMyPdf(kind, studentId)
  const upload = useUploadMyPdf(kind, studentId)
  const open = useOpenPdf(kind)
  const input = useRef<HTMLInputElement>(null)
  const [err, setErr] = useState<string | null>(null)

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Cleared so picking the same file again after a failure still fires.
    e.target.value = ''
    if (!file) return
    setErr(null)
    if (file.type !== 'application/pdf') {
      setErr(pdfOnly)
      return
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setErr(t('sdoc.file.too_large', { max: MAX_MB }))
      return
    }
    try {
      await upload.mutateAsync(file)
    } catch (e2) {
      setErr(errorMessage(e2, t('upload.failed')))
    }
  }

  const error = student.error ?? copy.error
  const loading = student.isLoading || (!!studentId && copy.isLoading)
  // Only the employment letter is reviewed; an IC copy has no status.
  const review = copy.data?.status
    ? EMPLOYMENT_LETTER_STATUS[copy.data.status]
    : null

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader title={title} />
      <div className="mt-6">
        {loading ? (
          <LoadingBlock />
        ) : error ? (
          <ErrorBlock error={error} />
        ) : !studentId ? (
          <NoStudentRecord />
        ) : (
          <Card>
            <CardContent className="grid gap-4">
              {copy.data ? (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {copy.data.file_name}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {t('sdoc.file.uploaded_on', {
                        date: fmtDate(copy.data.created_at),
                      })}
                    </p>
                  </div>
                  {review ? (
                    <Badge
                      variant="outline"
                      className={TONE_CLASS[review.tone]}
                    >
                      {t(review.labelKey)}
                    </Badge>
                  ) : null}
                </div>
              ) : null}

              {/* What the admin wants fixed; uploading a new file answers it. */}
              {copy.data?.status === 'rejected' && copy.data.review_note ? (
                <p className="text-destructive text-sm whitespace-pre-line">
                  {copy.data.review_note}
                </p>
              ) : null}

              {err ? <p className="text-destructive text-sm">{err}</p> : null}

              <div className="flex flex-wrap gap-2">
                <input
                  ref={input}
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={(e) => void onPick(e)}
                />
                <Button
                  variant={copy.data ? 'outline' : 'default'}
                  disabled={upload.isPending}
                  onClick={() => input.current?.click()}
                >
                  <Upload />{' '}
                  {upload.isPending
                    ? t('common.uploading')
                    : copy.data
                      ? t('sdoc.file.replace')
                      : t('sdoc.file.choose')}
                </Button>
                {copy.data ? (
                  <Button
                    variant="outline"
                    disabled={open.isPending}
                    onClick={() => {
                      setErr(null)
                      open.mutate(studentId, {
                        onError: (e) =>
                          setErr(errorMessage(e, t('common.error'))),
                      })
                    }}
                  >
                    <ExternalLink /> {t('common.view')}
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
