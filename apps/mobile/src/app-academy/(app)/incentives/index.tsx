import { Stack, useRouter } from 'expo-router'
import { formatMYR } from '@hawary/shared'
import { fmtDate } from '@/lib/format'
import { useT } from '@/lib/i18n'
import { useIncentiveBatches } from '@/features/incentives/api'
import { BATCH_STATUS_META } from '@/features/incentives/status'
import { AdminOnly } from '@/shell/AdminOnly'
import { Badge, Card, Empty, ErrorBlock, Loading, Row, Screen } from '@/ui'

export default function IncentivesScreen() {
  const { t } = useT()
  return (
    <>
      <Stack.Screen options={{ title: t('incentives.title') }} />
      <AdminOnly>{(academyId) => <Batches academyId={academyId} />}</AdminOnly>
    </>
  )
}

/**
 * Incentive batches, to look at. **Nothing here sends money.** Creating a
 * batch, picking recipients and disbursing are on the web on purpose: a
 * disbursement is hundreds of sequential transfers that must be watched,
 * resumed and reconciled, and a duplicate transfer cannot be undone
 * (docs/billplz-incentives.md). A phone is for checking how one went.
 */
function Batches({ academyId }: { academyId: string }) {
  const { t, tn } = useT()
  const router = useRouter()
  const { data, isLoading, error, refetch, isRefetching } =
    useIncentiveBatches(academyId)

  return (
    <Screen onRefresh={() => void refetch()} refreshing={isRefetching}>
      {isLoading ? (
        <Loading />
      ) : error ? (
        <ErrorBlock error={error} onRetry={() => void refetch()} />
      ) : (data ?? []).length === 0 ? (
        <Empty icon="gift" title={t('incentives.empty')} />
      ) : (
        <Card flush>
          {(data ?? []).map((b, i) => (
            <Row
              key={b.id}
              first={i === 0}
              title={b.title}
              subtitle={[
                t('incentives.batch.per_student', { amount: formatMYR(b.amount_sen) }),
                tn('incentives.recipients', b.recipients),
                fmtDate(b.created_at),
              ].join(' · ')}
              right={
                <Badge
                  label={t(BATCH_STATUS_META[b.status].labelKey)}
                  variant={BATCH_STATUS_META[b.status].variant}
                />
              }
              onPress={() => router.push(`/incentives/${b.id}` as never)}
            />
          ))}
        </Card>
      )}
    </Screen>
  )
}
