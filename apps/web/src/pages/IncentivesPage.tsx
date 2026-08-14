import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { HandCoins, Plus } from 'lucide-react'
import { formatMYR } from '@hawary/shared'
import { useAcademy } from '@/lib/academy'
import { fmtDate } from '@/lib/format'
import { useT } from '@/lib/i18n'
import { PageHeader } from '@/components/patterns/PageHeader'
import { EmptyState } from '@/components/patterns/EmptyState'
import { ErrorBlock, LoadingBlock } from '@/components/patterns/QueryState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { NewIncentiveDialog } from '@/features/incentives/NewIncentiveDialog'
import { BATCH_STATUS_META } from '@/features/incentives/status'
import { useIncentiveBatches } from '@/features/incentives/api'

export function IncentivesPage() {
  const navigate = useNavigate()
  const { t } = useT()
  const { activeAcademyId, active } = useAcademy()
  const isAdmin = active?.role === 'admin'
  const { data: batches, isLoading, error } = useIncentiveBatches(
    isAdmin ? activeAcademyId : null,
  )
  const [open, setOpen] = useState(false)

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        title={t('incentives.title')}
        description={t('incentives.subtitle')}
      >
        {isAdmin ? (
          <Button onClick={() => setOpen(true)}>
            <Plus /> {t('incentives.new.action')}
          </Button>
        ) : null}
      </PageHeader>

      <div className="mt-6">
        {!isAdmin ? (
          <div className="text-muted-foreground rounded-xl border border-dashed p-8 text-center text-sm">
            {t('incentives.admin_only')}
          </div>
        ) : isLoading ? (
          <LoadingBlock />
        ) : error ? (
          <ErrorBlock error={error} />
        ) : (batches ?? []).length === 0 ? (
          <EmptyState
            size="block"
            icon={HandCoins}
            title={t('incentives.empty')}
          >
            <Button variant="outline" onClick={() => setOpen(true)}>
              <Plus /> {t('incentives.new.action')}
            </Button>
          </EmptyState>
        ) : (
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('common.title')}</TableHead>
                  <TableHead className="text-right">
                    {t('incentives.amount_per_student')}
                  </TableHead>
                  <TableHead className="text-right">
                    {t('incentives.table.recipients')}
                  </TableHead>
                  <TableHead className="text-right">
                    {t('common.total')}
                  </TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                  <TableHead>{t('incentives.table.created')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(batches ?? []).map((b) => (
                  <TableRow
                    key={b.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/incentives/${b.id}`)}
                  >
                    <TableCell className="font-medium">{b.title}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMYR(b.amount_sen)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {b.recipients}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMYR(b.amount_sen * b.recipients)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={BATCH_STATUS_META[b.status].variant}>
                        {t(BATCH_STATUS_META[b.status].labelKey)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {fmtDate(b.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {activeAcademyId ? (
        <NewIncentiveDialog
          academyId={activeAcademyId}
          open={open}
          onOpenChange={setOpen}
        />
      ) : null}
    </div>
  )
}
