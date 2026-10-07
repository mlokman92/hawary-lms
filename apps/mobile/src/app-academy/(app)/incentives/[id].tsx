import { View } from 'react-native'
import { Stack, useLocalSearchParams } from 'expo-router'
import { bankName, formatMYR } from '@hawary/shared'
import { useT } from '@/lib/i18n'
import { useIncentiveBatch, useIncentivePayouts } from '@/features/incentives/api'
import { BATCH_STATUS_META, PAYOUT_STATUS_META } from '@/features/incentives/status'
import { AdminOnly } from '@/shell/AdminOnly'
import {
  Badge,
  Card,
  Empty,
  ErrorBlock,
  Loading,
  Row,
  Screen,
  T,
  space,
} from '@/ui'

export default function IncentiveBatchScreen() {
  const { t } = useT()
  return (
    <>
      <Stack.Screen options={{ title: t('incentives.title') }} />
      <AdminOnly>{() => <Batch />}</AdminOnly>
    </>
  )
}

/**
 * One batch and its transfers, read-only: who was paid, to which account
 * (masked — the full number exists to be sent, never displayed), and what came
 * back. Refresh re-reads our own rows; reconciling against Billplz, resuming
 * and sending are web actions.
 */
function Batch() {
  const { id = '' } = useLocalSearchParams<{ id: string }>()
  const { t, tn } = useT()
  const { data: batch, isLoading, error } = useIncentiveBatch(id)
  const { data: payouts, refetch, isRefetching } = useIncentivePayouts(id)

  if (isLoading) return <Loading />
  if (error || !batch) {
    return <ErrorBlock error={error ?? new Error(t('incentives.not_found'))} />
  }

  const rows = payouts ?? []
  const meta = BATCH_STATUS_META[batch.status]

  return (
    <Screen onRefresh={() => void refetch()} refreshing={isRefetching}>
      <View style={{ gap: 6 }}>
        <T v="title">{batch.title}</T>
        <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
          <Badge label={t(meta.labelKey)} variant={meta.variant} />
          {/* Which account a batch ran against decides whether the transfers
              were money at all, and it is readable nowhere else. */}
          {batch.is_sandbox ? (
            <Badge label={t('incentives.sandbox')} variant="outline" />
          ) : null}
        </View>
        <T v="small" muted>
          {t('incentives.batch.per_student', { amount: formatMYR(batch.amount_sen) })}
          {' · '}
          {tn('incentives.recipients', rows.length)}
        </T>
        {batch.description ? <T muted>{batch.description}</T> : null}
      </View>

      {rows.length === 0 ? (
        <Empty icon="gift" title={t('incentives.error.no_recipients')} />
      ) : (
        <Card flush>
          {rows.map((p, i) => (
            <Row
              key={p.id}
              first={i === 0}
              title={p.students?.full_name ?? t('common.unnamed')}
              subtitle={[
                p.students?.student_no,
                p.bank_code ? bankName(p.bank_code) : null,
                p.bank_account_last4 ? `••••${p.bank_account_last4}` : null,
                p.failure_reason,
              ]
                .filter(Boolean)
                .join(' · ')}
              right={
                <Badge
                  label={t(PAYOUT_STATUS_META[p.status].labelKey)}
                  variant={PAYOUT_STATUS_META[p.status].variant}
                />
              }
            />
          ))}
        </Card>
      )}
    </Screen>
  )
}
