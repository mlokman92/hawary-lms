import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAcademy } from '@/lib/academy'
import { useAuth } from '@/lib/auth'
import { initialsOf } from '@/lib/format'
import { useT } from '@/lib/i18n'
import { PageHeader } from '@/components/patterns/PageHeader'
import { ErrorBlock, RouteLoading } from '@/components/patterns/QueryState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AvatarUploader } from '@/features/students/AvatarUploader'
import { TIER_META, memberTier } from '@/features/members/api'
import {
  useMyInstructorRecord,
  useMyProfile,
  useUpdateMyProfile,
} from '@/features/profile/api'

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

/**
 * Your own account, for staff. The learner tree has `/learn/profile`, which
 * edits the same `profiles` row but frames it around the student record; this
 * one frames it around what you can do in the academy you are standing in.
 *
 * Editable because the UPDATE policy on `profiles` is `id = auth.uid()` — you
 * are the only person who can change your own name, photo or phone. An admin
 * changing *your* details is deliberately not a thing.
 */
export function ProfilePage() {
  const { user } = useAuth()
  const { t } = useT()
  const { activeAcademyId, active } = useAcademy()
  const { data: profile, isLoading, error } = useMyProfile()
  const { data: instructor } = useMyInstructorRecord(activeAcademyId)
  const update = useUpdateMyProfile()

  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [seeded, setSeeded] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (seeded || profile === undefined) return
    setFullName(profile?.full_name ?? '')
    setPhone(profile?.phone ?? '')
    setAvatarUrl(profile?.avatar_url ?? '')
    setSeeded(true)
  }, [seeded, profile])

  if (isLoading) return <RouteLoading />

  const email = user?.email ?? ''
  const tier = active ? memberTier({ role: active.role, is_creator: active.isCreator }) : null

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setErr(null)
    setSaved(false)
    try {
      await update.mutateAsync({
        full_name: fullName.trim() || null,
        phone: phone.trim() || null,
        avatar_url: avatarUrl.trim() || null,
      })
      setSaved(true)
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : t('profile.save_failed'))
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        title={t('profile.title')}
        description={t('profile.description')}
      />

      {error ? <ErrorBlock error={error} className="mt-6" /> : null}

      <div className="mt-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('profile.account')}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="grid gap-2">
                <Label>{t('profile.photo')}</Label>
                {activeAcademyId ? (
                  // Uploads are scoped per academy by the upload-media Edge
                  // Function; the resulting URL is public and lands on the
                  // global profile row.
                  <AvatarUploader
                    academyId={activeAcademyId}
                    value={avatarUrl}
                    onChange={(url) => {
                      setAvatarUrl(url)
                      setSaved(false)
                    }}
                    fallback={initialsOf(fullName, email)}
                  />
                ) : null}
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
                    placeholder={t('profile.name_placeholder')}
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

              <div className="grid gap-2">
                <Label htmlFor="email">{t('common.email')}</Label>
                <Input id="email" value={email} disabled readOnly />
                <p className="text-muted-foreground text-xs">
                  {t('profile.email_locked')}
                </p>
              </div>

              {err ? <p className="text-destructive text-sm">{err}</p> : null}
              {saved && !err ? (
                <p className="text-muted-foreground text-sm">
                  {t('common.saved')}
                </p>
              ) : null}

              <Button type="submit" disabled={update.isPending}>
                {update.isPending ? t('common.saving') : t('profile.save')}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('profile.membership.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-3">
              <Field
                label={t('profile.membership.academy')}
                value={active?.academy?.name}
              />
              <Field
                label={t('profile.membership.access')}
                value={
                  tier ? (
                    <Badge variant={TIER_META[tier].variant}>
                      {t(TIER_META[tier].labelKey)}
                    </Badge>
                  ) : null
                }
              />
              <Field
                label={t('profile.membership.instructor')}
                value={
                  instructor ? (
                    <Link
                      to={`/instructors/${instructor.id}`}
                      className="underline underline-offset-4"
                    >
                      {t('members.instructor.record', {
                        no: instructor.instructor_no,
                      })}
                    </Link>
                  ) : (
                    t('profile.membership.instructor_none')
                  )
                }
              />
            </dl>
            <p className="text-muted-foreground mt-4 text-xs">
              {t('profile.membership.description', {
                academy: active?.academy?.name ?? t('academy.this_academy'),
              })}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
