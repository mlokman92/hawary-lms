import { useState } from 'react'
import { Check, ExternalLink, X } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { errorMessage } from '@/lib/errors'
import { fmtDate, fmtDateTime, personName } from '@/lib/format'
import { TONE_CLASS } from '@/lib/tone'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { RejectDialog } from './EmploymentLetterReview'
import {
  EMPLOYMENT_LETTER_STATUS,
  useOpenPdf,
  usePdfPreviewUrl,
  useReviewEmploymentLetter,
  type DocumentStudent,
  type UploadedPdf,
  type UploadedPdfKind,
} from './api'

/**
 * Where a reviewed letter stands, as two short lines: *Pending review* over the
 * upload date, or *Accepted by / Rejected by {name}* over when. The letters on
 * file when the review arrived (2026-10-22) were accepted by the migration,
 * not by an admin, and say *Accepted automatically*. The note is on hover.
 */
export function ReviewStatus({
  file,
  className,
}: {
  file: UploadedPdf
  className?: string
}) {
  const { t } = useT()
  const review = file.status ? EMPLOYMENT_LETTER_STATUS[file.status] : null
  const reviewer = file.reviewed_by_name?.trim()
  const answered =
    !!reviewer && (file.status === 'accepted' || file.status === 'rejected')
  const autoAccepted =
    file.status === 'accepted' && !file.reviewed_at && !reviewer
  return (
    <div
      className={cn('text-xs leading-tight', className)}
      title={file.review_note ?? undefined}
    >
      {review ? (
        <div className={cn('font-medium', TONE_CLASS[review.tone])}>
          {answered
            ? t(
                file.status === 'accepted'
                  ? 'sdoc.review.accepted_by'
                  : 'sdoc.review.rejected_by',
                { name: reviewer },
              )
            : autoAccepted
              ? t('sdoc.review.accepted_auto')
              : t(review.labelKey)}
        </div>
      ) : null}
      <div className="text-muted-foreground whitespace-nowrap">
        {answered ? fmtDateTime(file.reviewed_at) : fmtDate(file.created_at)}
      </div>
    </div>
  )
}

/**
 * The PDF, with something in its place until it has drawn — the receipt
 * sheet's preview, for the same two waits (the link, then the file). Keyed by
 * the link, so a replaced file starts over.
 */
function PdfPreview({ url, name }: { url: string | undefined; name: string }) {
  const { t } = useT()
  const [loaded, setLoaded] = useState(false)
  return (
    <div className="bg-muted/40 relative min-h-64 flex-1 overflow-hidden rounded-lg border">
      {loaded ? null : (
        <div className="absolute inset-0 flex flex-col gap-3 p-4">
          <Skeleton className="h-5 w-2/5 rounded-md" />
          <Skeleton className="h-4 w-3/5 rounded-md" />
          <Skeleton className="min-h-0 flex-1 rounded-md" />
          <span className="sr-only">{t('common.loading')}</span>
        </div>
      )}
      {url ? (
        <iframe
          src={url}
          title={name}
          onLoad={() => setLoaded(true)}
          className="h-full w-full"
        />
      ) : null}
    </div>
  )
}

/**
 * One student's uploaded PDF, drawn beside the roster — and, for the
 * employment letter, the answer to it: *Accept* and *Reject…* above the file,
 * so reading and deciding are one place. A decision hands back to the roster
 * (`onDecided`), which moves on to the next letter waiting.
 */
export function UploadedPdfSheet({
  kind,
  student,
  onClose,
  onDecided,
}: {
  kind: UploadedPdfKind
  /** The student whose file is open; null closes the sheet. */
  student: DocumentStudent | null
  onClose: () => void
  onDecided: (studentId: string) => void
}) {
  const { t } = useT()
  const file =
    (kind === 'employment' ? student?.employmentLetter : student?.icCopy) ??
    null
  const preview = usePdfPreviewUrl(
    kind,
    student?.id ?? null,
    file?.created_at ?? null,
  )
  const openTab = useOpenPdf(kind)
  const review = useReviewEmploymentLetter()
  const [rejecting, setRejecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const reviewed = kind === 'employment' && !!file?.status
  const name = student
    ? (personName(student.full_name, student.email) ?? student.student_no)
    : ''

  function accept() {
    if (!student) return
    setError(null)
    review.mutate(
      { studentId: student.id, accept: true },
      {
        onSuccess: () => onDecided(student.id),
        onError: (e) => setError(errorMessage(e, t('common.error'))),
      },
    )
  }

  return (
    <Sheet open={!!student} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-3xl">
        <SheetHeader className="pr-14">
          <SheetTitle>{name || t('common.unnamed')}</SheetTitle>
          <SheetDescription>
            {student
              ? [student.student_no, student.course?.title, student.ic_number]
                  .filter(Boolean)
                  .join(' · ')
              : null}
          </SheetDescription>
        </SheetHeader>

        {student && file ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3 px-6 pb-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {reviewed ? (
                <ReviewStatus file={file} />
              ) : (
                <span className="text-muted-foreground text-xs">
                  {t('sdoc.file.uploaded_on', {
                    date: fmtDate(file.created_at),
                  })}
                </span>
              )}
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={openTab.isPending}
                  onClick={() => {
                    setError(null)
                    openTab.mutate(student.id, {
                      onError: (e) =>
                        setError(errorMessage(e, t('common.error'))),
                    })
                  }}
                >
                  <ExternalLink /> {t('common.open')}
                </Button>
                {reviewed ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={review.isPending}
                      onClick={() => setRejecting(true)}
                    >
                      <X /> {t('sdoc.review.reject')}
                    </Button>
                    {file.status === 'accepted' ? null : (
                      <Button
                        size="sm"
                        disabled={review.isPending}
                        onClick={accept}
                      >
                        <Check /> {t('sdoc.review.accept')}
                      </Button>
                    )}
                  </>
                ) : null}
              </div>
            </div>

            {file.status === 'rejected' && file.review_note ? (
              <p className="text-destructive text-sm whitespace-pre-line">
                {file.review_note}
              </p>
            ) : null}
            {error || preview.error ? (
              <p className="text-destructive text-sm">
                {error ?? errorMessage(preview.error, t('common.error'))}
              </p>
            ) : null}

            <PdfPreview
              key={preview.data ?? 'pending'}
              url={preview.data}
              name={file.file_name}
            />

            {reviewed ? (
              <RejectDialog
                open={rejecting}
                onOpenChange={setRejecting}
                studentName={name}
                initialNote={
                  file.status === 'rejected' ? (file.review_note ?? '') : ''
                }
                onReject={(note) =>
                  review
                    .mutateAsync({ studentId: student.id, accept: false, note })
                    .then(() => onDecided(student.id))
                }
              />
            ) : null}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
