import { useEffect, useState } from 'react'
import { useT } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
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
import { Switch } from '@/components/ui/switch'
import {
  SLOT_MINUTES,
  useSaveBookingSettings,
  type AssignmentMode,
  type BookingSettings,
} from './api'
import { errorMessage } from '@/lib/errors'

/** '' means unlimited, which is what a null column means. */
function numOrNull(value: string): number | null {
  const n = Number(value)
  return value.trim() === '' || !Number.isFinite(n) ? null : n
}

/**
 * The policy: whether the door is open, how long a session is, and who picks
 * the teacher.
 *
 * The switch is the CardAction and saves on its own, matching the enrollment
 * link card — opening booking is one decision and should not need a Save. The
 * fields below it are a form, because changing a slot length while somebody is
 * mid-thought about the horizon should not fire two writes.
 */
export function BookingSettingsCard({
  academyId,
  settings,
  canEdit,
}: {
  academyId: string
  settings: BookingSettings | null
  canEdit: boolean
}) {
  const { t } = useT()
  const save = useSaveBookingSettings(academyId)

  const [slot, setSlot] = useState('60')
  const [mode, setMode] = useState<AssignmentMode>('round_robin')
  const [notice, setNotice] = useState('12')
  const [horizon, setHorizon] = useState('30')
  const [maxOpen, setMaxOpen] = useState('1')
  const [maxWeek, setMaxWeek] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setSlot(String(settings?.slot_minutes ?? 60))
    setMode(settings?.assignment_mode ?? 'round_robin')
    setNotice(String(settings?.min_notice_hours ?? 12))
    setHorizon(String(settings?.horizon_days ?? 30))
    setMaxOpen(
      settings?.max_open_per_student == null
        ? ''
        : String(settings.max_open_per_student),
    )
    setMaxWeek(
      settings?.max_per_week_per_student == null
        ? ''
        : String(settings.max_per_week_per_student),
    )
  }, [settings])

  async function submit() {
    setError(null)
    setSaved(false)
    try {
      await save.mutateAsync({
        slot_minutes: Number(slot),
        assignment_mode: mode,
        min_notice_hours: Number(notice),
        horizon_days: Number(horizon),
        max_open_per_student: numOrNull(maxOpen),
        max_per_week_per_student: numOrNull(maxWeek),
      })
      setSaved(true)
    } catch (err) {
      setError(errorMessage(err, t('common.error')))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('appt.settings.title')}</CardTitle>
        <CardDescription>{t('appt.settings.description')}</CardDescription>
        <CardAction>
          <Switch
            checked={!!settings?.is_open}
            disabled={!canEdit || save.isPending}
            onCheckedChange={(v) => save.mutate({ is_open: v })}
            aria-label={t('appt.settings.open')}
          />
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="slot-minutes">{t('appt.settings.slot')}</Label>
            <Select
              value={slot}
              onValueChange={setSlot}
              disabled={!canEdit}
            >
              <SelectTrigger id="slot-minutes">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SLOT_MINUTES.map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {t('appt.settings.minutes', { count: m })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="assignment-mode">{t('appt.settings.mode')}</Label>
            <Select
              value={mode}
              onValueChange={(v) => setMode(v as AssignmentMode)}
              disabled={!canEdit}
            >
              <SelectTrigger id="assignment-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="round_robin">
                  {t('appt.settings.mode.round_robin')}
                </SelectItem>
                <SelectItem value="student_choice">
                  {t('appt.settings.mode.student_choice')}
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              {mode === 'round_robin'
                ? t('appt.settings.mode.round_robin_hint')
                : t('appt.settings.mode.student_choice_hint')}
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="min-notice">{t('appt.settings.notice')}</Label>
            <Input
              id="min-notice"
              type="number"
              min="0"
              max="720"
              step="1"
              inputMode="numeric"
              value={notice}
              disabled={!canEdit}
              onChange={(e) => setNotice(e.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              {t('appt.settings.notice_hint')}
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="horizon">{t('appt.settings.horizon')}</Label>
            <Input
              id="horizon"
              type="number"
              min="1"
              max="180"
              step="1"
              inputMode="numeric"
              value={horizon}
              disabled={!canEdit}
              onChange={(e) => setHorizon(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="max-open">{t('appt.settings.max_open')}</Label>
            <Input
              id="max-open"
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              value={maxOpen}
              disabled={!canEdit}
              onChange={(e) => setMaxOpen(e.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              {t('appt.settings.max_open_hint')}
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="max-week">{t('appt.settings.max_week')}</Label>
            <Input
              id="max-week"
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              value={maxWeek}
              disabled={!canEdit}
              onChange={(e) => setMaxWeek(e.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              {t('appt.settings.max_week_hint')}
            </p>
          </div>
        </div>

        {error ? <p className="text-destructive text-sm">{error}</p> : null}

        {canEdit ? (
          <div className="flex items-center gap-3">
            <Button type="button" onClick={submit} disabled={save.isPending}>
              {save.isPending ? t('common.saving') : t('common.save')}
            </Button>
            {saved && !save.isPending ? (
              <span className="text-muted-foreground text-sm">
                {t('common.saved')}
              </span>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
