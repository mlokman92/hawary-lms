import { useState, type FormEvent } from 'react'
import { useT } from '@/lib/i18n'
import { errorMessage } from '@/lib/errors'
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
import { Textarea } from '@/components/ui/textarea'
import { useUpdateMyBillingDetails, type Student } from './api'

/**
 * Organization and address — the part of the academy's record a student may
 * write, because it is what their invoice and receipt print under "Bill to"
 * and they are the one who knows what a sponsor needs it to say. Everything
 * else on the record stays with staff.
 */
export function BillingDetailsCard({
  academyId,
  student,
}: {
  academyId: string
  student: Student
}) {
  const { t } = useT()
  const update = useUpdateMyBillingDetails(academyId)
  const [organization, setOrganization] = useState(student.organization ?? '')
  const [address, setAddress] = useState(student.address ?? '')
  const [err, setErr] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setErr(null)
    setSaved(false)
    try {
      const row = await update.mutateAsync({
        studentId: student.id,
        organization,
        address,
      })
      // Show what was stored: both are trimmed on the way in.
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
        <CardTitle>{t('lacct.profile.billing')}</CardTitle>
        <CardDescription>
          {t('lacct.profile.billing_description')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="billing_organization">
              {t('students.field.organization')}
            </Label>
            <Input
              id="billing_organization"
              value={organization}
              maxLength={200}
              onChange={(e) => {
                setOrganization(e.target.value)
                setSaved(false)
              }}
              placeholder={t('students.form.organization_placeholder')}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="billing_address">
              {t('students.field.address')}
            </Label>
            <Textarea
              id="billing_address"
              rows={3}
              value={address}
              maxLength={500}
              onChange={(e) => {
                setAddress(e.target.value)
                setSaved(false)
              }}
            />
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
