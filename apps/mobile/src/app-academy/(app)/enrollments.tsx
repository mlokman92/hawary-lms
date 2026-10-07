import { useState } from 'react'
import { View } from 'react-native'
import { Stack } from 'expo-router'
import { errorMessage } from '@/lib/errors'
import { fmtDate } from '@/lib/format'
import { useT } from '@/lib/i18n'
import {
  useApproveEnrollment,
  useEnrollmentRequests,
  useRejectEnrollment,
  type EnrollmentRequest,
} from '@/features/enrollment/api'
import { useScope } from '@/shell/scope'
import {
  Button,
  Card,
  Chips,
  confirm,
  Empty,
  ErrorBlock,
  Loading,
  notify,
  Screen,
  space,
  T,
} from '@/ui'

type Filter = 'pending' | 'active'

/**
 * Enrolment requests: who has asked for a course through the public join link,
 * with Approve and Reject.
 *
 * Approving is `approve_enrollment`, which also decides — in the same
 * statement — whether the course's acceptance email goes out
 * (docs/course-enrollment.md). The link itself, which courses accept requests,
 * and bulk enrolment are set up on the web.
 */
export default function EnrollmentsScreen() {
  const { t } = useT()
  const { academyId } = useScope()
  const { data, isLoading, error, refetch, isRefetching } =
    useEnrollmentRequests(academyId)
  const approve = useApproveEnrollment(academyId)
  const reject = useRejectEnrollment(academyId)
  const [filter, setFilter] = useState<Filter>('pending')
  const [busyId, setBusyId] = useState<string | null>(null)

  const all = data ?? []
  const of = (f: Filter) => all.filter((r) => r.status === f)
  const rows = of(filter)

  async function onApprove(r: EnrollmentRequest) {
    setBusyId(r.id)
    try {
      const outcome = await approve.mutateAsync(r.id)
      if (!outcome.result.approved) {
        // Two people pressing Approve on one row is the normal case.
        notify(t('enroll.requests.stale'))
      } else if (outcome.email && !outcome.email.ok) {
        notify(t('enroll.email.failed'))
      }
    } catch (e) {
      notify(errorMessage(e, t('enroll.requests.failed')))
    } finally {
      setBusyId(null)
    }
  }

  async function onReject(r: EnrollmentRequest) {
    const ok = await confirm({
      title: t('enroll.requests.reject'),
      message: `${r.students?.full_name ?? ''} · ${r.courses?.title ?? ''}`,
      confirmLabel: t('enroll.requests.reject'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    })
    if (!ok) return
    setBusyId(r.id)
    try {
      await reject.mutateAsync(r.id)
    } catch (e) {
      notify(errorMessage(e, t('enroll.requests.failed')))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Screen onRefresh={() => void refetch()} refreshing={isRefetching}>
      <Stack.Screen options={{ title: t('nav.enrollments') }} />
      <Chips<Filter>
        value={filter}
        onChange={setFilter}
        options={[
          {
            value: 'pending',
            label: t('enroll.requests.pending'),
            count: of('pending').length,
          },
          {
            value: 'active',
            label: t('enroll.requests.enrolled'),
            count: of('active').length,
          },
        ]}
      />
      {isLoading ? (
        <Loading />
      ) : error ? (
        <ErrorBlock error={error} onRetry={() => void refetch()} />
      ) : rows.length === 0 ? (
        <Empty
          icon="user-plus"
          title={all.length === 0 ? t('enroll.requests.empty') : t('enroll.requests.no_match')}
        />
      ) : (
        rows.slice(0, 100).map((r) => (
          <Card key={r.id} style={{ gap: space.sm }}>
            <T style={{ fontWeight: '600' }}>
              {r.students?.full_name || r.students?.email || t('common.unnamed')}
            </T>
            <T v="small" muted>
              {[
                r.courses?.title,
                r.students?.student_no,
                r.students?.phone,
                fmtDate(r.created_at),
              ]
                .filter(Boolean)
                .join(' · ')}
            </T>
            {r.status === 'pending' ? (
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <Button
                  small
                  style={{ flex: 1 }}
                  title={t('enroll.requests.approve')}
                  loading={busyId === r.id && approve.isPending}
                  disabled={busyId !== null}
                  onPress={() => void onApprove(r)}
                />
                <Button
                  small
                  style={{ flex: 1 }}
                  variant="outline"
                  title={t('enroll.requests.reject')}
                  disabled={busyId !== null}
                  onPress={() => void onReject(r)}
                />
              </View>
            ) : null}
          </Card>
        ))
      )}
    </Screen>
  )
}
