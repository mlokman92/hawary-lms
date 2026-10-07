import { View } from 'react-native'
import { formatMYR } from '@hawary/shared'
import { fmtDate } from '@/lib/format'
import { useT } from '@/lib/i18n'
import { PAYMENT_METHOD_LABEL, type InvoiceDetail } from '@/features/payments/api'
import { Card, Divider, T, space } from '@/ui'

function Line({
  label,
  value,
  strong,
}: {
  label: string
  value: string
  strong?: boolean
}) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md }}>
      <T muted={!strong} style={strong ? { fontWeight: '600' } : null}>
        {label}
      </T>
      <T style={{ fontWeight: strong ? '600' : '400', fontVariant: ['tabular-nums'] }}>
        {value}
      </T>
    </View>
  )
}

/**
 * The three blocks every invoice screen shows — items, totals, payments — for
 * the student's own view and the admin's. Read-only: whatever a reader may DO
 * to an invoice sits around this, on the screen that mounts it.
 */
export function InvoiceBody({ invoice }: { invoice: InvoiceDetail }) {
  const { t } = useT()
  const balance = invoice.total_sen - invoice.amount_paid_sen
  return (
    <>
      <Card style={{ gap: space.md }}>
        <T v="heading">{t('lacct.invoice.items')}</T>
        {invoice.items.length === 0 ? (
          <T muted>{t('lacct.invoice.no_items')}</T>
        ) : (
          invoice.items.map((it) => (
            <View key={it.id} style={{ flexDirection: 'row', gap: space.md }}>
              <View style={{ flex: 1 }}>
                <T>{it.description}</T>
                <T v="small" muted>
                  {it.quantity} × {formatMYR(it.unit_price_sen)}
                </T>
              </View>
              <T style={{ fontVariant: ['tabular-nums'] }}>{formatMYR(it.amount_sen)}</T>
            </View>
          ))
        )}
        {/* The note is usually addressed to the student — it is the one place
            an academy explains a charge. */}
        {invoice.notes ? (
          <T v="small" muted>
            {invoice.notes}
          </T>
        ) : null}
      </Card>

      <Card style={{ gap: space.sm }}>
        <Line label={t('lacct.amount.subtotal')} value={formatMYR(invoice.subtotal_sen)} />
        <Line label={t('lacct.amount.tax')} value={formatMYR(invoice.tax_sen)} />
        <Line label={t('common.total')} value={formatMYR(invoice.total_sen)} strong />
        <Divider />
        <Line label={t('lacct.amount.paid')} value={formatMYR(invoice.amount_paid_sen)} />
        <Line label={t('lacct.amount.balance')} value={formatMYR(balance)} strong />
      </Card>

      <Card style={{ gap: space.md }}>
        <T v="heading">{t('lacct.invoice.payments')}</T>
        {invoice.payments.length === 0 ? (
          <T muted>{t('lacct.invoice.no_payments')}</T>
        ) : (
          invoice.payments.map((p) => (
            <View key={p.id} style={{ flexDirection: 'row', gap: space.md }}>
              <View style={{ flex: 1 }}>
                <T style={{ fontWeight: '500' }}>{formatMYR(p.amount_sen)}</T>
                <T v="small" muted>
                  {t(PAYMENT_METHOD_LABEL[p.method])}
                  {p.note ? ` · ${p.note}` : ''}
                </T>
              </View>
              <T v="small" muted>
                {fmtDate(p.paid_at ?? p.created_at)}
              </T>
            </View>
          ))
        )}
      </Card>
    </>
  )
}
