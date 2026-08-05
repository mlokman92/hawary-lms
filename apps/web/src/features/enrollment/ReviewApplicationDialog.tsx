import { useEffect, useState, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { fmtDate, fmtDateTime } from '@/lib/format'
import { useT } from '@/lib/i18n'
import { useActiveStudentCounts } from '@/features/courses/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import {
  APPLICATION_STATUS_LABEL,
  useEnrollmentSettings,
  useMatchCandidates,
  useReviewApplication,
  type MatchCandidate,
  type QueueApplication,
} from './api'
import type { TKey } from '@/lib/i18n'

const CREATE_NEW = 'new'

const MATCH_LABEL: Record<MatchCandidate['match_reason'], TKey> = {
  verified_email: 'enroll.review.match.verified_email',
  email: 'enroll.review.match.email',
  ic: 'enroll.review.match.ic',
}

function Detail({ label, value }: { label: string; value: ReactNode }) {
  if (!value) return null
  return (
    <div className="grid grid-cols-3 gap-3 py-1.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="col-span-2 text-sm break-words">{value}</dd>
    </div>
  )
}

/**
 * Approve or reject one application.
 *
 * The duplicate panel is the interesting half. `application_match_candidates`
 * decides which existing record may be attached to the applicant's account —
 * only a CONFIRMED email match is `linkable`. An IC or unconfirmed-email match
 * is shown so the reviewer knows the roster needs tidying, but it cannot be
 * chosen: approving as new and merging by hand is the safe path.
 */
export function ReviewApplicationDialog({
  academyId,
  application,
  open,
  onOpenChange,
}: {
  academyId: string | null
  application: QueueApplication | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useT()
  const pending = application?.status === 'pending'
  const { data: candidates } = useMatchCandidates(
    pending ? application?.id : undefined,
  )
  const { data: settings } = useEnrollmentSettings(application?.course_id)
  const { data: counts } = useActiveStudentCounts(academyId)
  const review = useReviewApplication(academyId)

  const [note, setNote] = useState('')
  const [choice, setChoice] = useState<string>(CREATE_NEW)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setNote('')
    setChoice(CREATE_NEW)
    setError(null)
  }, [open, application?.id])

  if (!application) return null

  const taken = counts?.get(application.course_id) ?? 0
  const capacity = settings?.capacity ?? null
  const isFull = capacity !== null && taken >= capacity
  const linkable = (candidates ?? []).filter((c) => c.linkable)
  const warnings = (candidates ?? []).filter((c) => !c.linkable)

  async function decide(decision: 'approved' | 'rejected') {
    if (!application) return
    setError(null)
    try {
      await review.mutateAsync({
        id: application.id,
        decision,
        note,
        linkStudentId: choice === CREATE_NEW ? null : choice,
        // The reviewer has already been shown the over-capacity warning; the
        // RPC's own check is the backstop for a seat taken while they read it.
        force: true,
      })
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('enroll.review.title')}</DialogTitle>
          <DialogDescription>
            {[
              application.courses?.title,
              t('enroll.applied.on', { date: fmtDate(application.created_at) }),
            ]
              .filter(Boolean)
              .join(' · ')}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[55vh] overflow-y-auto pr-1">
          <dl className="divide-y">
            <Detail
              label={t('enroll.field.full_name')}
              value={application.full_name}
            />
            <Detail label={t('enroll.field.email')} value={application.email} />
            <Detail label={t('enroll.field.phone')} value={application.phone} />
            <Detail
              label={t('enroll.field.ic_number')}
              value={application.ic_number}
            />
            <Detail
              label={t('enroll.field.date_of_birth')}
              value={application.date_of_birth ? fmtDate(application.date_of_birth) : null}
            />
            <Detail
              label={t('enroll.field.gender')}
              value={
                application.gender
                  ? t(
                      application.gender === 'male'
                        ? 'enroll.gender.male'
                        : 'enroll.gender.female',
                    )
                  : null
              }
            />
            <Detail
              label={t('enroll.field.organization')}
              value={application.organization}
            />
            <Detail
              label={t('enroll.field.address')}
              value={application.address}
            />
            <Detail
              label={t('enroll.review.applicant_note')}
              value={application.notes}
            />
          </dl>

          {pending ? (
            <div className="mt-4 grid gap-4">
              {isFull ? (
                <p className="text-destructive flex items-start gap-2 text-sm">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {t('enroll.review.full_warning', {
                    taken,
                    capacity: capacity ?? 0,
                  })}
                </p>
              ) : null}

              {linkable.length > 0 ? (
                <div className="grid gap-2 rounded-lg border p-3">
                  <p className="text-sm font-medium">
                    {t('enroll.review.match.title')}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {t('enroll.review.match.body')}
                  </p>
                  <RadioGroup
                    value={choice}
                    onValueChange={setChoice}
                    className="mt-1 gap-2"
                  >
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value={CREATE_NEW} id="match-new" />
                      <Label htmlFor="match-new" className="font-normal">
                        {t('enroll.review.match.create_new')}
                      </Label>
                    </div>
                    {linkable.map((c) => (
                      <div key={c.student_id} className="flex items-center gap-2">
                        <RadioGroupItem value={c.student_id} id={c.student_id} />
                        <Label htmlFor={c.student_id} className="font-normal">
                          {t('enroll.review.match.link', {
                            name: c.full_name ?? c.student_no,
                          })}{' '}
                          <span className="text-muted-foreground">
                            · {t(MATCH_LABEL[c.match_reason])}
                          </span>
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>
              ) : null}

              {warnings.length > 0 ? (
                <div className="text-muted-foreground grid gap-1 rounded-lg border border-dashed p-3 text-xs">
                  <p className="text-foreground text-sm font-medium">
                    {t('enroll.review.match.title')}
                  </p>
                  {warnings.map((c) => (
                    <p key={c.student_id}>
                      {c.full_name ?? c.student_no} · {c.student_no} ·{' '}
                      {t(MATCH_LABEL[c.match_reason])}
                    </p>
                  ))}
                  <p className="mt-1">{t('enroll.review.match.not_linkable')}</p>
                </div>
              ) : null}

              <div className="grid gap-2">
                <Label htmlFor="review-note">
                  {t('enroll.review.note_label')}
                </Label>
                <Textarea
                  id="review-note"
                  rows={2}
                  placeholder={t('enroll.review.note_placeholder')}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>

              <p className="text-muted-foreground text-xs">
                {t('enroll.review.what_happens')}
              </p>
            </div>
          ) : (
            <div className="mt-4 grid gap-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">
                  {t(APPLICATION_STATUS_LABEL[application.status])}
                </Badge>
                <span className="text-muted-foreground text-xs">
                  {t('enroll.review.reviewed_on', {
                    date: fmtDateTime(application.reviewed_at),
                  })}
                </span>
              </div>
              {application.review_note ? (
                <p className="bg-muted rounded-md border p-3 text-sm">
                  {application.review_note}
                </p>
              ) : null}
            </div>
          )}
        </div>

        {error ? <p className="text-destructive text-sm">{error}</p> : null}

        <DialogFooter>
          {pending ? (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={review.isPending}
                onClick={() => void decide('rejected')}
              >
                {review.isPending
                  ? t('enroll.review.rejecting')
                  : t('enroll.review.reject')}
              </Button>
              <Button
                type="button"
                disabled={review.isPending}
                onClick={() => void decide('approved')}
              >
                {review.isPending
                  ? t('enroll.review.approving')
                  : t('enroll.review.approve')}
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t('common.close')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
