import { View } from 'react-native'
import { Stack, useLocalSearchParams } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import { WEB_ORIGIN } from '@/lib/env'
import { fmtDate } from '@/lib/format'
import { useT } from '@/lib/i18n'
import { INVOICE_STATUS_KEY, useMyInvoice } from '@/features/learn/billing'
import { INVOICE_STATUS_VARIANT } from '@/features/payments/api'
import { hasReceipt, useInvoiceDocuments } from '@/features/payments/documents'
import { InvoiceBody } from '@/features/payments/InvoiceBody'
import { useScope } from '@/shell/scope'
import { Badge, Button, ErrorBlock, FormError, Loading, Screen, T, space } from '@/ui'

/**
 * One of the student's own invoices. Read-only, plus the two things a student
 * can do with a bill: pay it, and keep a copy.
 *
 * **Pay online opens the web pay page** (`/pay/<token>`) in the browser sheet
 * rather than rebuilding it here. That page already does part payment, the FPX
 * surcharge notice and the hand-off to ToyyibPay, and it is the page the
 * emailed pay link opens — one payment flow, not two. When the sheet closes the
 * invoice is re-read, since settlement is reconciled on the server
 * (docs/toyyibpay-payments.md).
 */
export default function InvoiceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { t } = useT()
  const { academyId } = useScope()
  const { data: invoice, isLoading, error, refetch, isRefetching } = useMyInvoice(id)
  const docs = useInvoiceDocuments(academyId)

  if (isLoading) return <Loading />
  if (error || !invoice) {
    return (
      <ErrorBlock error={error ?? new Error(t('lacct.invoice.not_available'))} />
    )
  }

  const balance = invoice.total_sen - invoice.amount_paid_sen
  const payable =
    !!invoice.pay_token &&
    balance > 0 &&
    ['issued', 'partially_paid', 'overdue'].includes(invoice.status)

  async function pay() {
    await WebBrowser.openBrowserAsync(`${WEB_ORIGIN}/pay/${invoice!.pay_token}`)
    void refetch()
  }

  return (
    <Screen
      onRefresh={() => void refetch()}
      refreshing={isRefetching}
      footer={
        payable ? (
          <Button
            icon="external-link"
            title={t('lacct.invoice.pay_online')}
            onPress={() => void pay()}
          />
        ) : null
      }
    >
      <Stack.Screen options={{ title: invoice.invoice_no }} />
      <View style={{ gap: 6 }}>
        <T v="title">{invoice.invoice_no}</T>
        <Badge
          label={t(INVOICE_STATUS_KEY[invoice.status])}
          variant={INVOICE_STATUS_VARIANT[invoice.status]}
        />
        {invoice.course ? (
          <T v="small" muted>
            {t('lacct.invoice.course', { title: invoice.course.title })}
          </T>
        ) : null}
        <T v="small" muted>
          {t('lacct.invoice.dates', {
            issued: fmtDate(invoice.issued_at ?? invoice.created_at),
            due: fmtDate(invoice.due_at),
          })}
        </T>
      </View>

      <InvoiceBody invoice={invoice} />

      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Button
          style={{ flex: 1 }}
          variant="outline"
          icon="file-text"
          title={t('doc.download.invoice')}
          loading={docs.busy === `invoice:${invoice.id}`}
          onPress={() => void docs.share('invoice', invoice)}
        />
        {hasReceipt(invoice) ? (
          <Button
            style={{ flex: 1 }}
            variant="outline"
            icon="check-circle"
            title={t('doc.download.receipt')}
            loading={docs.busy === `receipt:${invoice.id}`}
            onPress={() => void docs.share('receipt', invoice)}
          />
        ) : null}
      </View>
      <FormError error={docs.error} />
    </Screen>
  )
}
