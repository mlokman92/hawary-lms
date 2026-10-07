import { useState, type ReactNode } from 'react'
import { Image, Pressable, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { WEB_ORIGIN } from '@/lib/env'
import { LANGS, useT } from '@/lib/i18n'
import { isReachablePhone } from '@/lib/phone'
import { supabase } from '@/lib/supabase'
import { Button, Card, Field, FormError, Input, Screen, T, space, useTheme } from '@/ui'

/**
 * Sign in, sign up and forgot password — the same three forms as the web
 * app's, against the same Supabase Auth.
 *
 * Two links in these flows are emails, and both land on the WEB app on
 * purpose: the address-confirmation link and the password-reset link. Supabase
 * only redirects to URLs on its allow list (docs/production-urls.md), the web
 * pages for both already exist and are tested, and a person finishing either
 * one simply comes back here and signs in. Nothing in the app depends on a
 * redirect that the dashboard could silently drop.
 */
const LOGO_TILE = require('../../assets/images/logo-tile.png')

function AuthFrame({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: ReactNode
}) {
  const insets = useSafeAreaInsets()
  const { lang, setLang } = useT()
  const { c } = useTheme()
  return (
    <Screen>
      <View style={{ paddingTop: insets.top + 28, gap: space.xl }}>
        {/* The academy's symbol in its tile (docs/brand.md). It is the one
            thing on these screens that says whose app this is. */}
        <Image
          source={LOGO_TILE}
          accessibilityIgnoresInvertColors
          style={{ width: 56, height: 56, borderRadius: 18 }}
        />
        <View style={{ gap: 6 }}>
          <T v="display">{title}</T>
          <T muted style={{ fontSize: 16 }}>
            {subtitle}
          </T>
        </View>
        <Card style={{ gap: space.lg }}>{children}</Card>
        {/* The language has to be reachable before sign-in. */}
        <View
          style={{
            flexDirection: 'row',
            alignSelf: 'center',
            backgroundColor: c.card,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: c.border,
            padding: 4,
          }}
        >
          {LANGS.map((l) => {
            const on = l.value === lang
            return (
              <Pressable
                key={l.value}
                onPress={() => setLang(l.value)}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  borderRadius: 999,
                  backgroundColor: on ? c.brandSoft : 'transparent',
                }}
              >
                <T
                  v="small"
                  style={{
                    color: on ? c.brand : c.mutedForeground,
                    fontWeight: on ? '700' : '500',
                  }}
                >
                  {l.label}
                </T>
              </Pressable>
            )
          })}
        </View>
      </View>
    </Screen>
  )
}

function TextLink({ label, onPress }: { label: string; onPress: () => void }) {
  const { c } = useTheme()
  return (
    <Pressable onPress={onPress} hitSlop={10}>
      <T v="small" style={{ color: c.brand, fontWeight: '600' }}>
        {label}
      </T>
    </Pressable>
  )
}

export function SignInScreen() {
  const { t } = useT()
  const router = useRouter()
  const params = useLocalSearchParams<{ email?: string; notice?: string }>()
  const [email, setEmail] = useState(params.email ?? '')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    setBusy(false)
    // On success there is nothing to navigate to: the gate in the root layout
    // sees the session and swaps the whole tree.
    if (error) setError(error.message)
  }

  return (
    <AuthFrame title={t('auth.signin.title')} subtitle={t('auth.signin.subtitle')}>
      {params.notice ? (
        <T v="small" muted>
          {params.notice}
        </T>
      ) : null}
      <Field label={t('common.email')}>
        <Input
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="username"
        />
      </Field>
      <Field label={t('common.password')}>
        <Input
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          onSubmitEditing={() => void submit()}
        />
      </Field>
      <FormError error={error} />
      <Button
        title={busy ? t('auth.signin.busy') : t('auth.signin.title')}
        loading={busy}
        disabled={!email.trim() || !password}
        onPress={() => void submit()}
      />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <TextLink
          label={t('auth.signin.forgot')}
          onPress={() => router.push('/forgot' as never)}
        />
        <TextLink
          label={t('auth.signin.create_account')}
          onPress={() => router.push('/sign-up' as never)}
        />
      </View>
    </AuthFrame>
  )
}

export function SignUpScreen() {
  const { t } = useT()
  const router = useRouter()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  async function submit() {
    setError(null)
    // Same test as the web form, for the same reason: a number nobody can dial
    // is no more use to the academy than a blank one.
    if (!isReachablePhone(phone)) {
      setError(t('auth.signup.phone_invalid'))
      return
    }
    setBusy(true)
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: fullName.trim(), phone: phone.trim() },
        emailRedirectTo: `${WEB_ORIGIN}/auth/callback`,
      },
    })
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    // Enumeration protection: an address that already has an account comes
    // back as a user with no identities and no session, not as an error.
    if (data.user && (data.user.identities?.length ?? 0) === 0) {
      router.replace({
        pathname: '/sign-in',
        params: { email: email.trim(), notice: t('auth.signup.email_exists') },
      } as never)
      return
    }
    // A session means confirmation is off; the gate takes it from here.
    if (!data.session) setSent(true)
  }

  if (sent) {
    return (
      <AuthFrame
        title={t('auth.check_email.title')}
        subtitle={t('auth.signup.confirm.subtitle')}
      >
        <T muted>
          {t('auth.signup.confirm.body_before')} <T bold>{email.trim()}</T>
          {t('auth.signup.confirm.body_after')}
        </T>
        <Button
          title={t('auth.back_to_sign_in')}
          variant="outline"
          onPress={() =>
            router.replace({
              pathname: '/sign-in',
              params: { email: email.trim() },
            } as never)
          }
        />
      </AuthFrame>
    )
  }

  return (
    <AuthFrame title={t('auth.signup.title')} subtitle={t('auth.signup.subtitle')}>
      <Field label={t('common.full_name')}>
        <Input
          value={fullName}
          onChangeText={setFullName}
          autoComplete="name"
          textContentType="name"
        />
      </Field>
      <Field label={t('common.email')}>
        <Input
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
        />
      </Field>
      <Field label={t('auth.field.phone')}>
        <Input
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          autoComplete="tel"
          placeholder="012-345 6789"
        />
      </Field>
      <Field label={t('common.password')} hint={t('auth.reset.min_length', { count: 8 })}>
        <Input
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
        />
      </Field>
      <FormError error={error} />
      <Button
        title={busy ? t('common.creating') : t('auth.signup.submit')}
        loading={busy}
        disabled={!fullName.trim() || !email.trim() || password.length < 8}
        onPress={() => void submit()}
      />
      <TextLink
        label={`${t('auth.signup.have_account')} ${t('auth.signin.title')}`}
        onPress={() => router.replace('/sign-in' as never)}
      />
    </AuthFrame>
  )
}

export function ForgotScreen() {
  const { t } = useT()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${WEB_ORIGIN}/reset-password`,
    })
    setBusy(false)
    if (error) setError(error.message)
    else setSent(true)
  }

  return (
    <AuthFrame title={t('auth.forgot.title')} subtitle={t('auth.forgot.subtitle')}>
      {sent ? (
        <T muted>
          {t('auth.forgot.sent.body_before')} <T bold>{email.trim()}</T>
          {t('auth.forgot.sent.body_after')}
        </T>
      ) : (
        <>
          <Field label={t('common.email')}>
            <Input
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
            />
          </Field>
          <FormError error={error} />
          <Button
            title={busy ? t('common.sending') : t('auth.forgot.submit')}
            loading={busy}
            disabled={!email.trim()}
            onPress={() => void submit()}
          />
        </>
      )}
      <TextLink
        label={t('auth.back_to_sign_in')}
        onPress={() => router.replace('/sign-in' as never)}
      />
    </AuthFrame>
  )
}
