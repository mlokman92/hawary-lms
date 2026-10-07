import { useState } from 'react'
import { Linking, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAcademy } from '@/lib/academy'
import { useAuth } from '@/lib/auth'
import { IS_STUDENT_APP } from '@/lib/env'
import { isAuthError } from '@/lib/errors'
import { fmtDate } from '@/lib/format'
import { useT } from '@/lib/i18n'
import { SUPPORT_WHATSAPP_URL } from '@/lib/support'
import {
  useAcceptPendingInvitation,
  useMyPendingInvitations,
  type PendingInvite,
} from '@/features/invitations/api'
import {
  Button,
  Card,
  ErrorBlock,
  FormError,
  Loading,
  Row,
  Screen,
  T,
  space,
} from '@/ui'

/**
 * Where a signed-in account lands when it has no membership THIS app serves.
 *
 * Three different people reach it, and each needs a different sentence:
 *
 *   - somebody the academy has added, who has not joined yet -> their
 *     invitations, with a Join button (a record carrying their confirmed email
 *     IS the invitation; docs/account-claiming.md);
 *   - somebody in the wrong app — a trainer who installed the Student app, or
 *     a student who installed the Academy one -> told which app is theirs;
 *   - somebody the academy has no record of at this address -> told so, with
 *     the address shown, because a different email from the one the academy
 *     typed is almost always why.
 */
export function OnboardingScreen() {
  const { t } = useT()
  const insets = useSafeAreaInsets()
  const { user, signOut } = useAuth()
  const { refresh, staffMemberships, studentMemberships } = useAcademy()
  const { data, isLoading, error, refetch } = useMyPendingInvitations()
  const accept = useAcceptPendingInvitation()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  // Only the invitations this app can act on. A trainer invitation accepted in
  // the Student app would grant a membership the app then cannot open.
  const wanted = IS_STUDENT_APP ? 'student' : 'trainer'
  const invites = (data ?? []).filter((i) => i.role === wanted)
  const inOtherApp = IS_STUDENT_APP
    ? staffMemberships.length > 0
    : studentMemberships.length > 0

  async function join(invite: PendingInvite) {
    setBusyId(invite.record_id)
    setFailed(false)
    try {
      await accept.mutateAsync(invite)
      // Memberships gate the whole tree; refreshing them is what lets the
      // person in.
      await refresh()
    } catch (e) {
      // A dead token cannot be retried into life — sign out so the next
      // attempt starts from a session that verifies.
      if (isAuthError(e)) {
        await signOut()
        return
      }
      console.error('accept_pending_invitation failed', e)
      setFailed(true)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Screen onRefresh={() => void refetch()}>
      <View style={{ paddingTop: insets.top + space.xl, gap: space.lg }}>
        {isLoading ? (
          <Loading />
        ) : error ? (
          // A failed lookup is not an answer: "no record of you" would be false.
          <ErrorBlock error={error} onRetry={() => void refetch()} />
        ) : invites.length > 0 ? (
          <>
            <View style={{ gap: 4 }}>
              <T v="title">{t('invite.waiting.title')}</T>
              <T muted>{t('invite.waiting.description')}</T>
            </View>
            <Card flush>
              {invites.map((invite, i) => (
                <Row
                  key={`${invite.kind}:${invite.record_id}`}
                  first={i === 0}
                  icon="home"
                  title={invite.academy_name}
                  subtitle={t('invite.waiting.added', {
                    date: fmtDate(invite.invited_at),
                  })}
                  right={
                    <Button
                      small
                      title={
                        busyId === invite.record_id
                          ? t('invite.waiting.joining')
                          : t('invite.waiting.join')
                      }
                      loading={busyId === invite.record_id}
                      disabled={busyId !== null}
                      onPress={() => void join(invite)}
                    />
                  }
                />
              ))}
            </Card>
            <FormError error={failed ? t('invite.waiting.error') : null} />
          </>
        ) : inOtherApp ? (
          <View style={{ gap: 4 }}>
            <T v="title">
              {t(IS_STUDENT_APP ? 'm.onboarding.staff.title' : 'm.onboarding.student.title')}
            </T>
            <T muted>
              {t(IS_STUDENT_APP ? 'm.onboarding.staff.body' : 'm.onboarding.student.body')}
            </T>
          </View>
        ) : (
          <View style={{ gap: 4 }}>
            <T v="title">{t('auth.onboarding.none.title')}</T>
            <T muted>
              {t('auth.onboarding.none.body_before')} <T bold>{user?.email}</T>
              {t('auth.onboarding.none.body_after')}
            </T>
          </View>
        )}

        <Button
          variant="outline"
          title={t('auth.onboarding.none.other_email')}
          onPress={() => void signOut()}
        />
        <Button
          variant="ghost"
          icon="message-circle"
          title={t('common.help_whatsapp')}
          onPress={() => void Linking.openURL(SUPPORT_WHATSAPP_URL)}
        />
      </View>
    </Screen>
  )
}
