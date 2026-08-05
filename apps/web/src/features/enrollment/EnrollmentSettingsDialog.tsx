import { useEffect, useState, type FormEvent } from 'react'
import { useT } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import type { TKey } from '@/lib/i18n'
import {
  OPTIONAL_APPLICANT_FIELDS,
  useSaveEnrollmentSettings,
  type ApplicantField,
  type EnrollmentSettings,
} from './api'

const FIELD_LABEL: Record<ApplicantField, TKey> = {
  full_name: 'enroll.field.full_name',
  email: 'enroll.field.email',
  phone: 'enroll.field.phone',
  ic_number: 'enroll.field.ic_number',
  date_of_birth: 'enroll.field.date_of_birth',
  gender: 'enroll.field.gender',
  address: 'enroll.field.address',
  organization: 'enroll.field.organization',
}

/** ISO instant -> the yyyy-mm-dd an <input type="date"> wants, in local time. */
function toDateInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * "Close on the 14th" means the 14th is still a day you can apply, so the stored
 * instant is the END of the chosen day in the browser's timezone — which for
 * this product is always Malaysia.
 */
function fromDateInput(value: string): string | null {
  if (!value) return null
  const d = new Date(`${value}T23:59:59`)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export function EnrollmentSettingsDialog({
  academyId,
  courseId,
  settings,
  open,
  onOpenChange,
}: {
  academyId: string
  courseId: string
  settings: EnrollmentSettings | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useT()
  const save = useSaveEnrollmentSettings(academyId, courseId)

  const [capacity, setCapacity] = useState('')
  const [closesAt, setClosesAt] = useState('')
  const [intro, setIntro] = useState('')
  const [fields, setFields] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setCapacity(settings?.capacity != null ? String(settings.capacity) : '')
    setClosesAt(toDateInput(settings?.closes_at ?? null))
    setIntro(settings?.intro ?? '')
    setFields(settings?.required_fields ?? ['full_name', 'phone'])
    setError(null)
  }, [open, settings])

  const toggle = (field: string, on: boolean) =>
    setFields((prev) =>
      on ? [...new Set([...prev, field])] : prev.filter((f) => f !== field),
    )

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const seats = capacity.trim() === '' ? null : Number(capacity)
    if (seats !== null && (!Number.isInteger(seats) || seats < 1)) {
      setError(t('enroll.settings.capacity_hint'))
      return
    }
    try {
      await save.mutateAsync({
        capacity: seats,
        closes_at: fromDateInput(closesAt),
        intro: intro.trim() || null,
        // full_name is not a choice — the DB check constraint requires it.
        required_fields: [...new Set(['full_name', ...fields])],
      })
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('enroll.settings.dialog.title')}</DialogTitle>
          <DialogDescription>
            {t('enroll.settings.dialog.description')}
          </DialogDescription>
        </DialogHeader>

        <form
          id="enrollment-settings-form"
          className="grid max-h-[60vh] gap-4 overflow-y-auto pr-1"
          onSubmit={onSubmit}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="capacity">{t('enroll.settings.capacity')}</Label>
              <Input
                id="capacity"
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
              />
              <p className="text-muted-foreground text-xs">
                {t('enroll.settings.capacity_hint')}
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="closes-at">{t('enroll.settings.closes_at')}</Label>
              <Input
                id="closes-at"
                type="date"
                value={closesAt}
                onChange={(e) => setClosesAt(e.target.value)}
              />
              <p className="text-muted-foreground text-xs">
                {t('enroll.settings.closes_at_hint')}
              </p>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="intro">{t('enroll.settings.intro')}</Label>
            <Textarea
              id="intro"
              rows={3}
              placeholder={t('enroll.settings.intro_placeholder')}
              value={intro}
              onChange={(e) => setIntro(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label>{t('enroll.settings.required')}</Label>
            <p className="text-muted-foreground text-xs">
              {t('enroll.settings.required_hint')}
            </p>
            <div className="mt-1 grid gap-2 sm:grid-cols-2">
              {OPTIONAL_APPLICANT_FIELDS.map((field) => (
                <div key={field} className="flex items-center gap-2">
                  <Checkbox
                    id={`field-${field}`}
                    // email is always collected, so it shows ticked and fixed
                    // rather than being hidden — a list without it reads as
                    // "we do not ask for an email".
                    checked={field === 'email' || fields.includes(field)}
                    disabled={field === 'email'}
                    onCheckedChange={(v) => toggle(field, v === true)}
                  />
                  <Label
                    htmlFor={`field-${field}`}
                    className="font-normal"
                  >
                    {t(FIELD_LABEL[field])}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          {error ? <p className="text-destructive text-sm">{error}</p> : null}
        </form>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={save.isPending}
            onClick={() => onOpenChange(false)}
          >
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            form="enrollment-settings-form"
            disabled={save.isPending}
          >
            {save.isPending ? t('common.saving') : t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
