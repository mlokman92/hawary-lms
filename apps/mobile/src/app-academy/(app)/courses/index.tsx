import { Stack, useRouter } from 'expo-router'
import { useT } from '@/lib/i18n'
import {
  COURSE_STATUS_LABEL,
  countOf,
  useActiveStudentCounts,
  useCourses,
} from '@/features/courses/api'
import { useScope } from '@/shell/scope'
import { Badge, Card, Empty, ErrorBlock, Loading, Row, Screen } from '@/ui'

/**
 * The course list, to look at. Building a course — modules, notes, questions,
 * uploads — is the web app's job; what a phone is good for is checking what is
 * in one and switching a piece of it on or off.
 */
export default function CoursesScreen() {
  const { t, tn } = useT()
  const router = useRouter()
  const { academyId } = useScope()
  const { data, isLoading, error, refetch, isRefetching } = useCourses(academyId)
  const { data: students } = useActiveStudentCounts(academyId)

  const rows = (data ?? []).filter((c) => c.status !== 'archived')

  return (
    <Screen onRefresh={() => void refetch()} refreshing={isRefetching}>
      <Stack.Screen options={{ title: t('nav.courses') }} />
      {isLoading ? (
        <Loading />
      ) : error ? (
        <ErrorBlock error={error} onRetry={() => void refetch()} />
      ) : rows.length === 0 ? (
        <Empty icon="book-open" title={t('courses.empty.none')} />
      ) : (
        <Card flush>
          {rows.map((c, i) => (
            <Row
              key={c.id}
              first={i === 0}
              title={c.title}
              subtitle={[
                c.code,
                tn('courses.module_count', countOf(c.modules)),
                `${students?.get(c.id) ?? 0} ${t('common.students').toLowerCase()}`,
              ]
                .filter(Boolean)
                .join(' · ')}
              right={
                c.status === 'published' ? null : (
                  <Badge label={t(COURSE_STATUS_LABEL[c.status])} variant="outline" />
                )
              }
              onPress={() => router.push(`/courses/${c.id}` as never)}
            />
          ))}
        </Card>
      )}
    </Screen>
  )
}
