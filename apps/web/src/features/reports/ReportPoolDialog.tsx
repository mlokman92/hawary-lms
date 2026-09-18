import { useT } from '@/lib/i18n'
import { personName } from '@/lib/format'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { EmptyState } from '@/components/patterns/EmptyState'
import { Users } from 'lucide-react'
import { useReportPool, useSetReportChecker } from './api'

/**
 * Who is in the checking rota.
 *
 * A dialog behind the queue's ⋯ menu rather than a settings page, because there
 * is exactly one control here and a page would be a destination nobody visits
 * twice. Appointments earned `/appointments/settings` by having three cards on
 * it; this has one switch per instructor and nothing else.
 *
 * THE POOL IS THE SWITCH. There is no "reports on/off" setting anywhere: an
 * academy with nobody in here cannot receive a report, and `my_reports` reports
 * that as `is_open: false`. Same discipline as `instructors.is_bookable`
 * defaulting to false — turning a feature on must not silently enlist everybody.
 */
export function ReportPoolDialog({
  academyId,
  open,
  onOpenChange,
}: {
  academyId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useT()
  const { data: pool = [] } = useReportPool(academyId)
  const setChecker = useSetReportChecker(academyId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('report.pool.title')}</DialogTitle>
          <DialogDescription>{t('report.pool.desc')}</DialogDescription>
        </DialogHeader>

        {pool.length === 0 ? (
          <EmptyState icon={Users} title={t('report.pool.none')} />
        ) : (
          <ul className="max-h-96 divide-y overflow-y-auto rounded-md border">
            {pool.map((i) => (
              <li
                key={i.id}
                className="flex items-center justify-between gap-3 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {personName(i.full_name) ?? t('common.unnamed')}
                  </p>
                  {i.status !== 'active' ? (
                    <p className="text-muted-foreground text-xs">
                      {t('report.pool.not_active')}
                    </p>
                  ) : null}
                </div>
                <Switch
                  checked={i.is_report_checker}
                  // The rota skips anybody not `active` whatever this says, so
                  // leaving it live would make the switch a lie.
                  disabled={i.status !== 'active'}
                  onCheckedChange={(v) =>
                    setChecker.mutate({ id: i.id, is_report_checker: v })
                  }
                  aria-label={t('report.pool.toggle_aria', {
                    name: personName(i.full_name) ?? t('common.unnamed'),
                  })}
                />
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
