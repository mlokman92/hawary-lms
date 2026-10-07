import { Platform, Pressable, View } from 'react-native'
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
import {
  detailOf,
  isAppointmentKind,
  isReportKind,
  titleOf,
} from '@/features/notifications/render'
import { linkOf } from '@/shell/links'
import { useScope } from '@/shell/scope'
import {
  Card,
  Empty,
  ErrorBlock,
  Loading,
  Row,
  Screen,
  T,
  useTheme,
  type IconName,
} from '@/ui'

/**
 * The notification centre — the web app's bell, as a screen.
 *
 * Same rows, same wording (`features/notifications/render.ts`, shared with the
 * web bell), same rule: opening a row marks it read and goes where it leads.
 * There is no "mark unread", no filter and no page of older ones — twenty is
 * what the list holds (docs/notifications.md).
 */
/** One glyph per family of event, so the list can be scanned by what happened. */
function iconOf(row: Notification): IconName {
  if (isReportKind(row)) return 'clipboard'
  if (isAppointmentKind(row)) return 'calendar'
  if (row.kind === 'work_marked' || row.kind === 'work_due') return 'check-square'
  if (row.kind === 'invoice_issued' || row.kind === 'payment_received') return 'credit-card'
  return 'volume-2'
}

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
              <Pressable
                onPress={() => markAll.mutate()}
                hitSlop={10}
                // The web preview's header has no gutter of its own.
                style={Platform.OS === 'web' ? { marginRight: 16 } : null}
              >
                <T v="small" style={{ color: c.brand, fontWeight: '600' }}>
                  {t('notif.mark_all')}
                </T>
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
          {rows.map((row, i) => (
            <Row
              key={row.id}
              first={i === 0}
              icon={iconOf(row)}
              title={titleOf(row, t)}
              subtitle={detailOf(row, locale) || null}
              chevron={false}
              // Unread is a dot, drawn only when there is something to draw.
              right={
                row.read_at ? null : (
                  <View
                    style={{
                      width: 9,
                      height: 9,
                      borderRadius: 5,
                      backgroundColor: c.brand,
                    }}
                  />
                )
              }
              onPress={() => open(row)}
            />
          ))}
        </Card>
      )}
    </Screen>
  )
}
