import { useEffect, useState } from 'react'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useT } from '@/lib/i18n'
import { LearnerGate } from '@/features/learn/context'
import {
  isOverdue,
  useLearnDashboard,
  type LearnTask,
} from '@/features/learn/dashboard'
import { TASK_STATE_META } from '@/features/learn/status'
import { dueLabel, taskHref } from '@/features/learn/tasks'
import {
  Badge,
  Card,
  Chips,
  Empty,
  ErrorBlock,
  Loading,
  Row,
  Screen,
  T,
} from '@/ui'

type Filter = 'all' | 'overdue' | 'todo' | 'awaiting' | 'marked'
const FILTERS: Filter[] = ['todo', 'overdue', 'awaiting', 'marked', 'all']

const outstanding = (x: LearnTask) =>
  x.state === 'todo' || x.state === 'in_progress'

function apply(filter: Filter, tasks: LearnTask[]): LearnTask[] {
  switch (filter) {
    case 'overdue':
      return tasks.filter((x) => isOverdue(x))
    case 'todo':
      return tasks.filter(outstanding)
    case 'awaiting':
      return tasks.filter((x) => x.state === 'awaiting')
    case 'marked':
      return tasks.filter((x) => x.state === 'marked')
    default:
      return tasks
  }
}

export default function WorkScreen() {
  const { t } = useT()
  return (
    <>
      <Stack.Screen options={{ title: t('nav.learn.work') }} />
      <LearnerGate>
        {({ academyId, studentId }) => (
          <Work academyId={academyId} studentId={studentId} />
        )}
      </LearnerGate>
    </>
  )
}

/**
 * Every assignment and assessment across the student's courses, one list.
 * The dashboard's tiles deep-link into its filters through `?state=`.
 */
function Work({ academyId, studentId }: { academyId: string; studentId: string }) {
  const { t } = useT()
  const router = useRouter()
  const params = useLocalSearchParams<{ state?: string }>()
  const fromLink = FILTERS.includes(params.state as Filter)
    ? (params.state as Filter)
    : null
  const [filter, setFilter] = useState<Filter>(fromLink ?? 'todo')
  // Followed explicitly, so a second tile pressed on the dashboard is obeyed.
  useEffect(() => {
    if (fromLink) setFilter(fromLink)
  }, [fromLink])

  const { data, isLoading, error, refetch, isRefetching } = useLearnDashboard(
    academyId,
    studentId,
  )
  const tasks = data?.tasks ?? []
  const rows = apply(filter, tasks).sort((a, b) =>
    (a.due_at ?? '9999').localeCompare(b.due_at ?? '9999'),
  )

  const label: Record<Filter, string> = {
    all: t('common.all'),
    overdue: t('common.overdue'),
    todo: t('status.task.todo'),
    awaiting: t('status.task.awaiting'),
    marked: t('status.task.marked'),
  }

  return (
    <Screen onRefresh={() => void refetch()} refreshing={isRefetching}>
      <Chips
        value={filter}
        onChange={setFilter}
        options={FILTERS.map((f) => ({
          value: f,
          label: label[f],
          count: apply(f, tasks).length,
        }))}
      />
      {isLoading ? (
        <Loading />
      ) : error ? (
        <ErrorBlock error={error} onRetry={() => void refetch()} />
      ) : rows.length === 0 ? (
        <Empty
          icon="check-square"
          title={
            tasks.length === 0 ? t('learn.empty.no_work') : t('learn.empty.no_match')
          }
        />
      ) : (
        <Card flush>
          {rows.map((task, i) => {
            const meta = TASK_STATE_META[task.state]
            return (
              <Row
                key={`${task.kind}-${task.id}`}
                first={i === 0}
                icon={task.kind === 'assignment' ? 'edit-3' : 'clipboard'}
                title={task.title}
                subtitle={
                  task.state === 'marked'
                    ? `${task.score ?? '—'} / ${task.outOf ?? '—'}`
                    : dueLabel(task, t)
                }
                right={
                  task.state === 'todo' ? (
                    isOverdue(task) ? (
                      <T v="small" tone="danger">
                        {t('common.overdue')}
                      </T>
                    ) : null
                  ) : (
                    <Badge label={t(meta.labelKey)} variant={meta.variant} />
                  )
                }
                onPress={() => router.push(taskHref(task) as never)}
              />
            )
          })}
        </Card>
      )}
    </Screen>
  )
}
