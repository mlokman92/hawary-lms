import { View } from 'react-native'
import { useRouter } from 'expo-router'
import { useT } from '@/lib/i18n'
import { useMyCourses, useMyPendingCourses } from '@/features/learn/api'
import { LearnerGate } from '@/features/learn/context'
import { useLearnDashboard } from '@/features/learn/dashboard'
import {
  Badge,
  Card,
  Empty,
  ErrorBlock,
  Loading,
  ProgressBar,
  Row,
  Screen,
  space,
} from '@/ui'

export default function CoursesTab() {
  return (
    <LearnerGate>
      {({ academyId, studentId }) => (
        <Courses academyId={academyId} studentId={studentId} />
      )}
    </LearnerGate>
  )
}

function Courses({ academyId, studentId }: { academyId: string; studentId: string }) {
  const { t, tn } = useT()
  const router = useRouter()
  const { data: courses, isLoading, error, refetch, isRefetching } = useMyCourses(
    academyId,
    studentId,
  )
  const { data: pending } = useMyPendingCourses(academyId, studentId)
  const { data: dash } = useLearnDashboard(academyId, studentId)

  if (isLoading) return <Loading />
  if (error) return <ErrorBlock error={error} onRetry={() => void refetch()} />

  const none = (courses ?? []).length === 0 && (pending ?? []).length === 0

  return (
    <Screen onRefresh={() => void refetch()} refreshing={isRefetching}>
      {none ? (
        <Empty
          icon="book-open"
          title={t('learn.empty.courses.title')}
          body={t('learn.empty.courses.body')}
        />
      ) : (
        <Card flush>
          {(courses ?? []).map((course, i) => {
            const s = dash?.byCourse.get(course.id)
            const total = s?.total ?? 0
            const pct = total === 0 ? 0 : Math.round(((s?.done ?? 0) / total) * 100)
            return (
              <View key={course.id}>
                <Row
                  first={i === 0}
                  title={course.title}
                  subtitle={[
                    course.code,
                    tn('learn.count.notes', s?.notes ?? 0),
                    total > 0
                      ? t('learn.progress.tasks_done', { done: s?.done ?? 0, total })
                      : t('learn.no_tasks_yet'),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  onPress={() => router.push(`/courses/${course.id}` as never)}
                />
                {total > 0 ? (
                  <View style={{ paddingHorizontal: space.lg, paddingBottom: space.md }}>
                    <ProgressBar value={pct} />
                  </View>
                ) : null}
              </View>
            )
          })}
          {/* A request the academy has not opened yet: a plain row, so a
              student who just asked can see that it landed. */}
          {(pending ?? []).map((p, i) => (
            <Row
              key={p.id}
              first={i === 0 && (courses ?? []).length === 0}
              title={p.title}
              right={<Badge label={t('enroll.status.pending')} variant="outline" />}
            />
          ))}
        </Card>
      )}
    </Screen>
  )
}
