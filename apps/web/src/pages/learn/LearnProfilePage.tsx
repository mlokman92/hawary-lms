import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useAuth } from '@/lib/auth'
import { fmtDate } from '@/lib/format'
import { useT } from '@/lib/i18n'
import { useStudentAcademy } from '@/lib/studentAcademy'
import { useMyStudent } from '@/features/learn/api'
import { useMyProfile, useUpdateMyProfile } from '@/features/profile/api'
import { STATUS_META } from '@/features/students/status'
import { PendingInviteList } from '@/features/invitations/PendingInviteList'
import { BankAccountCard } from '@/features/bank/BankAccountCard'
import { PageHeader } from '@/components/patterns/PageHeader'
import { ErrorBlock, RouteLoading } from '@/components/patterns/QueryState'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { errorMessage } from '@/lib/errors'

function initials(name: string | null, email: string): string {
  const src = (name || email).trim()
  if (!src) return 'U'
  const parts = src.split(/\s+/).filter(Boolean)
  if (parts.length >= 2)
    return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase()
  return src.slice(0, 2).toUpperCase()
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-0.5 text-sm">
        {value || <span className="text-muted-foreground">—</span>}
      </dd>
    </div>
  )
}

export function LearnProfilePage() {
  const { user } = useAuth()
  const { t } = useT()
  const { academyId, active } = useStudentAcademy()
  const { data: profile, isLoading, error } = useMyProfile()
  const { data: student } = useMyStudent(academyId)
  const update = useUpdateMyProfile()

  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [seeded, setSeeded] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (seeded || profile === undefined) return
    setFullName(profile?.full_name ?? '')
    setPhone(profile?.phone ?? '')
    setSeeded(true)
  }, [seeded, profile])

  if (isLoading) return <RouteLoading />

  if (error) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <PageHeader
          title={t('lacct.profile.title')}
          description={t('lacct.profile.description')}
        />
        <ErrorBlock error={error} className="mt-6" />
      </div>
    )
  }

  const email = user?.email ?? ''

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setErr(null)
    setSaved(false)
    try {
      await update.mutateAsync({
        full_name: fullName.trim() || null,
        phone: phone.trim() || null,
      })
      setSaved(true)
    } catch (e2) {
      setErr(errorMessage(e2, t('lacct.profile.save_failed')))
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        title={t('lacct.profile.title')}
        description={t('lacct.profile.description')}
      />

      <div className="mt-6 space-y-6">
        {/* Renders nothing unless another academy is waiting. */}
        <PendingInviteList />
        <Card>
          <CardHeader>
            <CardTitle>{t('lacct.profile.account')}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="flex items-center gap-4">
                <Avatar className="size-12">
                  {/* Read-only: every storage.objects write policy is
                      app.is_staff, and upload-media returns 403 not_staff for a
                      student, so an upload control here could only ever fail. */}
                  <AvatarImage src={profile?.avatar_url ?? undefined} alt="" />
                  <AvatarFallback>
                    {initials(profile?.full_name ?? null, email)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {profile?.full_name || email || t('lacct.profile.account')}
                  </p>
                  <p className="text-muted-foreground truncate text-xs">
                    {email}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="full_name">{t('common.full_name')}</Label>
                  <Input
                    id="full_name"
                    value={fullName}
                    onChange={(e) => {
                      setFullName(e.target.value)
                      setSaved(false)
                    }}
                    placeholder={t('lacct.profile.name_placeholder')}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="phone">{t('common.phone')}</Label>
                  <Input
                    id="phone"
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value)
                      setSaved(false)
                    }}
                    placeholder="01X-XXX XXXX"
                  />
                </div>
              </div>

              <p className="text-muted-foreground text-xs">
                {t('lacct.profile.email_locked')}
              </p>

              {err ? <p className="text-destructive text-sm">{err}</p> : null}
              {saved && !err ? (
                <p className="text-muted-foreground text-sm">
                  {t('common.saved')}
                </p>
              ) : null}

              <Button type="submit" disabled={update.isPending}>
                {update.isPending
                  ? t('common.saving')
                  : t('lacct.profile.save_changes')}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('lacct.profile.record')}</CardTitle>
          </CardHeader>
          <CardContent>
            {student ? (
              <>
                <dl className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label={t('lacct.profile.academy')}
                    value={active?.academy?.name}
                  />
                  <Field
                    label={t('lacct.profile.student_no')}
                    value={student.student_no}
                  />
                  <Field
                    label={t('common.status')}
                    value={
                      <Badge variant={STATUS_META[student.status].variant}>
                        {t(STATUS_META[student.status].labelKey)}
                      </Badge>
                    }
                  />
                  <Field
                    label={t('lacct.profile.email_on_record')}
                    value={student.email}
                  />
                  <Field
                    label={t('lacct.profile.phone_on_record')}
                    value={student.phone}
                  />
                  <Field
                    label={t('lacct.profile.joined')}
                    value={fmtDate(student.created_at)}
                  />
                </dl>
                <p className="text-muted-foreground mt-4 text-xs">
                  {t('lacct.profile.managed_by_academy')}
                </p>
              </>
            ) : (
              <p className="text-muted-foreground text-sm">
                {t('lacct.profile.no_record', {
                  academy: active?.academy?.name ?? t('academy.this_academy'),
                })}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Nothing to attach bank details to without an academy record — the
            row is keyed by student_id and the policy is `owns_student`. */}
        {academyId && student ? (
          <BankAccountCard
            academyId={academyId}
            studentId={student.id}
            canEdit
          />
        ) : null}
      </div>
    </div>
  )
}
