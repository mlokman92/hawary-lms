import { useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { useAcademy } from '@/lib/academy'
import { getLang, useT } from '@/lib/i18n'
import { localeFor, personName } from '@/lib/format'
import { useDebounced } from '@/lib/useDebounced'
import { TONE_CLASS } from '@/lib/tone'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/patterns/PageHeader'
import { EmptyState } from '@/components/patterns/EmptyState'
import { ErrorBlock, LoadingBlock } from '@/components/patterns/QueryState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useMyInstructorRecord } from '@/features/profile/api'
import { AppointmentDialog } from '@/features/appointments/AppointmentDialog'
import {
  APPOINTMENT_PAGE_SIZE,
  APPOINTMENT_STATUS,
  DEFAULT_TZ,
  useAcademyTimezone,
  useAppointmentPage,
  useBookingPool,
  type AppointmentFilters,
  type AppointmentRow,
  type AppointmentStatus,
} from '@/features/appointments/api'
import { fmtRange, fmtWhen } from '@/features/appointments/calendar'

/**
 * Every session the academy has held, in one list.
 *
 * `/appointments` is the diary — seven days, laid out as a grid, answering
 * "what does this week look like". This answers a different question: *find me
 * that session*. It cannot be a mode of the diary, because the diary is
 * windowed to a week and a grid has nowhere to put a cancelled session, which
 * is exactly the row somebody comes here looking for.
 *
 * Same relationship as `/payments` to `/payments/log`, and it hangs off
 * Appointments in the nav the same way.
 *
 * The three actions live in the shared `AppointmentDialog`, which works out for
 * itself whether the reader may use them — admin, or the instructor whose
 * session it is. Nothing here re-implements that rule.
 */

const STATUSES: AppointmentStatus[] = [
  'booked',
  'completed',
  'no_show',
  'cancelled',
]

/** `''` is the "any" option; Radix Select cannot hold an empty string value. */
const ANY = 'all'

export function AppointmentListPage() {
  const { t } = useT()
  const locale = localeFor(getLang())
  const { activeAcademyId } = useAcademy()
  const { data: tz = DEFAULT_TZ } = useAcademyTimezone(activeAcademyId)
  const { data: pool } = useBookingPool(activeAcademyId)
  const myInstructor = useMyInstructorRecord(activeAcademyId)

  const [status, setStatus] = useState<AppointmentStatus | ''>('')
  const [instructorId, setInstructorId] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState<AppointmentRow | null>(null)

  // Debounced, or every keystroke is a round trip.
  const debouncedSearch = useDebounced(search, 300)

  const filters: AppointmentFilters = useMemo(
    () => ({ status, instructorId, search: debouncedSearch }),
    [status, instructorId, debouncedSearch],
  )

  // Any filter change restarts paging: page 7 of the old result set is not a
  // meaningful place to land in the new one.
  useEffect(() => {
    setPage(1)
  }, [status, instructorId, debouncedSearch])

  const { data, isLoading, error } = useAppointmentPage(
    activeAcademyId,
    filters,
    page,
  )

  const rows = data?.rows ?? []
  const total = data?.total ?? 0
  const lastPage = Math.max(1, Math.ceil(total / APPOINTMENT_PAGE_SIZE))
  const mineId = myInstructor.data?.id ?? null

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        title={t('appt.register.title')}
        description={t('appt.register.subtitle')}
      />

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('appt.register.search')}
            className="pl-8"
          />
        </div>

        <Select
          value={status || ANY}
          onValueChange={(v) => setStatus(v === ANY ? '' : (v as AppointmentStatus))}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>{t('appt.register.any_status')}</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {t(APPOINTMENT_STATUS[s].labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={instructorId || ANY}
          onValueChange={(v) => setInstructorId(v === ANY ? '' : v)}
        >
          <SelectTrigger className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>
              {t('appt.calendar.all_instructors')}
            </SelectItem>
            {/* "Mine" first and by name, so an instructor does not have to
                remember which of five identically-formatted names is them. */}
            {mineId ? (
              <SelectItem value={mineId}>{t('appt.register.mine')}</SelectItem>
            ) : null}
            {(pool ?? [])
              .filter((i) => i.id !== mineId)
              .map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {personName(i.full_name) ?? t('common.unnamed')}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <LoadingBlock className="mt-6" />
      ) : error ? (
        <ErrorBlock error={error} className="mt-6" />
      ) : rows.length === 0 ? (
        <EmptyState
          size="block"
          title={t('appt.register.empty')}
          className="mt-6"
        />
      ) : (
        <>
          <Card className="mt-4 gap-0 py-0">
            <ul className="divide-y">
              {rows.map((a) => {
                const meta = APPOINTMENT_STATUS[a.status]
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => setOpen(a)}
                      className="hover:bg-muted/50 flex w-full items-center gap-3 px-4 py-3 text-left transition-colors"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {personName(a.students?.full_name) ??
                            t('common.unnamed')}
                        </span>
                        <span className="text-muted-foreground block truncate text-xs">
                          {fmtWhen(a.starts_at, tz, locale)} ·{' '}
                          {fmtRange(a.starts_at, a.ends_at, tz)}
                        </span>
                      </span>
                      <span className="text-muted-foreground hidden shrink-0 truncate text-xs sm:block sm:max-w-40">
                        {personName(a.instructors?.full_name) ??
                          t('common.unnamed')}
                      </span>
                      <Badge variant="outline" className="shrink-0">
                        <span className={cn('font-medium', TONE_CLASS[meta.tone])}>
                          {t(meta.labelKey)}
                        </span>
                      </Badge>
                    </button>
                  </li>
                )
              })}
            </ul>
          </Card>

          {/* Only when there is more than one page: a pager under a single
              page of results is furniture. */}
          {lastPage > 1 ? (
            <div className="mt-4 flex items-center justify-between gap-2">
              <p className="text-muted-foreground text-xs tabular-nums">
                {t('appt.register.count', { count: total })}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  {t('common.previous')}
                </Button>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {t('appt.register.page', { page, of: lastPage })}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= lastPage}
                  onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
                >
                  {t('common.next')}
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}

      <AppointmentDialog
        academyId={activeAcademyId}
        appointment={open}
        tz={tz}
        locale={locale}
        onOpenChange={(v) => !v && setOpen(null)}
      />
    </div>
  )
}
