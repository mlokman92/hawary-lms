import { useState } from 'react'
import { View } from 'react-native'
import { Stack } from 'expo-router'
import { useAuth } from '@/lib/auth'
import { IS_STUDENT_APP } from '@/lib/env'
import { errorMessage } from '@/lib/errors'
import { fmtDateTime } from '@/lib/format'
import { useT } from '@/lib/i18n'
import {
  useAnnouncements,
  useDeleteAnnouncement,
  usePostAnnouncement,
  type Announcement,
} from '@/features/announcements/api'
import { useMyGradableCourses } from '@/features/grading/api'
import { useScope } from '@/shell/scope'
import {
  Button,
  Card,
  confirm,
  Empty,
  ErrorBlock,
  Field,
  FormError,
  IconButton,
  Input,
  Loading,
  Menu,
  Screen,
  Select,
  Sheet,
  T,
  space,
} from '@/ui'

/** The Select's value for "everyone", which is a null course in the database. */
const EVERYONE = '__all__'

/**
 * Announcements, in both apps.
 *
 * A student reads. Staff read and write: an admin may address the whole
 * academy or any course, a trainer the courses they teach — `post_announcement`
 * enforces that, and the picker here only offers what it would accept.
 *
 * Posting notifies every recipient in the same statement, and the push follows
 * the notification, so this screen sends nothing itself.
 */
export function AnnouncementsScreen() {
  const { t } = useT()
  const { user } = useAuth()
  const { academyId, isAdmin } = useScope()
  const { data, isLoading, error, refetch, isRefetching } =
    useAnnouncements(academyId)
  const [composing, setComposing] = useState(false)

  return (
    <Screen onRefresh={() => void refetch()} refreshing={isRefetching}>
      <Stack.Screen
        options={{
          title: t('m.ann.title'),
          headerRight: () =>
            IS_STUDENT_APP ? null : (
              <IconButton
                name="plus"
                label={t('m.ann.new')}
                onPress={() => setComposing(true)}
              />
            ),
        }}
      />
      {isLoading ? (
        <Loading />
      ) : error ? (
        <ErrorBlock error={error} onRetry={() => void refetch()} />
      ) : !data || data.length === 0 ? (
        <Empty icon="volume-2" title={t('m.ann.empty')} />
      ) : (
        data.map((a) => (
          <AnnouncementCard
            key={a.id}
            item={a}
            canDelete={
              !IS_STUDENT_APP && !!academyId && (isAdmin || a.created_by === user?.id)
            }
            academyId={academyId}
          />
        ))
      )}
      {!IS_STUDENT_APP && academyId ? (
        <Compose
          academyId={academyId}
          isAdmin={isAdmin}
          visible={composing}
          onClose={() => setComposing(false)}
        />
      ) : null}
    </Screen>
  )
}

function AnnouncementCard({
  item,
  canDelete,
  academyId,
}: {
  item: Announcement
  canDelete: boolean
  academyId: string | null
}) {
  const { t } = useT()
  const remove = useDeleteAnnouncement(academyId ?? '')

  async function onDelete() {
    const ok = await confirm({
      title: t('m.ann.delete.title'),
      message: t('m.ann.delete.body'),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    })
    if (ok) remove.mutate(item.id)
  }

  return (
    <Card style={{ gap: space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}>
        <T v="heading" style={{ flex: 1 }}>
          {item.title}
        </T>
        {canDelete ? (
          <Menu
            label={t('common.actions')}
            items={[
              {
                label: t('common.delete'),
                icon: 'trash-2',
                destructive: true,
                onPress: () => void onDelete(),
              },
            ]}
          />
        ) : null}
      </View>
      <T>{item.body}</T>
      <T v="small" muted>
        {[
          item.course?.title ?? t('m.ann.everyone'),
          item.author_name,
          fmtDateTime(item.created_at),
        ]
          .filter(Boolean)
          .join(' · ')}
      </T>
      <FormError
        error={remove.error ? errorMessage(remove.error, t('common.error')) : null}
      />
    </Card>
  )
}

function Compose({
  academyId,
  isAdmin,
  visible,
  onClose,
}: {
  academyId: string
  isAdmin: boolean
  visible: boolean
  onClose: () => void
}) {
  const { t } = useT()
  const { data: gradable } = useMyGradableCourses(academyId, isAdmin)
  const post = usePostAnnouncement(academyId)
  const [target, setTarget] = useState<string | null>(isAdmin ? EVERYONE : null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)

  const courses = gradable?.courses ?? []
  const options = [
    ...(isAdmin ? [{ value: EVERYONE, label: t('m.ann.everyone') }] : []),
    ...courses.map((c) => ({ value: c.id, label: c.title })),
  ]

  async function send() {
    if (!target) return
    setError(null)
    try {
      await post.mutateAsync({
        courseId: target === EVERYONE ? null : target,
        title,
        body,
      })
      setTitle('')
      setBody('')
      onClose()
    } catch (e) {
      setError(errorMessage(e, t('common.error')))
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose} title={t('m.ann.new')}>
      {options.length === 0 ? (
        // A trainer assigned to no course has nobody to address — the real
        // case the trainer dashboard also has to name.
        <T muted>{t('m.ann.no_courses')}</T>
      ) : (
        <>
          <Field label={t('m.ann.to')}>
            <Select
              value={target}
              options={options}
              onChange={setTarget}
              placeholder={t('common.select')}
              title={t('m.ann.to')}
            />
          </Field>
          <Field label={t('common.title')}>
            <Input value={title} onChangeText={setTitle} maxLength={120} />
          </Field>
          <Field label={t('m.ann.message')}>
            <Input value={body} onChangeText={setBody} multiline />
          </Field>
          <FormError error={error} />
          <Button
            icon="send"
            title={post.isPending ? t('common.sending') : t('m.ann.post')}
            loading={post.isPending}
            disabled={!target || !title.trim() || !body.trim()}
            onPress={() => void send()}
          />
        </>
      )}
    </Sheet>
  )
}
