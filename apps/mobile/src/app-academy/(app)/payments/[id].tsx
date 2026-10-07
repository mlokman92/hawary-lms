import { useState } from 'react'
import { Alert, Share, View } from 'react-native'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { formatMYR, ringgitToSen, senToRinggit } from '@hawary/shared'
import { useAuth } from '@/lib/auth'
import { WEB_ORIGIN } from '@/lib/env'
import { errorMessage } from '@/lib/errors'
import { fmtDate } from '@/lib/format'
import { useT } from '@/lib/i18n'
import { DEFAULT_TZ, useAcademyTimezone } from '@/features/appointments/api'
import { today, zonedInstant } from '@/features/appointments/calendar'
import {
  INVOICE_STATUS_LABEL,
  INVOICE_STATUS_VARIANT,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABEL,
  useCheckPayment,
  useInvoice,
  useRecordPayment,
  useSendPayLink,
  type InvoiceDetail,
  type PaymentMethod,
} from '@/features/payments/api'
import { hasReceipt, useInvoiceDocuments } from '@/features/payments/documents'
import { InvoiceBody } from '@/features/payments/InvoiceBody'
import { usePaymentSettings } from '@/features/settings/api'
import { AdminOnly } from '@/shell/AdminOnly'
import {
  Badge,
  Button,
  Card,
  DateField,
  ErrorBlock,
  Field,
  FormError,
  Input,
  Loading,
  Menu,
  Screen,
  Select,
  Sheet,
  T,
  space,
} from '@/ui'

export default function InvoiceScreen() {
  const { t } = useT()
  return (
    <>
      <Stack.Screen options={{ title: t('payments.table.invoice') }} />
      <AdminOnly>{(academyId) => <Invoice academyId={academyId} />}</AdminOnly>
    </>
  )
}

/**
 * One invoice, for an admin: what it says, then the three things done to one
 * from a phone — take a payment, send the pay link, hand over a copy.
 *
 * Voiding, editing a payment's note and changing part-payment terms are on the
 * web: they are corrections, made at a desk with the ledger open.
 */
function Invoice({ academyId }: { academyId: string }) {
  const { id = '' } = useLocalSearchParams<{ id: string }>()
  const { t } = useT()
  const router = useRouter()
  const { data: invoice, isLoading, error, refetch, isRefetching } = useInvoice(id)
  const { data: settings } = usePaymentSettings(academyId)
  const docs = useInvoiceDocuments(academyId)
  const check = useCheckPayment(academyId, id)
  const sendLink = useSendPayLink()
  const [recording, setRecording] = useState(false)

  if (isLoading) return <Loading />
  if (error || !invoice) {
    return <ErrorBlock error={error ?? new Error(t('payments.detail.not_found'))} />
  }

  const balance = invoice.total_sen - invoice.amount_paid_sen
  const open = ['issued', 'partially_paid', 'overdue'].includes(invoice.status)
  const payable = open && balance > 0
  // A link is only offered when it can actually be paid.
  const online = payable && !!invoice.pay_token && settings?.toyyibpay_enabled === true
  const link = `${WEB_ORIGIN}/pay/${invoice.pay_token}`

  async function onCheck() {
    try {
      const result = await check.mutateAsync(invoice!.pay_token!)
      Alert.alert(
        result.invoice_status === 'paid' || result.intent_status === 'succeeded'
          ? t('payments.pay_link.confirmed')
          : t('payments.pay_link.not_found_yet'),
      )
    } catch (e) {
      Alert.alert(errorMessage(e, t('payments.pay_link.error_check')))
    }
  }

  async function onEmail() {
    try {
      const result = await sendLink.mutateAsync(invoice!.id)
      Alert.alert(
        result.ok
          ? result.to
            ? t('payments.pay_link.sent_to', { email: result.to })
            : t('payments.pay_link.sent')
          : (result.message ?? t('payments.pay_link.send_failed')),
      )
    } catch (e) {
      Alert.alert(errorMessage(e, t('payments.pay_link.send_failed')))
    }
  }

  return (
    <Screen
      onRefresh={() => void refetch()}
      refreshing={isRefetching}
      footer={
        payable ? (
          <Button
            icon="plus"
            title={t('payments.record.title')}
            onPress={() => setRecording(true)}
          />
        ) : null
      }
    >
      <Stack.Screen
        options={{
          title: invoice.invoice_no,
          headerRight: () => (
            <Menu
              label={t('common.actions')}
              items={[
                {
                  label: t('doc.download.invoice'),
                  icon: 'file-text',
                  onPress: () => void docs.share('invoice', invoice),
                },
                ...(hasReceipt(invoice)
                  ? [
                      {
                        label: t('doc.download.receipt'),
                        icon: 'check-circle' as const,
                        onPress: () => void docs.share('receipt', invoice),
                      },
                    ]
                  : []),
                ...(invoice.student_id
                  ? [
                      {
                        label: t('appt.open_student'),
                        icon: 'user' as const,
                        onPress: () =>
                          router.push(`/students/${invoice.student_id}` as never),
                      },
                    ]
                  : []),
              ]}
            />
          ),
        }}
      />

      <View style={{ gap: 6 }}>
        <T v="title">{invoice.student?.full_name || invoice.invoice_no}</T>
        <Badge
          label={t(INVOICE_STATUS_LABEL[invoice.status])}
          variant={INVOICE_STATUS_VARIANT[invoice.status]}
        />
        <T v="small" muted>
          {[invoice.invoice_no, invoice.student?.student_no, invoice.course?.title]
            .filter(Boolean)
            .join(' · ')}
        </T>
        <T v="small" muted>
          {t('payments.detail.dates', {
            issued: fmtDate(invoice.issued_at ?? invoice.created_at),
            due: fmtDate(invoice.due_at),
          })}
        </T>
      </View>

      <InvoiceBody invoice={invoice} />
      <FormError error={docs.error} />

      {payable ? (
        <Card style={{ gap: space.md }}>
          <T v="heading">{t('payments.pay_link.title')}</T>
          {online ? (
            <>
              <T v="small" muted>
                {t('payments.pay_link.intro')}
              </T>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                <Button
                  small
                  icon="share-2"
                  title={t('m.staff.share_link')}
                  onPress={() =>
                    void Share.share({ message: `${invoice.invoice_no} — ${link}` })
                  }
                />
                <Button
                  small
                  variant="outline"
                  icon="mail"
                  title={t('payments.pay_link.email')}
                  loading={sendLink.isPending}
                  onPress={() => void onEmail()}
                />
                <Button
                  small
                  variant="outline"
                  icon="refresh-cw"
                  title={
                    check.isPending
                      ? t('payments.pay_link.checking')
                      : t('payments.pay_link.check')
                  }
                  loading={check.isPending}
                  onPress={() => void onCheck()}
                />
              </View>
            </>
          ) : (
            <T v="small" muted>
              {t('m.staff.online_off')}
            </T>
          )}
        </Card>
      ) : null}

      <RecordPayment
        academyId={academyId}
        invoice={invoice}
        visible={recording}
        onClose={() => setRecording(false)}
      />
    </Screen>
  )
}

function RecordPayment({
  academyId,
  invoice,
  visible,
  onClose,
}: {
  academyId: string
  invoice: InvoiceDetail
  visible: boolean
  onClose: () => void
}) {
  const { t } = useT()
  const { user } = useAuth()
  const { data: tz = DEFAULT_TZ } = useAcademyTimezone(academyId)
  const record = useRecordPayment(academyId)
  const balance = invoice.total_sen - invoice.amount_paid_sen
  const [amount, setAmount] = useState(senToRinggit(balance))
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [paidOn, setPaidOn] = useState<string | null>(today(tz))
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    const sen = ringgitToSen(amount)
    if (sen <= 0) return setError(t('payments.record.error_amount'))
    setError(null)
    try {
      await record.mutateAsync({
        invoiceId: invoice.id,
        studentId: invoice.student_id,
        amountSen: sen,
        method,
        // Noon in the academy's zone: a calendar day, stored as an instant
        // that cannot slip to the day before or after in any reader's zone.
        paidAt: zonedInstant(paidOn ?? today(tz), '12:00', tz).toISOString(),
        note,
        createdBy: user?.id ?? null,
      })
      setNote('')
      onClose()
    } catch (e) {
      setError(errorMessage(e, t('common.error')))
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose} title={t('payments.record.title')}>
      <T v="small" muted>
        {t('payments.record.balance_due', { amount: formatMYR(balance) })}
      </T>
      <Field label={t('payments.record.amount')}>
        <Input value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
      </Field>
      <Field label={t('payments.record.method')}>
        <Select<PaymentMethod>
          value={method}
          onChange={setMethod}
          title={t('payments.record.method')}
          options={PAYMENT_METHODS.map((m) => ({
            value: m,
            label: t(PAYMENT_METHOD_LABEL[m]),
          }))}
        />
      </Field>
      <Field label={t('m.staff.paid_on')}>
        <DateField value={paidOn} onChange={setPaidOn} maximumDate={new Date()} />
      </Field>
      <Field label={t('payments.record.note')}>
        <Input
          value={note}
          onChangeText={setNote}
          placeholder={t('payments.record.note_placeholder')}
        />
      </Field>
      <FormError error={error} />
      <Button
        title={record.isPending ? t('payments.record.submitting') : t('payments.record.title')}
        loading={record.isPending}
        onPress={() => void submit()}
      />
    </Sheet>
  )
}
