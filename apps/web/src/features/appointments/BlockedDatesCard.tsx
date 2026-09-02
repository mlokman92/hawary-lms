import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { addDays, fmtDayLong, today, ymdOf, zonedDayStart, type Ymd } from './calendar'
import {
  useAddTimeOff,
  useDeleteTimeOff,
  type BookableInstructor,
  type TimeOffRow,
} from './api'
import { errorMessage } from '@/lib/errors'
import { personName } from '@/lib/format'

/**
 * Days nothing can be booked — a public holiday, or somebody away.
 *
 * This used to be the lower half of `AvailabilityCard`, on the argument that
 * when the academy is open and when it is shut anyway are the same question.
 * They stopped being the same question when the two halves got different
 * audiences: opening hours are academy policy and belong to an admin, while
 * blocking a week off is something an instructor does for themselves and always
 * could — `booking time off: admin or own insert` has read
 * `app.is_admin(academy_id) OR app.owns_instructor(instructor_id)` since the
 * table was created. Only the UI ever said otherwise.
 *
 * So one card, two audiences:
 *
 * - an **admin** picks who, including "the whole academy" (a null
 *   `instructor_id`), and sees and removes every block;
 * - an **instructor** has nothing to pick — it is them — and sees their own
 *   blocks plus any academy-wide closure, which is context they need before
 *   deciding whether to block anything at all. They cannot remove the
 *   academy-wide ones, and `app.owns_instructor` would refuse if the button
 *   were there.
 *
 * The instructor's list is filtered here for *display*. It is not a boundary:
 * `booking time off: staff read` is `app.is_staff`, so a trainer's own JWT can
 * still read every block in the academy from PostgREST. Narrowing that policy
 * is a separate decision from adding this screen, and is noted in
 * `docs/appointments.md`.
 */
export function BlockedDatesCard({
  academyId,
  tz,
  locale,
  timeOff,
  instructors,
  isAdmin,
  myInstructorId,
}: {
  academyId: string
  tz: string
  locale: string
  timeOff: TimeOffRow[]
  /** The pool, for the admin's "who" picker. Unused by an instructor. */
  instructors: BookableInstructor[]
  isAdmin: boolean
  /** The caller's own instructor record, when they have one. */
  myInstructorId: string | null
}) {
  const { t } = useT()
  const addOff = useAddTimeOff(academyId)
  const delOff = useDeleteTimeOff(academyId)

  const [open, setOpen] = useState(false)
  const [who, setWho] = useState('all')
  const [from, setFrom] = useState<Ymd>(() => today(tz))
  const [to, setTo] = useState<Ymd>(() => today(tz))
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  // An admin may close dates for anybody; an instructor only for themselves,
  // and only if they have a record to be booked against in the first place.
  const canEdit = isAdmin || !!myInstructorId

  const rows = isAdmin
    ? timeOff
    : timeOff.filter(
        (o) => o.instructor_id === myInstructorId || o.instructor_id === null,
      )

  async function submit() {
    if (to < from) {
      setError(t('appt.timeoff.range_invalid'))
      return
    }
    setError(null)
    try {
      await addOff.mutateAsync({
        // The server decides whether this is allowed; sending our own id is
        // what makes it allowed, not a claim that it is.
        instructor_id: isAdmin ? (who === 'all' ? null : who) : myInstructorId,
        // Whole days, inclusive of the last one — so the stored window runs to
        // the start of the day after.
        starts_at: zonedDayStart(from, tz).toISOString(),
        ends_at: zonedDayStart(addDays(to, 1), tz).toISOString(),
        reason: reason.trim() || null,
      })
      setOpen(false)
      setReason('')
    } catch (err) {
      setError(errorMessage(err, t('common.error')))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {isAdmin ? t('appt.timeoff.title') : t('appt.timeoff.mine_title')}
        </CardTitle>
        <CardDescription>
          {isAdmin
            ? t('appt.timeoff.description')
            : t('appt.timeoff.mine_description')}
        </CardDescription>
        {canEdit ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setOpen((v) => !v)}
          >
            <Plus /> {t('appt.timeoff.add')}
          </Button>
        ) : null}
      </CardHeader>

      <CardContent className="grid gap-4">
        {open && canEdit ? (
          <div className="grid gap-3 rounded-md border p-3">
            {/* No picker for an instructor: there is exactly one answer, and a
                control with one option is not a control. */}
            {isAdmin ? (
              <div className="grid gap-1.5">
                <Label htmlFor="off-who">{t('appt.timeoff.who')}</Label>
                <Select value={who} onValueChange={setWho}>
                  <SelectTrigger id="off-who">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      {t('appt.timeoff.whole_academy')}
                    </SelectItem>
                    {instructors.map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        {personName(i.full_name) ?? t('common.unnamed')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div className="flex flex-wrap items-end gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="off-from">{t('appt.timeoff.from')}</Label>
                <Input
                  id="off-from"
                  type="date"
                  value={from}
                  onChange={(e) => e.target.value && setFrom(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="off-to">{t('appt.timeoff.to')}</Label>
                <Input
                  id="off-to"
                  type="date"
                  value={to}
                  min={from}
                  onChange={(e) => e.target.value && setTo(e.target.value)}
                />
              </div>
              <div className="grid flex-1 gap-1.5">
                <Label htmlFor="off-reason">{t('appt.timeoff.reason')}</Label>
                <Input
                  id="off-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={t('appt.timeoff.reason_placeholder')}
                />
              </div>
              <Button type="button" disabled={addOff.isPending} onClick={submit}>
                {t('common.add')}
              </Button>
            </div>
            {error ? <p className="text-destructive text-sm">{error}</p> : null}
          </div>
        ) : null}

        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t('appt.timeoff.none')}
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {rows.map((o) => {
              // Only an admin removes an academy-wide closure or somebody
              // else's; the RLS policy says the same, so the button matches
              // what the database will actually accept.
              const mayRemove =
                isAdmin ||
                (!!myInstructorId && o.instructor_id === myInstructorId)
              return (
                <li
                  key={o.id}
                  className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate">
                      {/* Whether the whole academy is closed is `instructor_id`
                          being null — not the instructor being nameless. Read
                          off the name, one unnamed instructor's afternoon off
                          read as the academy shutting for the day. */}
                      {o.instructor_id
                        ? (personName(o.instructors?.full_name) ??
                          t('common.unnamed'))
                        : t('appt.timeoff.whole_academy')}
                      {o.reason ? (
                        <span className="text-muted-foreground">
                          {' '}
                          · {o.reason}
                        </span>
                      ) : null}
                    </p>
                    <p className="text-muted-foreground">
                      {fmtDayLong(ymdOf(o.starts_at, tz), locale)} –{' '}
                      {/* Stored exclusive: step back inside the window to name
                          the last day that is actually closed. */}
                      {fmtDayLong(
                        ymdOf(new Date(new Date(o.ends_at).getTime() - 1000), tz),
                        locale,
                      )}
                    </p>
                  </div>
                  {mayRemove ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => delOff.mutate(o.id)}
                    >
                      {t('common.delete')}
                    </Button>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
