import { useEffect, useState } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { fmtDateTime } from '@/lib/format'
import { useT } from '@/lib/i18n'
import {
  useAcademyQueue,
  useMyGradableCourses,
  type QueueRow,
} from '@/features/grading/api'
import { useScope } from '@/shell/scope'
import {
  Badge,
  Card,
  Chips,
  Empty,
  ErrorBlock,
  Loading,
  Row,
  Screen,
  SearchInput,
} from '@/ui'

type Kind = 'assessment' | 'assignment'
type Status = 'awaiting' | 'marked' | 'all'

/**
 * The two grading queues, as one tab with a switch — on the web they are two
 * pages (`/assessments`, `/assignments`) because a sidebar has room for both.
 *
 * Academy-wide on purpose: RLS (`app.can_grade_*`) already narrows a trainer
 * to the courses they are assigned to, so there is no course filter that could
 * change the result. Oldest first, because what has waited longest is what a
 * marker should see first.
 */
export default function MarkingTab() {
  const { t } = useT()
  const router = useRouter()
  const { academyId, isAdmin } = useScope()
  const params = useLocalSearchParams<{ kind?: string }>()
  const fromLink: Kind | null =
    params.kind === 'assessment' || params.kind === 'assignment' ? params.kind : null
  const [kind, setKind] = useState<Kind>(fromLink ?? 'assignment')
  useEffect(() => {
    if (fromLink) setKind(fromLink)
  }, [fromLink])
  const [status, setStatus] = useState<Status>('awaiting')
  const [search, setSearch] = useState('')

  const { data, isLoading, error, refetch, isRefetching } = useAcademyQueue(
    kind,
    academyId,
  )
  const { data: gradable } = useMyGradableCourses(academyId, isAdmin)

  const all = data ?? []
  const byStatus = (s: Status, rows: QueueRow[]) =>
    s === 'all'
      ? rows
      : rows.filter((r) => (s === 'awaiting' ? r.status === 'submitted' : r.status !== 'submitted'))
  const q = search.trim().toLowerCase()
  const rows = byStatus(status, all).filter(
    (r) =>
      !q ||
      (r.student?.full_name ?? '').toLowerCase().includes(q) ||
      (r.student?.student_no ?? '').toLowerCase().includes(q) ||
      r.title.toLowerCase().includes(q),
  )

  // "Nothing waiting" and "you are not assigned to a course" are different
  // answers, and the second is the real case for a new trainer.
  const unassigned = !isAdmin && gradable && gradable.courses.length === 0

  return (
    <Screen onRefresh={() => void refetch()} refreshing={isRefetching}>
      <Chips<Kind>
        value={kind}
        onChange={setKind}
        options={[
          { value: 'assignment', label: t('nav.assignments') },
          { value: 'assessment', label: t('nav.assessments') },
        ]}
      />
      <Chips<Status>
        value={status}
        onChange={setStatus}
        options={[
          {
            value: 'awaiting',
            label: t('grading.queue.awaiting'),
            count: byStatus('awaiting', all).length,
          },
          {
            value: 'marked',
            label: t('status.task.marked'),
            count: byStatus('marked', all).length,
          },
          { value: 'all', label: t('common.all'), count: all.length },
        ]}
      />
      <SearchInput value={search} onChangeText={setSearch} />

      {isLoading ? (
        <Loading />
      ) : error ? (
        <ErrorBlock error={error} onRetry={() => void refetch()} />
      ) : unassigned ? (
        <Empty icon="user-x" title={t('grading.denied.not_assigned')} />
      ) : rows.length === 0 ? (
        <Empty
          icon="check-square"
          title={
            all.length > 0
              ? t('grading.queue.no_match')
              : t(
                  kind === 'assessment'
                    ? 'grading.queue.empty.assessments'
                    : 'grading.queue.empty.assignments',
                )
          }
        />
      ) : (
        <Card flush>
          {rows.map((r, i) => (
            <Row
              key={r.id}
              first={i === 0}
              title={r.student?.full_name ?? t('common.unnamed')}
              subtitle={[
                r.title,
                r.attemptNo
                  ? t('lwork.assessment.attempt_no', { n: r.attemptNo })
                  : null,
                r.submittedAt ? fmtDateTime(r.submittedAt) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
              right={
                r.status === 'submitted' ? null : (
                  <Badge label={`${r.score ?? '—'} / ${r.outOf ?? '—'}`} />
                )
              }
              onPress={() => router.push(r.href as never)}
            />
          ))}
        </Card>
      )}
    </Screen>
  )
}
