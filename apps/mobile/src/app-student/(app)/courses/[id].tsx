import { View } from 'react-native'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { fmtDate } from '@/lib/format'
import { useT } from '@/lib/i18n'
import { formatBytes } from '@/lib/storage'
import { useOpenFile } from '@/features/files/api'
import { useLearnCourseContent, useMyCourses } from '@/features/learn/api'
import { LearnerGate } from '@/features/learn/context'
import { useLearnDashboard } from '@/features/learn/dashboard'
import {
  Card,
  Empty,
  ErrorBlock,
  FormError,
  Loading,
  ProgressBar,
  Row,
  Screen,
  T,
  space,
} from '@/ui'

export default function CourseScreen() {
  const { t } = useT()
  return (
    <>
      <Stack.Screen options={{ title: t('common.course') }} />
      <LearnerGate>
        {({ academyId, studentId }) => (
          <Course academyId={academyId} studentId={studentId} />
        )}
      </LearnerGate>
    </>
  )
}

/**
 * One course: its published modules, each holding notes, materials,
 * assessments and assignments — the web app's `LearnCoursePage`.
 *
 * A material has no screen of its own. Tapping one mints a 60-second signed
 * URL and opens the file (docs/course-materials.md).
 */
function Course({ academyId, studentId }: { academyId: string; studentId: string }) {
  const { id: courseId = '' } = useLocalSearchParams<{ id: string }>()
  const { t, tn } = useT()
  const router = useRouter()
  const openFile = useOpenFile()
  const { data: courses, isPending: coursesPending } = useMyCourses(academyId, studentId)
  const { data, isLoading, error, refetch, isRefetching } = useLearnCourseContent(
    academyId,
    courseId,
  )
  const { data: dash } = useLearnDashboard(academyId, studentId)

  const course = courses?.find((c) => c.id === courseId)
  const progress = dash?.byCourse.get(courseId)
  const total = progress?.total ?? 0
  const done = progress?.done ?? 0
  const pct = total === 0 ? 0 : Math.round((done / total) * 100)

  if (!coursesPending && !course) {
    return <Empty icon="lock" title={t('learn.not_enrolled')} />
  }

  return (
    <Screen onRefresh={() => void refetch()} refreshing={isRefetching}>
      <Stack.Screen options={{ title: course?.title ?? t('common.course') }} />
      <View style={{ gap: space.sm }}>
        <T v="title">{course?.title ?? t('common.course')}</T>
        {course?.description ? <T muted>{course.description}</T> : null}
        {total > 0 ? (
          <View style={{ gap: 6 }}>
            <T v="small" muted>
              {t('learn.progress.tasks_done', { done, total })} · {pct}%
            </T>
            <ProgressBar value={pct} />
          </View>
        ) : null}
      </View>

      <FormError error={openFile.error ? t('material.no_url') : null} />

      {isLoading ? (
        <Loading />
      ) : error ? (
        <ErrorBlock error={error} onRetry={() => void refetch()} />
      ) : !data || data.modules.length === 0 ? (
        <Empty
          icon="layers"
          title={t('learn.empty.published.title')}
          body={t('learn.empty.published.body')}
        />
      ) : (
        data.modules.map((m) => {
          const notes = data.notes.filter((n) => n.module_id === m.id)
          const materials = data.materials.filter((x) => x.module_id === m.id)
          const assessments = data.assessments.filter((a) => a.module_id === m.id)
          const assignments = data.assignments.filter((a) => a.module_id === m.id)
          const empty =
            notes.length + materials.length + assessments.length + assignments.length === 0
          let first = true
          const isFirst = () => {
            const was = first
            first = false
            return was
          }
          return (
            <View key={m.id} style={{ gap: space.sm }}>
              <View>
                <T v="heading">{m.title}</T>
                {m.description ? (
                  <T v="small" muted>
                    {m.description}
                  </T>
                ) : null}
              </View>
              <Card flush>
                {empty ? (
                  <T muted style={{ padding: space.lg }}>
                    {t('learn.empty.module')}
                  </T>
                ) : (
                  <>
                    {notes.map((n) => (
                      <Row
                        key={n.id}
                        first={isFirst()}
                        icon="file-text"
                        title={n.title || t('common.untitled')}
                        onPress={() => router.push(`/notes/${n.id}` as never)}
                      />
                    ))}
                    {materials.map((x) => (
                      <Row
                        key={x.id}
                        first={isFirst()}
                        icon="paperclip"
                        title={x.title || x.file_name}
                        subtitle={formatBytes(x.size_bytes) || null}
                        onPress={() => openFile.mutate({ kind: 'material', id: x.id })}
                      />
                    ))}
                    {assessments.map((a) => (
                      <Row
                        key={a.id}
                        first={isFirst()}
                        icon="clipboard"
                        title={a.title || t('common.untitled')}
                        subtitle={
                          a.duration_minutes
                            ? t('learn.meta.minutes', { minutes: a.duration_minutes })
                            : tn('lwork.points', Number(a.total_points))
                        }
                        onPress={() => router.push(`/assessments/${a.id}` as never)}
                      />
                    ))}
                    {assignments.map((a) => (
                      <Row
                        key={a.id}
                        first={isFirst()}
                        icon="edit-3"
                        title={a.title || t('common.untitled')}
                        subtitle={
                          a.due_at
                            ? t('learn.meta.due', { date: fmtDate(a.due_at) })
                            : tn('lwork.points', Number(a.total_points))
                        }
                        onPress={() => router.push(`/assignments/${a.id}` as never)}
                      />
                    ))}
                  </>
                )}
              </Card>
            </View>
          )
        })
      )}
    </Screen>
  )
}
