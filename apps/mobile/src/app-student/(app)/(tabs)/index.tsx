import { View } from 'react-native'
import { useRouter } from 'expo-router'
import { localeFor } from '@/lib/format'
import { useT } from '@/lib/i18n'
import {
  DEFAULT_TZ,
  useAcademyTimezone,
  useMyAppointments,
} from '@/features/appointments/api'
import { fmtWhen } from '@/features/appointments/calendar'
import { useMyCourses } from '@/features/learn/api'
import { LearnerGate } from '@/features/learn/context'
import { isDueSoon, isOverdue, useLearnDashboard } from '@/features/learn/dashboard'
import { dueLabel, taskHref } from '@/features/learn/tasks'
import { REPORT_STATUS, useMyReports } from '@/features/reports/api'
import {
  Badge,
  Card,
  ErrorBlock,
  Loading,
  ProgressBar,
  Row,
  Screen,
  Section,
  StatTile,
  T,
  space,
} from '@/ui'

/**
 * The learner's home: what is due, what has been marked, when they are next
 * expected in person, and what became of the documents they sent.
 *
 * The same queries and the same grouping as the web dashboard
 * (`LearnDashboardPage`), laid out for one column.
 */
export default function StudentHome() {
  return (
    <LearnerGate>
      {({ academyId, studentId }) => (
        <Dashboard academyId={academyId} studentId={studentId} />
      )}
    </LearnerGate>
  )
}

function Dashboard({
  academyId,
  studentId,
}: {
  academyId: string
  studentId: string
}) {
  const { t, tn, lang } = useT()
  const router = useRouter()
  const locale = localeFor(lang)
  const { data, isLoading, error, refetch, isRefetching } = useLearnDashboard(
    academyId,
    studentId,
  )
  const { data: courses } = useMyCourses(academyId, studentId)
  const { data: tz = DEFAULT_TZ } = useAcademyTimezone(academyId)
  const { data: sessions } = useMyAppointments(academyId)
  const { data: reports } = useMyReports(academyId)

  const tasks = data?.tasks ?? []
  const outstanding = tasks.filter(
    (x) => x.state === 'todo' || x.state === 'in_progress',
  )
  const overdue = outstanding.filter((x) => isOverdue(x))
  const soon = outstanding
    .filter((x) => !isOverdue(x) && isDueSoon(x))
    .sort((a, b) => (a.due_at ?? '').localeCompare(b.due_at ?? ''))
  const rest = outstanding.filter((x) => !isOverdue(x) && !isDueSoon(x))
  const awaiting = tasks.filter((x) => x.state === 'awaiting')
  const marked = tasks
    .filter((x) => x.state === 'marked')
    .sort((a, b) => (b.submittedAt ?? '').localeCompare(a.submittedAt ?? ''))
  const earned = marked.reduce((s, x) => s + (x.score ?? 0), 0)
  const possible = marked.reduce((s, x) => s + (x.outOf ?? 0), 0)

  // Cut on `ends_at`, the rule the register uses: a session being taught right
  // now is still today's session, not history.
  const upcoming = (sessions ?? [])
    .filter((a) => a.status === 'booked' && Date.parse(a.ends_at) >= Date.now())
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    .slice(0, 3)

  const myReports = (reports?.courses ?? [])
    .map((c) => c.report)
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => b.last_at.localeCompare(a.last_at))
    .slice(0, 3)

  const next = [...overdue, ...soon, ...rest].slice(0, 5)
  const work = (state: string) => () =>
    router.push({ pathname: '/work', params: { state } } as never)

  return (
    <Screen onRefresh={() => void refetch()} refreshing={isRefetching}>
      <View style={{ gap: space.md }}>
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <StatTile
            label={t('common.overdue')}
            value={String(overdue.length)}
            tone={overdue.length > 0 ? 'danger' : 'muted'}
            onPress={work('overdue')}
          />
          <StatTile
            label={t('learn.stat.due_week')}
            value={String(soon.length)}
            tone={soon.length > 0 ? 'warning' : 'muted'}
            onPress={work('todo')}
          />
        </View>
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <StatTile
            label={t('learn.stat.awaiting')}
            value={String(awaiting.length)}
            tone="accent"
            onPress={work('awaiting')}
          />
          <StatTile
            label={t('status.task.marked')}
            value={
              possible > 0
                ? `${Math.round((earned / possible) * 100)}%`
                : String(marked.length)
            }
            tone="positive"
            onPress={work('marked')}
          />
        </View>
      </View>

      {isLoading ? (
        <Loading />
      ) : error ? (
        <ErrorBlock error={error} onRetry={() => void refetch()} />
      ) : (
        <>
          <Section
            title={t('learn.up_next')}
            action={{ label: t('learn.all_work'), onPress: () => router.push('/work' as never) }}
          >
            <Card flush>
              {next.length === 0 ? (
                <T muted center style={{ padding: space.xl }}>
                  {t('learn.empty.outstanding')}
                </T>
              ) : (
                next.map((task, i) => (
                  <Row
                    key={`${task.kind}-${task.id}`}
                    first={i === 0}
                    icon={task.kind === 'assignment' ? 'file-text' : 'clipboard'}
                    title={task.title}
                    subtitle={dueLabel(task, t)}
                    onPress={() => router.push(taskHref(task) as never)}
                  />
                ))
              )}
            </Card>
          </Section>

          <Section
            title={t('appt.learn.mine')}
            action={{
              label: t('learn.view_all'),
              onPress: () => router.push('/appointments' as never),
            }}
          >
            <Card flush>
              {upcoming.length === 0 ? (
                <T muted center style={{ padding: space.xl }}>
                  {t('appt.dash.none')}
                </T>
              ) : (
                upcoming.map((a, i) => (
                  <Row
                    key={a.id}
                    first={i === 0}
                    icon="calendar"
                    title={fmtWhen(a.starts_at, tz, locale)}
                    subtitle={a.instructor.full_name ?? t('common.unnamed')}
                    onPress={() => router.push('/appointments' as never)}
                  />
                ))
              )}
            </Card>
          </Section>

          <Section
            title={t('report.dash.learn.title')}
            action={{
              label: t('learn.view_all'),
              onPress: () => router.push('/reports' as never),
            }}
          >
            <Card flush>
              {myReports.length === 0 ? (
                <T muted center style={{ padding: space.xl }}>
                  {t('report.dash.learn.empty')}
                </T>
              ) : (
                myReports.map((r, i) => {
                  const meta = REPORT_STATUS[r.status]
                  return (
                    <Row
                      key={r.id}
                      first={i === 0}
                      icon="file"
                      title={r.title}
                      subtitle={
                        r.instructor_name
                          ? t('report.checked_by', { name: r.instructor_name })
                          : t('report.unassigned')
                      }
                      right={<Badge label={t(meta.labelKey)} tone={meta.tone} />}
                      onPress={() => router.push(`/reports/${r.id}` as never)}
                    />
                  )
                })
              )}
            </Card>
          </Section>

          <Section
            title={t('nav.learn.courses')}
            action={{
              label: t('learn.all_courses'),
              onPress: () => router.push('/courses' as never),
            }}
          >
            <Card flush>
              {!courses || courses.length === 0 ? (
                <T muted center style={{ padding: space.xl }}>
                  {t('learn.empty.courses_short')}
                </T>
              ) : (
                courses.slice(0, 4).map((course, i) => {
                  const s = data?.byCourse.get(course.id)
                  const total = s?.total ?? 0
                  const pct =
                    total === 0 ? 0 : Math.round(((s?.done ?? 0) / total) * 100)
                  return (
                    <View key={course.id}>
                      <Row
                        first={i === 0}
                        title={course.title}
                        subtitle={`${tn('learn.count.notes', s?.notes ?? 0)} · ${t(
                          'learn.progress.tasks_done',
                          { done: s?.done ?? 0, total },
                        )}`}
                        onPress={() =>
                          router.push(`/courses/${course.id}` as never)
                        }
                      />
                      {total > 0 ? (
                        <View style={{ paddingHorizontal: space.lg, paddingBottom: space.md }}>
                          <ProgressBar value={pct} />
                        </View>
                      ) : null}
                    </View>
                  )
                })
              )}
            </Card>
          </Section>
        </>
      )}
    </Screen>
  )
}
