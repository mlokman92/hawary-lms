import { useState, type FormEvent } from 'react'
import { normalizeIcNumber } from '@hawary/shared'
import { useT } from '@/lib/i18n'
import { errorMessage } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useUpdateMyDetails, type Student } from './api'

/**
 * The part of the academy's record a student writes themselves: the IC number
 * — they are the one holding the card — and the organization and address their
 * invoice and receipt print under "Bill to", which only they know a sponsor's
 * requirements for. Everything else on the record stays with staff.
 */
export function StudentDetailsCard({
  academyId,
  student,
}: {
  academyId: string
  student: Student
}) {
  const { t } = useT()
  const update = useUpdateMyDetails(academyId)
  const [icNumber, setIcNumber] = useState(student.ic_number ?? '')
  const [organization, setOrganization] = useState(student.organization ?? '')
  const [address, setAddress] = useState(student.address ?? '')
  const [err, setErr] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setErr(null)
    setSaved(false)
    const ic = normalizeIcNumber(icNumber)
    if (ic === null) {
      setErr(t('lacct.profile.ic_invalid'))
      return
    }
    try {
      const row = await update.mutateAsync({
        studentId: student.id,
        icNumber: ic,
        organization,
        address,
      })
      // Show what was stored: the IC number loses its dashes and the other two
      // are trimmed on the way in.
      setIcNumber(row.ic_number ?? '')
      setOrganization(row.organization ?? '')
      setAddress(row.address ?? '')
      setSaved(true)
    } catch (e2) {
      setErr(errorMessage(e2, t('lacct.profile.save_failed')))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('lacct.profile.details')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="details_ic">{t('students.field.ic')}</Label>
              <Input
                id="details_ic"
                value={icNumber}
                maxLength={30}
                autoComplete="off"
                onChange={(e) => {
                  setIcNumber(e.target.value)
                  setSaved(false)
                }}
                placeholder={t('students.form.ic_placeholder')}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="details_organization">
                {t('students.field.organization')}
              </Label>
              <Input
                id="details_organization"
                value={organization}
                maxLength={200}
                onChange={(e) => {
                  setOrganization(e.target.value)
                  setSaved(false)
                }}
                placeholder={t('students.form.organization_placeholder')}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="details_address">
              {t('students.field.address')}
            </Label>
            <Textarea
              id="details_address"
              rows={3}
              value={address}
              maxLength={500}
              onChange={(e) => {
                setAddress(e.target.value)
                setSaved(false)
              }}
            />
            <p className="text-muted-foreground text-xs">
              {t('lacct.profile.billing_hint')}
            </p>
          </div>

          {err ? <p className="text-destructive text-sm">{err}</p> : null}
          {saved && !err ? (
            <p className="text-muted-foreground text-sm">{t('common.saved')}</p>
          ) : null}

          <div>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
