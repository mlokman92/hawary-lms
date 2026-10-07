import { View } from 'react-native'
import { Stack, useRouter } from 'expo-router'
import { formatMYR } from '@hawary/shared'
import { fmtDate } from '@/lib/format'
import { useT } from '@/lib/i18n'
import { useMyPayouts } from '@/features/incentives/learnApi'
import { PAYOUT_STATUS_META } from '@/features/incentives/status'
import { INVOICE_STATUS_KEY, useMyInvoices } from '@/features/learn/billing'
import { LearnerGate } from '@/features/learn/context'
import { INVOICE_STATUS_VARIANT } from '@/features/payments/api'
import {
  Badge,
  Card,
  Empty,
  ErrorBlock,
  Loading,
  Row,
  Screen,
  Section,
  StatTile,
  space,
} from '@/ui'

export default function BillingScreen() {
  const { t } = useT()
  return (
    <>
      <Stack.Screen options={{ title: t('lacct.billing.title') }} />
      <LearnerGate>
        {({ academyId, studentId }) => (
          <Billing academyId={academyId} studentId={studentId} />
        )}
      </LearnerGate>
    </>
  )
}

/**
 * The student's own bills, and any incentive payouts they have received.
 * Drafts are left out — an unissued invoice is not a bill yet.
 */
function Billing({ academyId, studentId }: { academyId: string; studentId: string }) {
  const { t } = useT()
  const router = useRouter()
  const { rows, totals, isLoading, error, refetch, isRefetching } = useMyInvoices(
    academyId,
    studentId,
  )
  const { data: payouts } = useMyPayouts(academyId, studentId)

  return (
    <Screen onRefresh={() => void refetch()} refreshing={isRefetching}>
      <View style={{ flexDirection: 'row', gap: space.md }}>
        <StatTile label={t('lacct.amount.paid')} value={formatMYR(totals.paid)} />
        <StatTile
          label={t('lacct.amount.outstanding')}
          value={formatMYR(totals.outstanding)}
          tone={totals.outstanding > 0 ? 'warning' : undefined}
        />
      </View>

      {isLoading ? (
        <Loading />
      ) : error ? (
        <ErrorBlock error={error} onRetry={() => void refetch()} />
      ) : rows.length === 0 ? (
        <Empty icon="file-text" title={t('lacct.billing.empty')} />
      ) : (
        <Card flush>
          {rows.map((inv, i) => (
            <Row
              key={inv.id}
              first={i === 0}
              title={inv.invoice_no}
              subtitle={[
                formatMYR(inv.total_sen),
                inv.course?.title,
                inv.due_at ? t('learn.meta.due', { date: fmtDate(inv.due_at) }) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
              right={
                <Badge
                  label={t(INVOICE_STATUS_KEY[inv.status])}
                  variant={INVOICE_STATUS_VARIANT[inv.status]}
                />
              }
              onPress={() => router.push(`/billing/${inv.id}` as never)}
            />
          ))}
        </Card>
      )}

      {/* Only when there is one: a student whose academy runs no incentives
          should not be told the feature exists. */}
      {payouts && payouts.length > 0 ? (
        <Section title={t('incentives.learn.payouts')}>
          <Card flush>
            {payouts.map((p, i) => (
              <Row
                key={p.id}
                first={i === 0}
                title={p.batch?.title ?? t('common.untitled')}
                subtitle={`${formatMYR(p.amount_sen)} · ${fmtDate(
                  p.completed_at ?? p.sent_at ?? p.created_at,
                )}`}
                right={
                  <Badge
                    label={t(PAYOUT_STATUS_META[p.status].labelKey)}
                    variant={PAYOUT_STATUS_META[p.status].variant}
                  />
                }
              />
            ))}
          </Card>
        </Section>
      ) : null}
    </Screen>
  )
}
