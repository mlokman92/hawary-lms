import { useEffect, useState } from 'react'
import { View } from 'react-native'
import {
  MALAYSIAN_BANKS,
  bankName,
  maskAccountNumber,
} from '@hawary/shared'
import { useAuth } from '@/lib/auth'
import { IS_STUDENT_APP } from '@/lib/env'
import { errorMessage } from '@/lib/errors'
import { LANGS, useT, type Lang } from '@/lib/i18n'
import { rpcPending } from '@/lib/rpcPending'
import {
  useRemoveStudentBankAccount,
  useSaveStudentBankAccount,
  useStudentBankAccount,
} from '@/features/bank/api'
import { useMyProfile, useUpdateMyProfile } from '@/features/profile/api'
import { useScope } from '@/shell/scope'
import {
  Avatar,
  Button,
  Card,
  confirm,
  Field,
  FormError,
  Input,
  Select,
  T,
  space,
  useTheme,
} from '@/ui'
import type { ThemePref } from '@/ui/theme'

/**
 * The pieces of "me" both apps show: the profile row, the device preferences,
 * and the bank account. Each app arranges them on its own profile screen.
 */

/** Name and phone on `profiles` — the same row the web edits at /profile. */
export function ProfileCard() {
  const { t } = useT()
  const { user } = useAuth()
  const { data: profile } = useMyProfile()
  const update = useUpdateMyProfile()
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [seeded, setSeeded] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (seeded || profile === undefined) return
    setFullName(profile?.full_name ?? '')
    setPhone(profile?.phone ?? '')
    setSeeded(true)
  }, [seeded, profile])

  async function save() {
    setError(null)
    setSaved(false)
    try {
      await update.mutateAsync({
        full_name: fullName.trim() || null,
        phone: phone.trim() || null,
      })
      setSaved(true)
    } catch (e) {
      setError(errorMessage(e, t('lacct.profile.save_failed')))
    }
  }

  const email = user?.email ?? ''

  return (
    <Card style={{ gap: space.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <Avatar uri={profile?.avatar_url} name={profile?.full_name} email={email} size={48} />
        <View style={{ flex: 1 }}>
          <T style={{ fontWeight: '600' }} numberOfLines={1}>
            {profile?.full_name || email}
          </T>
          <T v="small" muted numberOfLines={1}>
            {email}
          </T>
        </View>
      </View>
      <Field label={t('common.full_name')}>
        <Input
          value={fullName}
          onChangeText={(v) => {
            setFullName(v)
            setSaved(false)
          }}
          placeholder={t('lacct.profile.name_placeholder')}
        />
      </Field>
      <Field label={t('common.phone')} hint={t('lacct.profile.email_locked')}>
        <Input
          value={phone}
          onChangeText={(v) => {
            setPhone(v)
            setSaved(false)
          }}
          keyboardType="phone-pad"
          placeholder="01X-XXX XXXX"
        />
      </Field>
      <FormError error={error} />
      <Button
        title={
          update.isPending
            ? t('common.saving')
            : saved
              ? t('common.saved')
              : t('lacct.profile.save_changes')
        }
        loading={update.isPending}
        onPress={() => void save()}
      />
    </Card>
  )
}

/**
 * Language, theme, branch and sign-out. Per-device preferences, exactly as on
 * the web: nothing here is stored on the account (docs/i18n.md).
 */
export function PreferencesCard() {
  const { t, lang, setLang } = useT()
  const { pref, setPref } = useTheme()
  const { signOut } = useAuth()
  const { academyId, memberships, setAcademyId } = useScope()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function deleteAccount() {
    const ok = await confirm({
      title: t('m.account.delete.title'),
      message: t('m.account.delete.body'),
      confirmLabel: t('m.account.delete.confirm'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    })
    if (!ok) return
    setBusy(true)
    setError(null)
    try {
      await rpcPending('delete_my_account', {})
      // The account is gone; this only clears the session left on the phone.
      await signOut()
    } catch (e) {
      setError(errorMessage(e, t('common.error')))
      setBusy(false)
    }
  }

  return (
    <Card style={{ gap: space.lg }}>
      {/* A switcher only when there is something to switch to. */}
      {memberships.length > 1 ? (
        <Field label={t('academy.heading')}>
          <Select
            value={academyId}
            options={memberships.map((m) => ({
              value: m.academyId,
              label: m.academy?.name ?? t('academy.fallback'),
            }))}
            onChange={setAcademyId}
            title={t('academy.heading')}
          />
        </Field>
      ) : null}
      <Field label={t('user.language')}>
        <Select<Lang>
          value={lang}
          options={LANGS.map((l) => ({ value: l.value, label: l.label }))}
          onChange={setLang}
          title={t('user.language')}
        />
      </Field>
      <Field label={t('user.theme')}>
        <Select<ThemePref>
          value={pref}
          options={[
            { value: 'system', label: t('user.theme.system') },
            { value: 'light', label: t('user.theme.light') },
            { value: 'dark', label: t('user.theme.dark') },
          ]}
          onChange={setPref}
          title={t('user.theme')}
        />
      </Field>
      <Button
        variant="outline"
        icon="log-out"
        title={t('user.sign_out')}
        onPress={() => void signOut()}
      />
      {/* Students only: a staff account is removed by a Director, and the
          database refuses this call for one. */}
      {IS_STUDENT_APP ? (
        <Button
          variant="ghost"
          title={t('m.account.delete.action')}
          loading={busy}
          onPress={() => void deleteAccount()}
        />
      ) : null}
      <FormError error={error} />
    </Card>
  )
}

/**
 * Where incentive payouts go. One component for both apps because it is the
 * same row under the same policy — `app.is_admin OR app.owns_student`
 * (docs/billplz-incentives.md). The Student app edits its own; the Academy app
 * shows a student's to an admin, read-only, with the number masked.
 */
export function BankAccountCard({
  academyId,
  studentId,
  canEdit,
}: {
  academyId: string
  studentId: string
  canEdit: boolean
}) {
  const { t } = useT()
  const { data: account, isLoading } = useStudentBankAccount(studentId)
  const save = useSaveStudentBankAccount(academyId, studentId)
  const remove = useRemoveStudentBankAccount(academyId, studentId)
  const [editing, setEditing] = useState(false)
  const [bank, setBank] = useState<string | null>(null)
  const [number, setNumber] = useState('')
  const [holder, setHolder] = useState('')
  const [ic, setIc] = useState('')
  const [error, setError] = useState<string | null>(null)

  function startEdit() {
    setBank(account?.bank_code ?? null)
    setNumber(account?.bank_account_number ?? '')
    setHolder(account?.account_holder_name ?? '')
    setIc(account?.account_holder_ic ?? '')
    setError(null)
    setEditing(true)
  }

  async function onSave() {
    setError(null)
    try {
      await save.mutateAsync({
        bank_code: bank ?? '',
        bank_account_number: number,
        account_holder_name: holder,
        account_holder_ic: ic || null,
      })
      setEditing(false)
    } catch (e) {
      setError(errorMessage(e, t('common.error')))
    }
  }

  async function onRemove() {
    const ok = await confirm({
      title: t('incentives.bank.remove_confirm.title'),
      message: t('incentives.bank.remove_confirm.body'),
      confirmLabel: t('common.remove'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    })
    if (ok) remove.mutate()
  }

  if (isLoading) return null

  return (
    <Card style={{ gap: space.md }}>
      <View style={{ gap: 2 }}>
        <T v="heading">{t('incentives.bank.title')}</T>
        <T v="small" muted>
          {t('incentives.bank.description')}
        </T>
      </View>

      {editing ? (
        <>
          <Field label={t('incentives.bank.bank')}>
            <Select
              value={bank}
              options={MALAYSIAN_BANKS.map((b) => ({ value: b.code, label: b.name }))}
              onChange={setBank}
              placeholder={t('incentives.bank.bank_placeholder')}
              title={t('incentives.bank.bank')}
            />
          </Field>
          <Field label={t('incentives.bank.account_number')}>
            <Input
              value={number}
              onChangeText={setNumber}
              keyboardType="number-pad"
              placeholder={t('incentives.bank.account_number_placeholder')}
            />
          </Field>
          <Field label={t('incentives.bank.holder')}>
            <Input
              value={holder}
              onChangeText={setHolder}
              autoCapitalize="characters"
              placeholder={t('incentives.bank.holder_placeholder')}
            />
          </Field>
          <Field label={t('incentives.bank.holder_ic')}>
            <Input value={ic} onChangeText={setIc} />
          </Field>
          <FormError error={error} />
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button
              style={{ flex: 1 }}
              variant="outline"
              title={t('common.cancel')}
              onPress={() => setEditing(false)}
            />
            <Button
              style={{ flex: 1 }}
              title={save.isPending ? t('common.saving') : t('common.save')}
              loading={save.isPending}
              onPress={() => void onSave()}
            />
          </View>
        </>
      ) : account ? (
        <>
          <View>
            <T style={{ fontWeight: '500' }}>{bankName(account.bank_code)}</T>
            <T v="small" muted>
              {maskAccountNumber(account.bank_account_number)} ·{' '}
              {account.account_holder_name}
            </T>
          </View>
          {canEdit ? (
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Button
                small
                variant="outline"
                title={t('common.edit')}
                onPress={startEdit}
              />
              <Button
                small
                variant="ghost"
                title={
                  remove.isPending ? t('incentives.bank.removing') : t('common.remove')
                }
                onPress={() => void onRemove()}
              />
            </View>
          ) : null}
        </>
      ) : (
        <>
          <T muted>{t('incentives.bank.empty')}</T>
          {canEdit ? (
            <Button small variant="outline" title={t('common.add')} onPress={startEdit} />
          ) : null}
        </>
      )}
    </Card>
  )
}
