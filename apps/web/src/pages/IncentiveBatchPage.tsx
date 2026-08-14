import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { MoreHorizontal, RefreshCw } from 'lucide-react'
import { bankName, formatMYR, maskAccountNumber } from '@hawary/shared'
import { useAcademy } from '@/lib/academy'
import { useT } from '@/lib/i18n'
import { BackLink } from '@/components/patterns/BackLink'
import { PageHeader } from '@/components/patterns/PageHeader'
import {
  ErrorBlock,
  LoadingBlock,
  NotFoundBlock,
  RouteLoading,
} from '@/components/patterns/QueryState'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { RecipientPicker } from '@/features/incentives/RecipientPicker'
import { PAYOUT_STATUS_META } from '@/features/incentives/status'
import {
  useDeleteIncentiveBatch,
  useDisburse,
  useIncentiveBatch,
  useIncentivePayouts,
  useRefreshPayoutStatus,
} from '@/features/incentives/api'

/**
 * A batch in its two lives: a draft is a list being built, anything else is a
 * ledger of transfers. The status is the switch, so there is no mode to choose
 * and no way to edit recipients after money has started moving.
 */
export function IncentiveBatchPage() {
  const { id } = useParams<{ id: string }>()
  const { t } = useT()
  const navigate = useNavigate()
  const { activeAcademyId, active } = useAcademy()
  const isAdmin = active?.role === 'admin'

  const { data: batch, isLoading, error } = useIncentiveBatch(
    isAdmin ? id : undefined,
  )
  const {
    data: payouts,
    isLoading: payoutsLoading,
    error: payoutsError,
  } = useIncentivePayouts(batch && batch.status !== 'draft' ? batch.id : undefined)
  const del = useDeleteIncentiveBatch(activeAcademyId)
  const disburse = useDisburse(id ?? '')
  const refresh = useRefreshPayoutStatus(id ?? '')
  const [deleteOpen, setDeleteOpen] = useState(false)

  if (!isAdmin) {
    return (
      <div className="mx-auto w-full max-w-5xl">
        <div className="text-muted-foreground rounded-xl border border-dashed p-8 text-center text-sm">
          {t('incentives.admin_only')}
        </div>
      </div>
    )
  }
  if (isLoading) return <RouteLoading />
  if (error || !batch) {
    return (
      <NotFoundBlock
        message={t('incentives.not_found')}
        backTo="/incentives"
        backLabel={t('incentives.back')}
      />
    )
  }

  const isDraft = batch.status === 'draft'
  const rows = payouts ?? []
  // Anything that never reached Billplz is still to send — including a row left
  // in 'sending' by an invocation that died, which the claim reclaims once its
  // lease expires. Testing `status === 'pending'` alone would hide the Resume
  // button on exactly the batch that needs it.
  const hasPending = rows.some(
    (p) =>
      !p.billplz_payment_order_id &&
      (p.status === 'pending' || p.status === 'sending'),
  )
  const runError = disburse.error ?? refresh.error ?? del.error

  // mutate, not mutateAsync: a failed delete belongs in `del.error` above the
  // table, not in an unhandled promise rejection.
  const confirmDelete = () =>
    del.mutate(batch.id, { onSuccess: () => navigate('/incentives') })

  return (
    <div className="mx-auto w-full max-w-5xl">
      <BackLink to="/incentives">{t('incentives.title')}</BackLink>

      <PageHeader
        className="mt-2"
        title={
          <span className="flex flex-wrap items-center gap-2">
            {batch.title}
            {/* Which account the transfers ran against decides whether they
                were money at all — it is readable nowhere else on this page. */}
            {batch.is_sandbox ? (
              <Badge variant="outline">{t('incentives.sandbox')}</Badge>
            ) : null}
          </span>
        }
        description={t('incentives.batch.per_student', {
          amount: formatMYR(batch.amount_sen),
        })}
      >
        {isDraft ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <MoreHorizontal />
                <span className="sr-only">{t('common.actions')}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setDeleteOpen(true)}
              >
                {t('incentives.delete.action')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <>
            <Button
              variant="outline"
              disabled={refresh.isPending}
              onClick={() => refresh.mutate()}
            >
              <RefreshCw /> {t('incentives.refresh_status')}
            </Button>
            {hasPending ? (
              <Button
                disabled={disburse.isPending}
                onClick={() => disburse.mutate()}
              >
                {disburse.isPending
                  ? t('common.sending')
                  : t('incentives.resume')}
              </Button>
            ) : null}
          </>
        )}
      </PageHeader>

      {runError ? (
        <p className="text-destructive mt-4 text-sm">{runError.message}</p>
      ) : null}

      <div className="mt-6">
        {isDraft ? (
          <RecipientPicker batch={batch} />
        ) : payoutsLoading ? (
          <LoadingBlock />
        ) : payoutsError ? (
          <ErrorBlock error={payoutsError} />
        ) : (
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('common.student')}</TableHead>
                  <TableHead>{t('incentives.table.account')}</TableHead>
                  <TableHead className="text-right">
                    {t('common.amount')}
                  </TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                  <TableHead>{t('incentives.table.reason')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="font-medium">
                        {p.students?.full_name ?? t('common.unnamed')}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {p.students?.student_no}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{bankName(p.bank_code)}</div>
                      <div className="text-muted-foreground text-xs tabular-nums">
                        {maskAccountNumber(p.bank_account_last4 ?? '')}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMYR(p.amount_sen)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={PAYOUT_STATUS_META[p.status].variant}>
                        {t(PAYOUT_STATUS_META[p.status].labelKey)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {p.failure_reason ?? ''}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('incentives.delete.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('incentives.delete.body', { title: batch.title })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
