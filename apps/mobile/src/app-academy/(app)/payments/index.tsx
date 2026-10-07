import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { formatMYR } from '@hawary/shared'
import { fmtDate } from '@/lib/format'
import { useT } from '@/lib/i18n'
import {
  ALL_COURSES,
  INVOICE_STATUS_LABEL,
  INVOICE_STATUS_VARIANT,
  PAGE_SIZE,
  useInvoicePage,
  useInvoiceStats,
  type MoneyFilter,
} from '@/features/payments/api'
import { AdminOnly } from '@/shell/AdminOnly'
import {
  Badge,
  Card,
  Chips,
  Empty,
  ErrorBlock,
  IconButton,
  Loading,
  Row,
  Screen,
  StatTile,
  space,
} from '@/ui'
import { Pager } from '@/ui/Pager'

const FILTERS: MoneyFilter[] = ['invoiced', 'outstanding', 'overdue', 'collected']

export default function PaymentsScreen() {
  const { t } = useT()
  const router = useRouter()
  return (
    <>
      <Stack.Screen
        options={{
          title: t('payments.title'),
          headerRight: () => (
            <IconButton
              name="list"
              label={t('nav.payment_log')}
              onPress={() => router.push('/payments/log' as never)}
            />
          ),
        }}
      />
      <AdminOnly>{(academyId) => <Invoices academyId={academyId} />}</AdminOnly>
    </>
  )
}

/**
 * Invoices, newest first. The four tiles are sums over a set and the chips
 * below show that set — the same totals RPC and the same server-side paging as
 * the web's `/payments` (docs/payment-screens.md).
 *
 * Issuing invoices is done on the web; from here an admin looks one up, takes
 * a payment, or sends the pay link.
 */
function Invoices({ academyId }: { academyId: string }) {
  const { t } = useT()
  const router = useRouter()
  const params = useLocalSearchParams<{ money?: string }>()
  const fromLink = FILTERS.includes(params.money as MoneyFilter)
    ? (params.money as MoneyFilter)
    : null
  const [money, setMoney] = useState<MoneyFilter>(fromLink ?? 'invoiced')
  useEffect(() => {
    if (fromLink) setMoney(fromLink)
  }, [fromLink])
  const [page, setPage] = useState(1)

  const { data: stats } = useInvoiceStats(academyId, ALL_COURSES)
  const { data, isLoading, error, refetch, isRefetching } = useInvoicePage(
    academyId,
    ALL_COURSES,
    page,
    money,
  )
  const rows = data?.rows ?? []

  const label: Record<MoneyFilter, string> = {
    invoiced: t('common.all'),
    outstanding: t('payments.stat.outstanding'),
    overdue: t('common.overdue'),
    collected: t('payments.stat.collected'),
  }

  return (
    <Screen onRefresh={() => void refetch()} refreshing={isRefetching}>
      <View style={{ gap: space.md }}>
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <StatTile
            label={t('payments.stat.collected')}
            value={formatMYR(stats?.collected ?? 0)}
            tone="positive"
          />
          <StatTile
            label={t('payments.stat.outstanding')}
            value={formatMYR(stats?.outstanding ?? 0)}
          />
        </View>
      </View>

      <Chips<MoneyFilter>
        value={money}
        onChange={(v) => {
          setMoney(v)
          setPage(1)
        }}
        options={FILTERS.map((f) => ({ value: f, label: label[f] }))}
      />

      {isLoading ? (
        <Loading />
      ) : error ? (
        <ErrorBlock error={error} onRetry={() => void refetch()} />
      ) : rows.length === 0 ? (
        <Empty
          icon="file-text"
          title={
            money === 'invoiced' ? t('payments.empty.none') : t('payments.empty.no_match')
          }
        />
      ) : (
        <Card flush>
          {rows.map((inv, i) => (
            <Row
              key={inv.id}
              first={i === 0}
              title={inv.student?.full_name || inv.invoice_no}
              subtitle={[
                inv.invoice_no,
                formatMYR(inv.total_sen),
                inv.due_at ? fmtDate(inv.due_at) : null,
              ]
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
        </Card>
      )}
      <Pager page={page} pageSize={PAGE_SIZE} total={data?.total ?? 0} onChange={setPage} />
    </Screen>
  )
}
