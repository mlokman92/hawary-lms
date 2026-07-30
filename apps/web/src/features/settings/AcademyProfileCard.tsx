import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Building2, Check, Loader2, Upload, X } from 'lucide-react'
import { useAcademy } from '@/lib/academy'
import { useT } from '@/lib/i18n'
import { uploadPublicImage } from '@/lib/storage'
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
import { useAcademyProfile, useUpdateAcademyProfile } from './academy'

/**
 * The academy's letterhead, editable by an admin.
 *
 * These columns have existed on `academies` since the first tenancy migration
 * but were only ever written at sign-up. They are here because invoice and
 * receipt PDFs print them — name is the one mandatory field, matching the DB
 * (`academies.name` is NOT NULL) and the sign-up form.
 */
export function AcademyProfileCard({ academyId }: { academyId: string }) {
  const { t } = useT()
  const { refresh } = useAcademy()
  const { data: profile, isLoading } = useAcademyProfile(academyId)
  const update = useUpdateAcademyProfile(academyId)

  const [name, setName] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [sstNumber, setSstNumber] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // Seed once the row lands, and re-seed when the admin switches academy.
  useEffect(() => {
    if (!profile) return
    setName(profile.name)
    setLogoUrl(profile.logo_url ?? '')
    setAddress(profile.address ?? '')
    setPhone(profile.phone ?? '')
    setSstNumber(profile.sst_number ?? '')
    setError(null)
    setSaved(false)
  }, [profile])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSaved(false)
    if (!name.trim()) {
      setError(t('settings.academy.error.name_required'))
      return
    }
    try {
      await update.mutateAsync({ name, logoUrl, address, phone, sstNumber })
      // The switcher and the sidebar read the name from the membership list.
      await refresh()
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="size-4" /> {t('settings.academy.title')}
        </CardTitle>
        <CardDescription>{t('settings.academy.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-muted-foreground text-sm">{t('common.loading')}</p>
        ) : (
          <form onSubmit={onSubmit} className="grid gap-5">
            <div className="grid gap-2">
              <Label htmlFor="academy-name">
                {t('settings.academy.name_label')}
              </Label>
              <Input
                id="academy-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  setSaved(false)
                }}
                placeholder={t('settings.academy.name_placeholder')}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label>{t('settings.academy.logo_label')}</Label>
              <LogoUploader
                academyId={academyId}
                value={logoUrl}
                onChange={(url) => {
                  setLogoUrl(url)
                  setSaved(false)
                }}
              />
              <p className="text-muted-foreground text-xs">
                {t('settings.academy.logo_hint')}
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="academy-address">
                {t('settings.academy.address_label')}
              </Label>
              <Textarea
                id="academy-address"
                rows={3}
                value={address}
                onChange={(e) => {
                  setAddress(e.target.value)
                  setSaved(false)
                }}
                placeholder={t('settings.academy.address_placeholder')}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="academy-phone">
                  {t('settings.academy.phone_label')}
                </Label>
                <Input
                  id="academy-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value)
                    setSaved(false)
                  }}
                  placeholder={t('settings.academy.phone_placeholder')}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="academy-sst">
                  {t('settings.academy.sst_label')}
                </Label>
                <Input
                  id="academy-sst"
                  value={sstNumber}
                  onChange={(e) => {
                    setSstNumber(e.target.value)
                    setSaved(false)
                  }}
                  placeholder={t('settings.academy.sst_placeholder')}
                />
              </div>
            </div>

            <p className="text-muted-foreground text-xs">
              {t('settings.academy.optional_hint')}
            </p>

            {error ? <p className="text-destructive text-sm">{error}</p> : null}

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={update.isPending}>
                {update.isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />{' '}
                    {t('common.saving')}
                  </>
                ) : (
                  t('settings.academy.save')
                )}
              </Button>
              {saved && !update.isPending ? (
                <span className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
                  <Check className="size-4" /> {t('settings.academy.saved')}
                </span>
              ) : null}
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Rectangular sibling of `students/AvatarUploader` — a logo is a wordmark far
 * more often than a square badge, and it is previewed here the way the PDF
 * letterhead lays it out.
 */
function LogoUploader({
  academyId,
  value,
  onChange,
}: {
  academyId: string
  value: string
  onChange: (url: string) => void
}) {
  const { t } = useT()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      // Same path as student avatars: upload-media scopes the object under
      // <academy_id>/ and re-checks staff membership server-side.
      onChange(await uploadPublicImage('avatars', academyId, file))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('upload.failed'))
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="bg-muted/40 flex h-16 w-32 shrink-0 items-center justify-center overflow-hidden rounded-md border">
        {value ? (
          <img
            src={value}
            alt=""
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <span className="text-muted-foreground text-xs">
            {t('settings.academy.no_logo')}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={onFile}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            <Upload />{' '}
            {busy
              ? t('common.uploading')
              : value
                ? t('settings.academy.change_logo')
                : t('common.upload')}
          </Button>
          {value ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => onChange('')}
              aria-label={t('settings.academy.remove_logo')}
            >
              <X />
            </Button>
          ) : null}
        </div>
        {error ? <p className="text-destructive text-xs">{error}</p> : null}
      </div>
    </div>
  )
}
