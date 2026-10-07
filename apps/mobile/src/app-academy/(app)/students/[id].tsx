import { useState } from 'react'
import { Linking, View } from 'react-native'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { formatMYR } from '@hawary/shared'
import { errorMessage } from '@/lib/errors'
import { fmtDate } from '@/lib/format'
import { useT, type TKey } from '@/lib/i18n'
import { waLink, waNumber } from '@/lib/phone'
import { useCourses } from '@/features/courses/api'
import { useLinkStudentAccount } from '@/features/invitations/api'
import { sendRecordInvite } from '@/features/invitations/autoInvite'
import {
  INVOICE_STATUS_LABEL,
  INVOICE_STATUS_VARIANT,
  invoiceTotals,
  useStudentInvoices,
} from '@/features/payments/api'
import {
  useEnrollStudent,
  useStudent,
  useStudentEnrollments,
  useUnenroll,
} from '@/features/students/api'
import { STATUS_META } from '@/features/students/status'
import { StudentForm } from '@/features/students/StudentForm'
import { BankAccountCard } from '@/screens/Account'
import { useScope } from '@/shell/scope'
import {
  Avatar,
  Badge,
  Button,
  Card,
  confirm,
  ErrorBlock,
  Field,
  FormError,
  IconButton,
  Input,
  Loading,
  Menu,
  notify,
  Row,
  Screen,
  Section,
  Select,
  Sheet,
  space,
  T,
} from '@/ui'

const ENROLLMENT_LABEL: Record<string, TKey> = {
  active: 'students.enrollment.active',
  pending: 'students.enrollment.pending',
  completed: 'students.enrollment.completed',
  dropped: 'students.enrollment.dropped',
  cancelled: 'students.enrollment.cancelled',
}

function Fact({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <View style={{ flexDirection: 'row', gap: space.md }}>
      <T muted style={{ width: 120 }}>
        {label}
      </T>
      <T style={{ flex: 1 }}>{value}</T>
    </View>
  )
}

/**
 * One student: who they are, how to reach them, what they are enrolled in —
 * and, for an admin only, what they owe and where an incentive would be paid.
 *
 * The money and the bank account are their own components so a trainer's
 * phone never asks for either (docs/money-is-admin-only.md): RLS would return
 * nothing, and "nothing" on a billing card reads as "never invoiced".
 */
export default function StudentScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>()
  const { t } = useT()
  const { academyId, isAdmin } = useScope()
  const { data: student, isLoading, error, refetch, isRefetching } = useStudent(id)
  const { data: enrollments } = useStudentEnrollments(id)
  const [editing, setEditing] = useState(false)
  const [enrolling, setEnrolling] = useState(false)
  const [linking, setLinking] = useState(false)

  if (isLoading) return <Loading />
  if (error || !student || !academyId) {
    return <ErrorBlock error={error ?? new Error(t('students.not_found'))} />
  }

  const name = student.full_name || student.email || t('students.unnamed')
  const number = waNumber(student.phone)
  const wa = waLink(student.phone)

  async function resend() {
    const ok = await sendRecordInvite('student', student!.id)
    notify(ok ? t('payments.pay_link.sent') : t('students.invite.send_failed'))
  }

  return (
    <Screen onRefresh={() => void refetch()} refreshing={isRefetching}>
      <Stack.Screen
        options={{
          title: t('common.student'),
          headerRight: () => (
            <Menu
              label={t('common.actions')}
              items={[
                {
                  label: t('students.action.edit_profile'),
                  icon: 'edit-2',
                  onPress: () => setEditing(true),
                },
                // An unclaimed record with an address can be invited again; a
                // claimed one has nothing left to invite.
                ...(!student.user_id && student.email
                  ? [
                      {
                        label: t('invite.action.resend'),
                        icon: 'mail' as const,
                        onPress: () => void resend(),
                      },
                    ]
                  : []),
                ...(isAdmin && !student.user_id
                  ? [
                      {
                        label: t('students.account.link_existing'),
                        icon: 'link' as const,
                        onPress: () => setLinking(true),
                      },
                    ]
                  : []),
              ]}
            />
          ),
        }}
      />

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <Avatar uri={student.avatar_url} name={student.full_name} email={student.email} size={56} />
        <View style={{ flex: 1, gap: 2 }}>
          <T v="title" numberOfLines={2}>
            {name}
          </T>
          <T v="small" muted>
            {t('students.member_since', {
              date: fmtDate(student.created_at),
              no: student.student_no,
            })}
          </T>
          <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
            <Badge
              label={t(STATUS_META[student.status].labelKey)}
              variant={STATUS_META[student.status].variant}
            />
            {student.user_id ? (
              <Badge label={t('students.account.linked')} variant="outline" />
            ) : null}
          </View>
        </View>
      </View>

      {/* Absent, not disabled, when the number cannot be dialled. */}
      {number ? (
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Button
            style={{ flex: 1 }}
            variant="outline"
            icon="phone"
            title={t('m.today.call')}
            onPress={() => void Linking.openURL(`tel:+${number}`)}
          />
          {wa ? (
            <Button
              style={{ flex: 1 }}
              variant="outline"
              icon="message-circle"
              title={t('appt.whatsapp')}
              onPress={() => void Linking.openURL(wa)}
            />
          ) : null}
        </View>
      ) : null}

      <Card style={{ gap: space.sm }}>
        <T v="heading">{t('students.personal.title')}</T>
        <Fact label={t('common.email')} value={student.email} />
        <Fact label={t('common.phone')} value={student.phone} />
        <Fact label={t('students.field.ic')} value={student.ic_number} />
        <Fact
          label={t('students.field.gender')}
          value={
            student.gender === 'male'
              ? t('students.gender.male')
              : student.gender === 'female'
                ? t('students.gender.female')
                : null
          }
        />
        <Fact
          label={t('students.field.dob')}
          value={student.date_of_birth ? fmtDate(student.date_of_birth) : null}
        />
        <Fact label={t('students.field.organization')} value={student.organization} />
        <Fact label={t('students.field.address')} value={student.address} />
      </Card>

      <Section
        title={t('students.enrolled.title')}
        action={{ label: t('students.enrolled.add'), onPress: () => setEnrolling(true) }}
      >
        <Enrollments
          academyId={academyId}
          studentId={student.id}
          rows={enrollments ?? []}
        />
      </Section>

      {isAdmin ? (
        <>
          <AdminBilling academyId={academyId} studentId={student.id} />
          <BankAccountCard academyId={academyId} studentId={student.id} canEdit={false} />
        </>
      ) : null}

      <StudentForm
        academyId={academyId}
        student={student}
        visible={editing}
        onClose={() => setEditing(false)}
      />
      <EnrolSheet
        academyId={academyId}
        studentId={student.id}
        taken={(enrollments ?? []).map((e) => e.course_id)}
        visible={enrolling}
        onClose={() => setEnrolling(false)}
      />
      <LinkSheet
        academyId={academyId}
        studentId={student.id}
        visible={linking}
        onClose={() => setLinking(false)}
      />
    </Screen>
  )
}

function Enrollments({
  academyId,
  studentId,
  rows,
}: {
  academyId: string
  studentId: string
  rows: {
    id: string
    status: string
    courses: { id: string; title: string } | null
  }[]
}) {
  const { t } = useT()
  const unenroll = useUnenroll(academyId, studentId)

  async function remove(id: string, title: string) {
    const ok = await confirm({
      title: t('students.enrolled.remove'),
      message: title,
      confirmLabel: t('common.remove'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    })
    if (ok) unenroll.mutate(id)
  }

  return (
    <Card flush>
      {rows.length === 0 ? (
        <T muted style={{ padding: space.lg }}>
          {t('students.enrolled.empty')}
        </T>
      ) : (
        rows.map((e, i) => (
          <Row
            key={e.id}
            first={i === 0}
            title={e.courses?.title ?? t('common.untitled')}
            subtitle={t(ENROLLMENT_LABEL[e.status] ?? 'students.enrollment.active')}
            right={
              <IconButton
                name="x"
                label={t('students.enrolled.remove')}
                onPress={() => void remove(e.id, e.courses?.title ?? '')}
              />
            }
          />
        ))
      )}
    </Card>
  )
}

function AdminBilling({ academyId, studentId }: { academyId: string; studentId: string }) {
  const { t } = useT()
  const router = useRouter()
  const { data } = useStudentInvoices(academyId, studentId)
  const invoices = data ?? []
  const totals = invoiceTotals(invoices)
  return (
    <Section title={t('students.billing.title')}>
      <Card flush>
        {invoices.length === 0 ? (
          <T muted style={{ padding: space.lg }}>
            {t('students.billing.empty')}
          </T>
        ) : (
          <>
            <T v="small" muted style={{ padding: space.lg, paddingBottom: 0 }}>
              {t('students.billing.paid')}: {formatMYR(totals.paid)} ·{' '}
              {t('students.billing.outstanding')}: {formatMYR(totals.outstanding)}
            </T>
            {invoices.map((inv, i) => (
              <Row
                key={inv.id}
                first={i === 0}
                title={inv.invoice_no}
                subtitle={[formatMYR(inv.total_sen), inv.course?.title]
                  .filter(Boolean)
                  .join(' · ')}
                right={
                  <Badge
                    label={t(INVOICE_STATUS_LABEL[inv.status])}
                    variant={INVOICE_STATUS_VARIANT[inv.status]}
                  />
                }
                onPress={() => router.push(`/payments/${inv.id}` as never)}
              />
            ))}
          </>
        )}
      </Card>
    </Section>
  )
}

function EnrolSheet({
  academyId,
  studentId,
  taken,
  visible,
  onClose,
}: {
  academyId: string
  studentId: string
  taken: string[]
  visible: boolean
  onClose: () => void
}) {
  const { t } = useT()
  const { data: courses } = useCourses(academyId)
  const enroll = useEnrollStudent(academyId, studentId)
  const [courseId, setCourseId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const options = (courses ?? [])
    .filter((c) => c.status !== 'archived' && !taken.includes(c.id))
    .map((c) => ({ value: c.id, label: c.title }))

  async function submit() {
    if (!courseId) return setError(t('students.enroll.required'))
    setError(null)
    try {
      await enroll.mutateAsync(courseId)
      setCourseId(null)
      onClose()
    } catch (e) {
      setError(errorMessage(e, t('common.error')))
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose} title={t('students.enroll.title')}>
      {options.length === 0 ? (
        <T muted>{t('students.enroll.none_available')}</T>
      ) : (
        <>
          <Field label={t('common.course')}>
            <Select
              value={courseId}
              options={options}
              onChange={setCourseId}
              placeholder={t('students.enroll.select_course')}
              title={t('common.course')}
            />
          </Field>
          <FormError error={error} />
          <Button
            title={enroll.isPending ? t('students.enroll.busy') : t('students.enroll.submit')}
            loading={enroll.isPending}
            onPress={() => void submit()}
          />
        </>
      )}
    </Sheet>
  )
}

function LinkSheet({
  academyId,
  studentId,
  visible,
  onClose,
}: {
  academyId: string
  studentId: string
  visible: boolean
  onClose: () => void
}) {
  const { t } = useT()
  const link = useLinkStudentAccount(academyId)
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!email.trim()) return setError(t('invite.link.error.email_required'))
    setError(null)
    try {
      await link.mutateAsync({ studentId, email: email.trim() })
      setEmail('')
      onClose()
    } catch (e) {
      setError(errorMessage(e, t('invite.link.error.failed')))
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose} title={t('invite.link.title')}>
      <T v="small" muted>
        {t('invite.link.description.student')}
      </T>
      <Field label={t('invite.link.email_label')}>
        <Input
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder={t('invite.link.email_placeholder')}
        />
      </Field>
      <FormError error={error} />
      <Button
        title={link.isPending ? t('invite.link.linking') : t('invite.link.submit')}
        loading={link.isPending}
        onPress={() => void submit()}
      />
    </Sheet>
  )
}
