import { useMemo, useState, type FormEvent } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { MessageCircle } from 'lucide-react'
import type { TablesInsert } from '@hawary/shared'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { useAcademy } from '@/lib/academy'
import { slugify } from '@/lib/slug'
import { useT } from '@/lib/i18n'
import { useLandingTarget } from '@/lib/landing'
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
 * Support, reachable from the one page whose whole problem is having nowhere to
 * go. Everything else this screen offers assumes the person can diagnose
 * themselves; a wrong email on the academy's side is not something they can.
 */
const HELP_WHATSAPP_URL = 'https://wa.me/60127967065'

/**
 * Where a signed-in account with no membership lands.
 *
 * It used to be the founder form and nothing else, which was a trap: an
 * invited student who signed up on a different device than the one that
 * received the link had no way forward except creating an academy — an act
 * that makes them staff and evicts them from /learn. So invitations come
 * first, and creating an academy is the fallback for someone who really is a
 * founder.
 *
 * Showing invitations first was not enough, because `hasInvites` goes empty the
 * instant one is accepted: the accepted invitee who pressed Back — or reopened
 * the confirmation email, or a bookmark — got the founder form, and filling it
 * in named a second academy after their school and made them its admin. It
 * happened. A student of Hawary Academy founded an empty "Hawary Academy" of
 * her own two minutes after joining the real one, and every sign-in afterwards
 * dropped her in the back office of it, because `useLandingTarget` puts staff
 * above student. From her side of the screen she had been made an admin.
 *
 * So membership is the gate, and reaching this page has to be *deliberate*:
 * `?new=1` is what the switcher's "Add academy" sends, and nothing else does.
 * Founding an academy is still self-serve — for someone who has nowhere to be,
 * which is the only person this page was ever addressed to. That a learner has
 * no button to found one is the same decision `ShellSidebar` already makes by
 * leaving "Add academy" out of the learner switcher.
 *
 * That still left the last version of the trap, and it is the one that keeps
 * happening: an invited student who signs up with a *different address* from
 * the one the academy typed. `my_pending_invitations` matches on the confirmed
 * auth email, so their list comes back empty — and an empty list was
 * indistinguishable, on screen, from a genuine founder. They got "Create your
 * academy", believed it was the way in, and founded one.
 *
 * So an empty list is no longer read as "founder". It is read as what it
 * almost always is — *we have no record of you at this address* — and the page
 * says which address that is, since checking it is the whole fix. The founder
 * form moves behind the same link the invited-and-also-a-founder case already
 * used, and `?new=1` still opens it directly.
 */
export function Onboarding() {
  const { t } = useT()
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const { refresh, staffMemberships, studentMemberships, loading } = useAcademy()
  const { data: invites, isLoading: invitesLoading } = useMyPendingInvitations()
  const landing = useLandingTarget()
  const [params] = useSearchParams()
  const deliberate = params.get('new') === '1'
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
  // who is about to be told they have been invited — or who already belongs
  // somewhere and is about to be sent back to it.
  if (loading || invitesLoading) return <FullPageLoading />

  // Already a member of something, and did not come here on purpose. Send them
  // where they belong instead of offering to found a school.
  if (!deliberate && (staffMemberships.length > 0 || studentMemberships.length > 0)) {
    return <Navigate to={landing} replace />
  }

  const hasInvites = (invites ?? []).length > 0
  // Only ever shown on purpose now: the switcher's "Add academy", or the link
  // below. Never as the fallback for "we found nothing for you".
  const showForm = deliberate || showCreate

  return (
    <div className="bg-muted flex min-h-svh items-center justify-center p-6">
      <div className="grid w-full max-w-lg gap-4">
        <PendingInviteList
          onAccepted={() => navigate('/', { replace: true })}
        />

        {!hasInvites && !showForm ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">
                {t('auth.onboarding.none.title')}
              </CardTitle>
              <CardDescription>
                {t('auth.onboarding.none.body_before')}{' '}
                <strong className="text-foreground font-medium">
                  {user?.email}
                </strong>
                {t('auth.onboarding.none.body_after')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* The same escape hatch AcceptInvitePage offers, for the same
                  reason: signed in as the wrong person is a state you have to
                  be able to leave. */}
              <Button
                variant="outline"
                className="w-full"
                onClick={async () => {
                  await signOut()
                  navigate('/signin', { replace: true })
                }}
              >
                {t('auth.onboarding.none.other_email')}
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {!showForm ? (
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

        <a
          href={HELP_WHATSAPP_URL}
          target="_blank"
          rel="noreferrer"
          className="text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1.5 text-sm underline underline-offset-4"
        >
          <MessageCircle className="size-4" />
          {t('auth.onboarding.help')}
        </a>
      </div>
    </div>
  )
}
