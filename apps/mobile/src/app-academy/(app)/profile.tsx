import { Stack } from 'expo-router'
import { useT } from '@/lib/i18n'
import { useMyInstructorRecord } from '@/features/profile/api'
import { STATUS_META } from '@/features/instructors/status'
import { PreferencesCard, ProfileCard } from '@/screens/Account'
import { useScope } from '@/shell/scope'
import { Badge, Card, Row, Screen } from '@/ui'

/**
 * The staff profile: the same `profiles` row the web edits at /profile, the two
 * hats this account wears here (access and teaching are separate axes —
 * docs/web-surface.md → "Members and roles"), and the device preferences.
 */
export default function ProfileScreen() {
  const { t } = useT()
  const { academyId, active, isDirector, isSystemAdmin } = useScope()
  const { data: instructor } = useMyInstructorRecord(academyId)

  return (
    <Screen>
      <Stack.Screen options={{ title: t('user.profile') }} />
      <ProfileCard />
      <Card flush>
        <Row
          first
          icon="home"
          title={active?.academy?.name ?? t('academy.fallback')}
          subtitle={[
            active ? t(active.role === 'admin' ? 'role.admin' : 'role.trainer') : null,
            isSystemAdmin
              ? t('members.tier.system_admin')
              : isDirector
                ? t('members.tier.director')
                : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        />
        {instructor ? (
          <Row
            icon="award"
            title={instructor.full_name ?? t('common.instructor')}
            subtitle={instructor.instructor_no}
            right={
              <Badge
                label={t(STATUS_META[instructor.status].labelKey)}
                variant={STATUS_META[instructor.status].variant}
              />
            }
          />
        ) : null}
      </Card>
      <PreferencesCard />
    </Screen>
  )
}
