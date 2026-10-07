import { useState } from 'react'
import { Stack, useRouter } from 'expo-router'
import { formatMYR } from '@hawary/shared'
import { fmtDate } from '@/lib/format'
import { useT } from '@/lib/i18n'
import {
  PAGE_SIZE,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_VARIANT,
  usePaymentLogPage,
  usePaymentLogTotals,
  type PaymentLogFilters,
} from '@/features/payments/api'
import { AdminOnly } from '@/shell/AdminOnly'
import {
  Badge,
  Card,
  Empty,
  ErrorBlock,
  Loading,
  Row,
  Screen,
  SearchInput,
  T,
} from '@/ui'
import { Pager } from '@/ui/Pager'

export default function PaymentLogScreen() {
  const { t } = useT()
  return (
    <>
      <Stack.Screen options={{ title: t('payments.log.title') }} />
      <AdminOnly>{(academyId) => <Log academyId={academyId} />}</AdminOnly>
    </>
  )
}

/**
 * The money-in ledger, newest first: every payment received, read-only. The
 * search spans student, invoice, reference and note, on the server — the same
 * `payment_log_page` RPC the web log uses. Editing a note and exporting a CSV
 * are on the web.
 */
function Log({ academyId }: { academyId: string }) {
  const { t, tn } = useT()
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const filters: PaymentLogFilters = { search, status: null }
  const { data, isLoading, error, refetch, isRefetching } = usePaymentLogPage(
    academyId,
    filters,
    'recorded',
    page,
  )
  const { data: totals } = usePaymentLogTotals(academyId, filters)
  const rows = data ?? []

  return (
    <Screen onRefresh={() => void refetch()} refreshing={isRefetching}>
      <SearchInput
        value={search}
        onChangeText={(v) => {
          setSearch(v)
          setPage(1)
        }}
        placeholder={t('payments.log.search_placeholder')}
      />
      {totals ? (
        <T v="small" muted>
          {tn('payments.log.summary', totals.total, {
            amount: formatMYR(totals.receivedSen),
          })}
        </T>
      ) : null}

      {isLoading ? (
        <Loading />
      ) : error ? (
        <ErrorBlock error={error} onRetry={() => void refetch()} />
      ) : rows.length === 0 ? (
        <Empty
          icon="list"
          title={search ? t('payments.log.no_match') : t('payments.log.empty')}
        />
      ) : (
        <Card flush>
          {rows.map((p, i) => (
            <Row
              key={p.id}
              first={i === 0}
              title={`${formatMYR(p.amount_sen)} · ${p.student_full_name ?? t('common.unnamed')}`}
              subtitle={[
                fmtDate(p.paid_at ?? p.created_at),
                t(PAYMENT_METHOD_LABEL[p.method]),
                p.invoice_no,
                p.note,
              ]
                .filter(Boolean)
                .join(' · ')}
              right={
                p.status === 'succeeded' ? null : (
                  <Badge
                    label={t(PAYMENT_STATUS_LABEL[p.status])}
                    variant={PAYMENT_STATUS_VARIANT[p.status]}
                  />
                )
              }
              onPress={
                p.invoice_id
                  ? () => router.push(`/payments/${p.invoice_id}` as never)
                  : undefined
              }
            />
          ))}
        </Card>
      )}
      <Pager
        page={page}
        pageSize={PAGE_SIZE}
        total={totals?.total ?? 0}
        onChange={setPage}
      />
    </Screen>
  )
}
