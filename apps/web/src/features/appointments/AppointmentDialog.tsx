import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { TONE_CLASS } from '@/lib/tone'
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
import { fmtRange, fmtWhen } from './calendar'
import {
  APPOINTMENT_STATUS,
  useCancelAppointment,
  useSetAppointmentStatus,
  type AppointmentRow,
  type CancelResult,
} from './api'
import { useAcademy } from '@/lib/academy'
import { useMyInstructorRecord } from '@/features/profile/api'
import { errorMessage } from '@/lib/errors'

/**
 * One session, and the three things staff do to it: mark it done, mark it
 * missed, or hand it on.
 *
 * Who may do them is worked out HERE rather than passed in by each of the four
 * screens that mount this, so the rule cannot drift between them: an admin, or
 * the instructor whose session it is. It mirrors the DB exactly — the
 * `appointments: admin or own instructor update` policy and
 * `cancel_appointment`'s own guard — because a button a person cannot use is
 * worse than no button, and this one would fail at the database.
 *
 * "Cancel session" no longer means the session stops. For staff the server
 * hands it to whoever can cover, keeping the same student and time, and only
 * calls it off when nobody can. So the outcome is reported instead of the
 * dialog just closing: "cancelled" would be a lie most of the time.
 */
export function AppointmentDialog({
  academyId,
  appointment,
  tz,
  locale,
  onOpenChange,
}: {
  academyId: string | null
  appointment: AppointmentRow | null
  tz: string
  locale: string
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useT()
  const { active } = useAcademy()
  const myInstructor = useMyInstructorRecord(academyId)
  const cancel = useCancelAppointment(academyId)
  const setStatus = useSetAppointmentStatus(academyId)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<CancelResult | null>(null)

  useEffect(() => {
    setReason('')
    setError(null)
    setOutcome(null)
  }, [appointment?.id])

  if (!appointment) return null

  const meta = APPOINTMENT_STATUS[appointment.status]
  const isOpen = appointment.status === 'booked'
  const canAct =
    active?.role === 'admin' ||
    (!!myInstructor.data && myInstructor.data.id === appointment.instructor_id)

  async function run(fn: () => Promise<unknown>) {
    setError(null)
    try {
      await fn()
      onOpenChange(false)
    } catch (err) {
      setError(errorMessage(err, t('common.error')))
    }
  }

  /**
   * Cancelling stays open on success. The row underneath has already changed,
   * but only this message can say which of the two things happened and who
   * picked the session up.
   */
  async function runCancel() {
    setError(null)
    try {
      setOutcome(await cancel.mutateAsync({ id: appointment!.id, reason }))
    } catch (err) {
      setError(errorMessage(err, t('common.error')))
    }
  }

  const busy = cancel.isPending || setStatus.isPending

  return (
    <Dialog open={!!appointment} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {appointment.students?.full_name ?? t('common.unnamed')}
          </DialogTitle>
          <DialogDescription>
            {fmtWhen(appointment.starts_at, tz, locale)} ·{' '}
            {fmtRange(appointment.starts_at, appointment.ends_at, tz)}
          </DialogDescription>
        </DialogHeader>

        <dl className="grid gap-3 text-sm">
          <Row label={t('appt.field.instructor')}>
            {appointment.instructors?.full_name ?? t('common.unnamed')}
            {appointment.auto_assigned ? (
              <span className="text-muted-foreground">
                {' '}
                · {t('appt.auto_assigned')}
              </span>
            ) : null}
          </Row>
          <Row label={t('appt.field.status')}>
            <span className={cn('font-medium', TONE_CLASS[meta.tone])}>
              {t(meta.labelKey)}
            </span>
          </Row>
          {appointment.note ? (
            <Row label={t('appt.field.note')}>{appointment.note}</Row>
          ) : null}
          {appointment.cancel_reason ? (
            <Row label={t('appt.field.cancel_reason')}>
              {appointment.cancel_reason}
            </Row>
          ) : null}
        </dl>

        {isOpen && canAct && !outcome ? (
          <div className="grid gap-2">
            <Label htmlFor="cancel-reason">{t('appt.cancel.reason')}</Label>
            <Input
              id="cancel-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('appt.cancel.reason_placeholder')}
            />
          </div>
        ) : null}

        {/* What actually happened. The session usually survives with somebody
            else, so the two outcomes read completely differently. */}
        {outcome ? (
          <p
            className={
              outcome.reassigned
                ? 'text-sm font-medium'
                : 'text-destructive text-sm font-medium'
            }
          >
            {outcome.reassigned
              ? t('appt.handover.done', {
                  name:
                    outcome.instructor?.full_name ?? t('common.unnamed'),
                })
              : t('appt.handover.none')}
          </p>
        ) : null}

        {error ? <p className="text-destructive text-sm">{error}</p> : null}

        <DialogFooter className="sm:justify-between">
          <Button asChild variant="ghost">
            <Link to={`/students/${appointment.student_id}`}>
              {t('appt.open_student')}
            </Link>
          </Button>
          {isOpen && canAct && !outcome ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  run(() =>
                    setStatus.mutateAsync({
                      id: appointment.id,
                      status: 'no_show',
                    }),
                  )
                }
              >
                {t('appt.action.no_show')}
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  run(() =>
                    setStatus.mutateAsync({
                      id: appointment.id,
                      status: 'completed',
                    }),
                  )
                }
              >
                {t('appt.action.complete')}
              </Button>
              <Button
                variant="destructive"
                disabled={busy}
                onClick={runCancel}
              >
                {t('appt.action.cancel')}
              </Button>
            </div>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Row({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  )
}
