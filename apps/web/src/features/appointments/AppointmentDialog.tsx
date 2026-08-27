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
} from './api'
import { errorMessage } from '@/lib/errors'

/**
 * One session, and the three things staff do to it: mark it done, mark it
 * missed, or call it off. Cancelling is the only one that returns the slot to
 * the pool, so it is the only one that asks for a reason.
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
  const cancel = useCancelAppointment(academyId)
  const setStatus = useSetAppointmentStatus(academyId)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setReason('')
    setError(null)
  }, [appointment?.id])

  if (!appointment) return null

  const meta = APPOINTMENT_STATUS[appointment.status]
  const isOpen = appointment.status === 'booked'

  async function run(fn: () => Promise<unknown>) {
    setError(null)
    try {
      await fn()
      onOpenChange(false)
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

        {isOpen ? (
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

        {error ? <p className="text-destructive text-sm">{error}</p> : null}

        <DialogFooter className="sm:justify-between">
          <Button asChild variant="ghost">
            <Link to={`/students/${appointment.student_id}`}>
              {t('appt.open_student')}
            </Link>
          </Button>
          {isOpen ? (
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
                onClick={() =>
                  run(() =>
                    cancel.mutateAsync({ id: appointment.id, reason }),
                  )
                }
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
