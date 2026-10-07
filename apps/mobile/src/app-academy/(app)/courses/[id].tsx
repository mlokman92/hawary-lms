import { Switch, View } from 'react-native'
import { useQueryClient } from '@tanstack/react-query'
import { Stack, useLocalSearchParams } from 'expo-router'
import { useT, type TKey } from '@/lib/i18n'
import { useCourse } from '@/features/courses/api'
import { useCourseItems, type CourseItem } from '@/features/courses/content'
import {
  useModules,
  useTogglePublished,
  useUpdateModule,
  type ItemKind,
} from '@/features/modules/api'
import { useScope } from '@/shell/scope'
import {
  Card,
  Empty,
  ErrorBlock,
  FormError,
  Icon,
  Loading,
  Screen,
  T,
  space,
  useTheme,
  type IconName,
} from '@/ui'

const KIND: Record<ItemKind, { icon: IconName; labelKey: TKey }> = {
  note: { icon: 'file-text', labelKey: 'courses.item.note' },
  material: { icon: 'paperclip', labelKey: 'courses.item.material' },
  assessment: { icon: 'clipboard', labelKey: 'courses.item.assessment' },
  assignment: { icon: 'edit-3', labelKey: 'courses.item.assignment' },
}
const ORDER: ItemKind[] = ['note', 'material', 'assessment', 'assignment']

/**
 * One course's structure: its modules and what each holds, with the publish
 * switch on every row — the one piece of course-building that makes sense from
 * a phone ("the note is ready, switch it on").
 *
 * A student sees an item only when the item AND its module are published, so
 * both switches are here, the module's on its heading.
 */
export default function CourseScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>()
  const { t } = useT()
  const { c } = useTheme()
  const qc = useQueryClient()
  const { academyId } = useScope()
  const { data: course } = useCourse(id)
  const { data: modules, isLoading, error, refetch, isRefetching } = useModules(
    academyId,
    id,
  )
  const { data: items, refetch: refetchItems } = useCourseItems(academyId, id)
  const toggle = useTogglePublished(academyId)
  const updateModule = useUpdateModule(academyId ?? '', id)

  function flip(item: CourseItem, next: boolean) {
    toggle.mutate(
      { kind: item.kind, id: item.id, next },
      {
        onSettled: () =>
          void qc.invalidateQueries({ queryKey: ['course-content', academyId, id] }),
      },
    )
  }

  const failure = toggle.error ?? updateModule.error

  return (
    <Screen
      onRefresh={() => {
        void refetch()
        void refetchItems()
      }}
      refreshing={isRefetching}
    >
      <Stack.Screen options={{ title: course?.title ?? t('common.course') }} />
      {course ? (
        <View style={{ gap: 4 }}>
          <T v="title">{course.title}</T>
          {course.description ? <T muted>{course.description}</T> : null}
        </View>
      ) : null}
      <FormError error={failure ? t('common.error') : null} />

      {isLoading ? (
        <Loading />
      ) : error ? (
        <ErrorBlock error={error} onRetry={() => void refetch()} />
      ) : (modules ?? []).length === 0 ? (
        <Empty icon="layers" title={t('courses.modules.empty.title')} />
      ) : (
        (modules ?? []).map((m) => {
          const inside = (items ?? [])
            .filter((x) => x.module_id === m.id)
            .sort(
              (a, b) =>
                ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) ||
                a.sort_order - b.sort_order,
            )
          return (
            <View key={m.id} style={{ gap: space.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                <View style={{ flex: 1 }}>
                  <T v="heading">{m.title}</T>
                  {m.is_published ? null : (
                    <T v="small" muted>
                      {t('courses.module.hidden')}
                    </T>
                  )}
                </View>
                <Switch
                  value={m.is_published}
                  onValueChange={(next) =>
                    updateModule.mutate({ id: m.id, patch: { is_published: next } })
                  }
                  accessibilityLabel={t('common.publish_aria', { title: m.title })}
                />
              </View>
              <Card flush>
                {inside.length === 0 ? (
                  <T muted style={{ padding: space.lg }}>
                    {t('courses.section.empty')}
                  </T>
                ) : (
                  inside.map((item, i) => (
                    <View
                      key={`${item.kind}-${item.id}`}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: space.md,
                        paddingHorizontal: space.lg,
                        paddingVertical: space.sm,
                        minHeight: 52,
                        borderTopWidth: i === 0 ? 0 : 0.5,
                        borderTopColor: c.border,
                      }}
                    >
                      <Icon name={KIND[item.kind].icon} />
                      <View style={{ flex: 1 }}>
                        <T numberOfLines={2}>{item.title || t('common.untitled')}</T>
                        <T v="small" muted>
                          {t(KIND[item.kind].labelKey)}
                        </T>
                      </View>
                      <Switch
                        value={item.is_published}
                        onValueChange={(next) => flip(item, next)}
                        accessibilityLabel={t('common.publish_aria', {
                          title: item.title,
                        })}
                      />
                    </View>
                  ))
                )}
              </Card>
            </View>
          )
        })
      )}
    </Screen>
  )
}
