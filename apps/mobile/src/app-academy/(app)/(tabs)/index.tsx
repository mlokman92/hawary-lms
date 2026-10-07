import { useState } from 'react'
import { Linking, Pressable, View } from 'react-native'
import { useRouter } from 'expo-router'
import { formatMYR } from '@hawary/shared'
import { fmtDays, localeFor, personName } from '@/lib/format'
import { useT } from '@/lib/i18n'
import { waLink, waNumber } from '@/lib/phone'
import {
  DEFAULT_TZ,
  useAcademyTimezone,
  useMyUnclosedSessions,
  useMyUpcomingSessions,
  useSetAppointmentStatus,
  type AppointmentRow,
} from '@/features/appointments/api'
import {
  fmtDayLong,
  fmtTime,
  today,
  ymdOf,
} from '@/features/appointments/calendar'
import { SessionSheet } from '@/features/appointments/SessionSheet'
import { usePendingEnrollmentCount } from '@/features/enrollment/api'
import { useAcademyQueue, type QueueRow } from '@/features/grading/api'
import { ALL_COURSES, useInvoiceStats } from '@/features/payments/api'
import { useMyInstructorRecord } from '@/features/profile/api'
import { useMyReportQueue } from '@/features/reports/api'
import { useScope } from '@/shell/scope'
import {
  Button,
  Card,
  Icon,
  IconButton,
  Row,
  Screen,
  Section,
  StatTile,
  T,
  space,
  useTheme,
} from '@/ui'

const daysSince = (iso: string | null): number | null =>
  iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) : null

const oldestWait = (rows: QueueRow[]): number | null => {
  const waits = rows.map((r) => daysSince(r.submittedAt)).filter((d) => d !== null)
  return waits.length > 0 ? Math.max(...(waits as number[])) : null
}

/**
 * Today — the instructor's home.
 *
 * It asks what the trainer dashboard on the web asks, *what is in front of
 * me*, and answers it for the next few hours rather than the next seven days:
 * today's sessions, each closable in one tap, with the student a tap away on
 * the phone or WhatsApp. Then what is still open from before (sessions nobody
 * closed), what is waiting to be marked, and which reports are waiting to be
 * checked — shown by how long they have **waited**, not when they arrived.
 *
 * An admin gets three more lines, in their own component so that a trainer's
 * phone never fires a money query (docs/money-is-admin-only.md).
 */
export default function TodayTab() {
  const { t, lang } = useT()
  const locale = localeFor(lang)
  const router = useRouter()
  const { academyId, isAdmin } = useScope()
  const { data: tz = DEFAULT_TZ } = useAcademyTimezone(academyId)
  const { data: me, isLoading: meLoading } = useMyInstructorRecord(academyId)
  const instructorId = me?.id ?? null

  const upcoming = useMyUpcomingSessions(academyId, instructorId, 7)
  const unclosed = useMyUnclosedSessions(academyId, instructorId)
  const assessments = useAcademyQueue('assessment', academyId)
  const assignments = useAcademyQueue('assignment', academyId)
  const reports = useMyReportQueue(academyId, instructorId)
  const [open, setOpen] = useState<AppointmentRow | null>(null)

  const todayYmd = today(tz)
  const sessions = upcoming.data ?? []
  const todays = sessions.filter((a) => ymdOf(a.starts_at, tz) === todayYmd)
  const later = sessions.filter((a) => ymdOf(a.starts_at, tz) !== todayYmd)
  const byDay = new Map<string, AppointmentRow[]>()
  for (const a of later) {
    const d = ymdOf(a.starts_at, tz)
    byDay.set(d, [...(byDay.get(d) ?? []), a])
  }

  const awaitingAssessments = (assessments.data ?? []).filter(
    (r) => r.status === 'submitted',
  )
  const awaitingAssignments = (assignments.data ?? []).filter(
    (r) => r.status === 'submitted',
  )

  function refresh() {
    void upcoming.refetch()
    void unclosed.refetch()
    void assessments.refetch()
    void assignments.refetch()
    void reports.refetch()
  }

  return (
    <Screen onRefresh={refresh} refreshing={upcoming.isRefetching}>
      {isAdmin && academyId ? <AdminLines academyId={academyId} /> : null}

      <Section title={t('m.today.sessions')}>
        {!meLoading && !instructorId ? (
          // The real case, not an edge: an admin who does not teach, or a
          // trainer whose record was never linked.
          <Card>
            <T muted>{t('m.today.no_instructor')}</T>
          </Card>
        ) : todays.length === 0 ? (
          <Card>
            <T muted>{t('m.today.none')}</T>
          </Card>
        ) : (
          todays.map((a) => (
            <TodaySession
              key={a.id}
              session={a}
              tz={tz}
              academyId={academyId}
              onOpen={() => setOpen(a)}
            />
          ))
        )}
      </Section>

      {/* Self-hiding, and the only place these can surface: a past session
          still marked Booked is one nobody said whether the student attended. */}
      {(unclosed.data ?? []).length > 0 ? (
        <Section title={t('m.today.attention')}>
          <Card flush>
            {(unclosed.data ?? []).map((a, i) => (
              <Row
                key={a.id}
                first={i === 0}
                icon="alert-circle"
                title={a.students?.full_name ?? t('common.unnamed')}
                subtitle={`${fmtDayLong(ymdOf(a.starts_at, tz), locale)} · ${fmtTime(a.starts_at, tz)}`}
                onPress={() => setOpen(a)}
              />
            ))}
          </Card>
        </Section>
      ) : null}

      <Section title={t('m.tab.marking')}>
        <Card flush>
          <Row
            first
            icon="clipboard"
            title={t('nav.assessments')}
            subtitle={
              awaitingAssessments.length > 0
                ? fmtDays(oldestWait(awaitingAssessments))
                : null
            }
            right={<T bold>{awaitingAssessments.length}</T>}
            onPress={() =>
              router.push({ pathname: '/marking', params: { kind: 'assessment' } } as never)
            }
          />
          <Row
            icon="edit-3"
            title={t('nav.assignments')}
            subtitle={
              awaitingAssignments.length > 0
                ? fmtDays(oldestWait(awaitingAssignments))
                : null
            }
            right={<T bold>{awaitingAssignments.length}</T>}
            onPress={() =>
              router.push({ pathname: '/marking', params: { kind: 'assignment' } } as never)
            }
          />
        </Card>
      </Section>

      <Section
        title={t('report.dash.staff.title')}
        action={{ label: t('learn.view_all'), onPress: () => router.push('/lpkc' as never) }}
      >
        <Card flush>
          {(reports.data ?? []).length === 0 ? (
            <T muted style={{ padding: space.lg }}>
              {t('report.dash.staff.empty')}
            </T>
          ) : (
            (reports.data ?? []).map((r, i) => (
              <Row
                key={r.id}
                first={i === 0}
                icon="file"
                title={personName(r.students?.full_name, r.students?.email) ?? t('common.unnamed')}
                subtitle={[r.title, r.courses?.title].filter(Boolean).join(' · ')}
                right={
                  <T v="small" muted>
                    {fmtDays(daysSince(r.submitted_at))}
                  </T>
                }
                onPress={() => router.push(`/lpkc/${r.id}` as never)}
              />
            ))
          )}
        </Card>
      </Section>

      {byDay.size > 0 ? (
        <Section
          title={t('appt.calendar.this_week')}
          action={{
            label: t('learn.view_all'),
            onPress: () => router.push('/appointments' as never),
          }}
        >
          {[...byDay.entries()].map(([day, list]) => (
            <View key={day} style={{ gap: space.sm }}>
              <T v="small" muted>
                {fmtDayLong(day, locale)}
              </T>
              <Card flush>
                {list.map((a, i) => (
                  <Row
                    key={a.id}
                    first={i === 0}
                    title={a.students?.full_name ?? t('common.unnamed')}
                    subtitle={fmtTime(a.starts_at, tz)}
                    onPress={() => setOpen(a)}
                  />
                ))}
              </Card>
            </View>
          ))}
        </Section>
      ) : null}

      <SessionSheet
        session={open}
        academyId={academyId}
        tz={tz}
        // Everything on this screen is the reader's own session.
        canAct
        onClose={() => setOpen(null)}
      />
    </Screen>
  )
}

/** One of today's sessions: who, when, and the four things done to it. */
function TodaySession({
  session: a,
  tz,
  academyId,
  onOpen,
}: {
  session: AppointmentRow
  tz: string
  academyId: string | null
  onOpen: () => void
}) {
  const { t, lang } = useT()
  const { c } = useTheme()
  const setStatus = useSetAppointmentStatus(academyId)
  const number = waNumber(a.students?.phone)
  const wa = waLink(
    a.students?.phone,
    t('appt.whatsapp.draft', {
      date: fmtDayLong(ymdOf(a.starts_at, tz), localeFor(lang)),
      time: fmtTime(a.starts_at, tz),
    }),
  )
  // A session cannot be closed before it has started.
  const started = Date.parse(a.starts_at) <= Date.now()

  return (
    <Card style={{ gap: space.md }}>
      <Pressable
        onPress={onOpen}
        style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}
      >
        <View
          style={{
            borderRadius: 8,
            backgroundColor: c.muted,
            paddingHorizontal: space.md,
            paddingVertical: space.sm,
          }}
        >
          <T bold>{fmtTime(a.starts_at, tz)}</T>
        </View>
        <View style={{ flex: 1 }}>
          <T style={{ fontWeight: '600' }} numberOfLines={1}>
            {a.students?.full_name ?? t('common.unnamed')}
          </T>
          {a.note ? (
            <T v="small" muted numberOfLines={2}>
              {a.note}
            </T>
          ) : null}
        </View>
        <Icon name="chevron-right" size={16} />
      </Pressable>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Button
          small
          style={{ flex: 1 }}
          icon="check"
          title={t('appt.action.complete')}
          disabled={!started || setStatus.isPending}
          onPress={() => setStatus.mutate({ id: a.id, status: 'completed' })}
        />
        <Button
          small
          style={{ flex: 1 }}
          variant="outline"
          title={t('appt.action.no_show')}
          disabled={!started || setStatus.isPending}
          onPress={() => setStatus.mutate({ id: a.id, status: 'no_show' })}
        />
        {number ? (
          <IconButton
            name="phone"
            label={t('m.today.call')}
            onPress={() => void Linking.openURL(`tel:+${number}`)}
          />
        ) : null}
        {wa ? (
          <IconButton
            name="message-circle"
            label={t('appt.whatsapp')}
            onPress={() => void Linking.openURL(wa)}
          />
        ) : null}
      </View>
    </Card>
  )
}

/**
 * The admin's part of Today. Its own component on purpose: hooks cannot be
 * skipped conditionally, so the only way a trainer's phone never asks for
 * `invoice_totals` is for the component that asks never to mount.
 */
function AdminLines({ academyId }: { academyId: string }) {
  const { t } = useT()
  const router = useRouter()
  const { data: stats } = useInvoiceStats(academyId, ALL_COURSES)
  const { data: requests = 0 } = usePendingEnrollmentCount(academyId)

  return (
    <View style={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', gap: space.md }}>
        <StatTile
          label={t('lacct.amount.outstanding')}
          value={formatMYR(stats?.outstanding ?? 0)}
          onPress={() => router.push('/payments' as never)}
        />
        <StatTile
          label={t('common.overdue')}
          value={formatMYR(stats?.overdue ?? 0)}
          tone={(stats?.overdue ?? 0) > 0 ? 'danger' : 'muted'}
          onPress={() =>
            router.push({ pathname: '/payments', params: { money: 'overdue' } } as never)
          }
        />
      </View>
      {requests > 0 ? (
        <Card flush>
          <Row
            first
            icon="user-plus"
            title={t('m.today.requests')}
            right={<T bold>{requests}</T>}
            onPress={() => router.push('/enrollments' as never)}
          />
        </Card>
      ) : null}
    </View>
  )
}
