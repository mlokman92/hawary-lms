import { Pressable, View } from 'react-native'
import { Stack, useRouter } from 'expo-router'
import { localeFor } from '@/lib/format'
import { useT } from '@/lib/i18n'
import {
  useMarkAllNotificationsRead,
  useMarkNotificationsRead,
  useNotifications,
  useUnreadCount,
  type Notification,
} from '@/features/notifications/api'
import { detailOf, titleOf } from '@/features/notifications/render'
import { linkOf } from '@/shell/links'
import { useScope } from '@/shell/scope'
import { Card, Empty, ErrorBlock, Loading, Screen, T, space, useTheme } from '@/ui'

/**
 * The notification centre — the web app's bell, as a screen.
 *
 * Same rows, same wording (`features/notifications/render.ts`, shared with the
 * web bell), same rule: opening a row marks it read and goes where it leads.
 * There is no "mark unread", no filter and no page of older ones — twenty is
 * what the list holds (docs/notifications.md).
 */
export function NotificationsScreen() {
  const { t, lang } = useT()
  const { c } = useTheme()
  const router = useRouter()
  const { academyId } = useScope()
  const { data: rows, isLoading, error, refetch, isRefetching } =
    useNotifications(academyId)
  const { data: unread = 0 } = useUnreadCount(academyId)
  const markRead = useMarkNotificationsRead(academyId)
  const markAll = useMarkAllNotificationsRead(academyId)
  const locale = localeFor(lang)

  function open(row: Notification) {
    if (!row.read_at) markRead.mutate([row.id])
    const to = linkOf(row)
    if (to) router.push(to as never)
  }

  return (
    <Screen onRefresh={() => void refetch()} refreshing={isRefetching}>
      <Stack.Screen
        options={{
          title: t('notif.title'),
          headerRight: () =>
            unread > 0 ? (
              <Pressable onPress={() => markAll.mutate()} hitSlop={10}>
                <T v="small">{t('notif.mark_all')}</T>
              </Pressable>
            ) : null,
        }}
      />
      {isLoading ? (
        <Loading />
      ) : error ? (
        <ErrorBlock error={error} onRetry={() => void refetch()} />
      ) : !rows || rows.length === 0 ? (
        <Empty icon="bell" title={t('notif.empty')} />
      ) : (
        <Card flush>
          {rows.map((row, i) => {
            const detail = detailOf(row, locale)
            return (
              <Pressable
                key={row.id}
                onPress={() => open(row)}
                style={({ pressed }) => [
                  {
                    flexDirection: 'row',
                    gap: space.md,
                    paddingHorizontal: space.lg,
                    paddingVertical: space.md,
                    borderTopWidth: i === 0 ? 0 : 0.5,
                    borderTopColor: c.border,
                  },
                  pressed || !row.read_at ? { backgroundColor: c.muted } : null,
                ]}
              >
                <View
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 4,
                    marginTop: 7,
                    backgroundColor: row.read_at ? 'transparent' : c.destructive,
                  }}
                />
                <View style={{ flex: 1 }}>
                  <T>{titleOf(row, t)}</T>
                  {detail ? (
                    <T v="small" muted>
                      {detail}
                    </T>
                  ) : null}
                </View>
              </Pressable>
            )
          })}
        </Card>
      )}
    </Screen>
  )
}
