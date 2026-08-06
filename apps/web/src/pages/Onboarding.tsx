import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import type { TablesInsert } from '@hawary/shared'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { useAcademy } from '@/lib/academy'
import { slugify } from '@/lib/slug'
import { useT } from '@/lib/i18n'
import { FullPageLoading } from '@/components/patterns/QueryState'
import { PendingInviteList } from '@/features/invitations/PendingInviteList'
import { useMyPendingInvitations } from '@/features/invitations/api'
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

// Proper nouns, and the value stored in `academies.state` — never translated.
const MY_STATES = [
  'Johor', 'Kedah', 'Kelantan', 'Melaka', 'Negeri Sembilan', 'Pahang',
  'Perak', 'Perlis', 'Pulau Pinang', 'Sabah', 'Sarawak', 'Selangor',
  'Terengganu', 'Kuala Lumpur', 'Labuan', 'Putrajaya',
]

/**
 * Where a signed-in account with no membership lands.
 *
 * It used to be the founder form and nothing else, which was a trap: an
 * invited student who signed up on a different device than the one that
 * received the link had no way forward except creating an academy — an act
 * that makes them staff and evicts them from /learn. So invitations come
 * first, and creating an academy is the fallback for someone who really is a
 * founder.
 */
export function Onboarding() {
  const { t } = useT()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { refresh } = useAcademy()
  const { data: invites, isLoading: invitesLoading } = useMyPendingInvitations()
  // Revealed on request when invitations exist — someone can be both invited
  // and a founder, but that is the rarer of the two.
  const [showCreate, setShowCreate] = useState(false)

  const [name, setName] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [slug, setSlug] = useState('')
  const [phone, setPhone] = useState('')
  const [state, setState] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const derivedSlug = useMemo(
    () => (slugEdited ? slug : slugify(name)),
    [slug, slugEdited, name],
  )

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    const finalSlug = slugify(derivedSlug)
    if (!finalSlug) {
      setError(t('auth.onboarding.invalid_slug'))
      return
    }
    setBusy(true)
    setError(null)

    const payload: TablesInsert<'academies'> = {
      name: name.trim(),
      slug: finalSlug,
      created_by: user.id,
      phone: phone.trim() || null,
      state: state || null,
    }
    const { error } = await supabase.from('academies').insert(payload)
    setBusy(false)

    if (error) {
      setError(
        error.code === '23505'
          ? t('auth.onboarding.slug_taken')
          : error.message,
      )
      return
    }
    await refresh()
    navigate('/', { replace: true })
  }

  // Wait for the answer rather than flashing "Create your academy" at someone
  // who is about to be told they have been invited.
  if (invitesLoading) return <FullPageLoading />

  const hasInvites = (invites ?? []).length > 0
  const showForm = !hasInvites || showCreate

  return (
    <div className="bg-muted flex min-h-svh items-center justify-center p-6">
      <div className="grid w-full max-w-lg gap-4">
        <PendingInviteList
          onAccepted={() => navigate('/', { replace: true })}
        />


        {hasInvites && !showCreate ? (
          <p className="text-muted-foreground text-center text-sm">
            {t('auth.onboarding.founder_prompt')}{' '}
            <button
              type="button"
              className="text-foreground underline underline-offset-4"
              onClick={() => setShowCreate(true)}
            >
              {t('auth.onboarding.create_instead')}
            </button>
          </p>
        ) : null}

        {showForm ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">
              {t('auth.onboarding.title')}
            </CardTitle>
            <CardDescription>{t('auth.onboarding.subtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4" onSubmit={onSubmit}>
              <div className="grid gap-2">
                <Label htmlFor="name">{t('auth.onboarding.name')}</Label>
                <Input
                  id="name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('auth.onboarding.name_placeholder')}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="slug">{t('auth.onboarding.slug')}</Label>
                <Input
                  id="slug"
                  required
                  value={derivedSlug}
                  onChange={(e) => {
                    setSlugEdited(true)
                    setSlug(e.target.value)
                  }}
                />
                <p className="text-muted-foreground text-xs">
                  {`hawary.app/${derivedSlug || t('auth.onboarding.slug_placeholder')}`}
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="phone">{t('auth.field.phone_optional')}</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>{t('auth.onboarding.state')}</Label>
                  <Select value={state} onValueChange={setState}>
                    <SelectTrigger className="w-full">
                      <SelectValue
                        placeholder={t('auth.onboarding.state_placeholder')}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {MY_STATES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {error ? <p className="text-destructive text-sm">{error}</p> : null}
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? t('common.creating') : t('auth.onboarding.submit')}
              </Button>
            </form>
          </CardContent>
        </Card>
        ) : null}
      </div>
    </div>
  )
}
