import { useMemo, useState, type FormEvent } from 'react'
import { useT } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { APPLICANT_FIELDS, type ApplicantField } from './api'

/**
 * The applicant's form.
 *
 * `required_fields` decides what is ASKED FOR, not merely what is starred:
 * full name and email are always on the form, and anything else the academy
 * ticks appears and is mandatory. A form that shows eight fields so that two of
 * them can be optional is the version people abandon.
 */

/** Rendered in this order regardless of how required_fields is stored. */
const ORDER: ApplicantField[] = [...APPLICANT_FIELDS]

const LABEL: Record<ApplicantField, `enroll.field.${ApplicantField}`> = {
  full_name: 'enroll.field.full_name',
  email: 'enroll.field.email',
  phone: 'enroll.field.phone',
  ic_number: 'enroll.field.ic_number',
  date_of_birth: 'enroll.field.date_of_birth',
  gender: 'enroll.field.gender',
  address: 'enroll.field.address',
  organization: 'enroll.field.organization',
}

const AUTOCOMPLETE: Partial<Record<ApplicantField, string>> = {
  full_name: 'name',
  email: 'email',
  phone: 'tel',
  date_of_birth: 'bday',
  address: 'street-address',
  organization: 'organization',
}

export type ApplyValues = Record<string, string>

export function ApplyForm({
  requiredFields,
  initialValues,
  busy,
  error,
  submitLabel,
  onSubmit,
  onChange,
}: {
  requiredFields: ApplicantField[]
  initialValues: ApplyValues
  busy: boolean
  error: string | null
  submitLabel: string
  onSubmit: (values: ApplyValues) => void
  /** Every edit, so the caller can keep a draft without owning the state. */
  onChange?: (values: ApplyValues) => void
}) {
  const { t } = useT()
  // Seeded once. The caller waits for its prefill sources and remounts this via
  // `key` when the signed-in person changes; re-seeding from a prop that moved
  // would overwrite whatever is half-typed.
  const [values, setValues] = useState<ApplyValues>(initialValues)
  const [localError, setLocalError] = useState<string | null>(null)

  const shown = useMemo(() => {
    const wanted = new Set<ApplicantField>([
      'full_name',
      'email',
      ...requiredFields,
    ])
    return ORDER.filter((f) => wanted.has(f))
  }, [requiredFields])

  const set = (field: string, value: string) => {
    const next = { ...values, [field]: value }
    setValues(next)
    onChange?.(next)
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    const missing = shown.some((f) => !(values[f] ?? '').trim())
    if (missing) {
      setLocalError(t('enroll.form.required_error'))
      return
    }
    setLocalError(null)
    onSubmit(values)
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      {shown.map((field) => {
        const label = t(LABEL[field])

        if (field === 'gender') {
          return (
            <div key={field} className="grid gap-2">
              <Label>{label}</Label>
              <Select
                value={values.gender ?? ''}
                onValueChange={(v) => set('gender', v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t('enroll.gender.placeholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">{t('enroll.gender.male')}</SelectItem>
                  <SelectItem value="female">
                    {t('enroll.gender.female')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          )
        }

        if (field === 'address') {
          return (
            <div key={field} className="grid gap-2">
              <Label htmlFor={field}>{label}</Label>
              <Textarea
                id={field}
                rows={3}
                autoComplete={AUTOCOMPLETE[field]}
                value={values[field] ?? ''}
                onChange={(e) => set(field, e.target.value)}
              />
            </div>
          )
        }

        return (
          <div key={field} className="grid gap-2">
            <Label htmlFor={field}>{label}</Label>
            <Input
              id={field}
              type={
                field === 'date_of_birth'
                  ? 'date'
                  : field === 'email'
                    ? 'email'
                    : field === 'phone'
                      ? 'tel'
                      : 'text'
              }
              autoComplete={AUTOCOMPLETE[field]}
              value={values[field] ?? ''}
              onChange={(e) => set(field, e.target.value)}
            />
            {field === 'email' ? (
              <p className="text-muted-foreground text-xs">
                {t('enroll.field.email_hint')}
              </p>
            ) : null}
          </div>
        )
      })}

      <div className="grid gap-2">
        <Label htmlFor="notes">
          {t('enroll.field.notes')}{' '}
          <span className="text-muted-foreground font-normal">
            ({t('enroll.field.optional')})
          </span>
        </Label>
        <Textarea
          id="notes"
          rows={3}
          value={values.notes ?? ''}
          onChange={(e) => set('notes', e.target.value)}
        />
      </div>

      {localError ?? error ? (
        <p className="text-destructive text-sm">{localError ?? error}</p>
      ) : null}

      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? t('enroll.form.sending') : submitLabel}
      </Button>
    </form>
  )
}
