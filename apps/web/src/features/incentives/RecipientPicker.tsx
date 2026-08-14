import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, Users } from 'lucide-react'
import { bankName, formatMYR } from '@hawary/shared'
import { useT } from '@/lib/i18n'
import { EmptyState } from '@/components/patterns/EmptyState'
import { ErrorBlock, LoadingBlock } from '@/components/patterns/QueryState'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useCourses } from '@/features/courses/api'
import {
  useDisburse,
  useIncentiveCandidates,
  useIncentivePayouts,
  useSetIncentiveRecipients,
  type IncentiveBatch,
} from './api'

/**
 * Who gets paid, and then the transfer.
 *
 * The selection is kept across filter changes — an academy pays one course's
 * intake this week and another's the next, and losing the list on a dropdown
 * change would be its own bug. The confirm dialog names the count and the
 * ringgit total, so nothing is sent that was not read back first.
 */
export function RecipientPicker({ batch }: { batch: IncentiveBatch }) {
  const { t, tn } = useT()
  const [search, setSearch] = useState('')
  const [course, setCourse] = useState('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const {
    data: candidates,
    isLoading,
    error: loadError,
  } = useIncentiveCandidates(batch.academy_id, course === 'all' ? null : course)
  const { data: courses } = useCourses(batch.academy_id)
  const { data: existing } = useIncentivePayouts(batch.id)
  const setRecipients = useSetIncentiveRecipients(batch.id)
  const disburse = useDisburse(batch.id)

  // A draft can already carry payout rows: a send that was refused before it
  // reached Billplz (keys not connected) leaves the list saved and the batch in
  // draft. Seed from it once so the admin resumes where they stopped instead of
  // rebuilding the selection by hand.
  const seeded = useRef(false)
  useEffect(() => {
    if (seeded.current || !existing) return
    seeded.current = true
    if (existing.length === 0) return
    // Never over a selection the admin started before the query resolved.
    setSelected((prev) =>
      prev.size > 0 ? prev : new Set(existing.map((p) => p.student_id)),
    )
  }, [existing])

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return candidates ?? []
    return (candidates ?? []).filter((c) =>
      [c.full_name, c.student_no, c.email].some((v) =>
        v?.toLowerCase().includes(q),
      ),
    )
  }, [candidates, search])

  const selectable = useMemo(() => rows.filter((r) => r.has_bank), [rows])
  const allSelected =
    selectable.length > 0 && selectable.every((r) => selected.has(r.student_id))

  const toggle = (studentId: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(studentId)) next.delete(studentId)
      else next.add(studentId)
      return next
    })

  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Set(prev)
      for (const r of selectable) {
        if (allSelected) next.delete(r.student_id)
        else next.add(r.student_id)
      }
      return next
    })

  const count = selected.size
  const totalSen = count * batch.amount_sen
  const busy = setRecipients.isPending || disburse.isPending

  const send = async () => {
    setError(null)
    try {
      // The list is written first: the payout rows are what the edge function
      // sends from, so the selection has to exist server-side before any money
      // moves, and it snapshots each student's bank details as it goes.
      const res = await setRecipients.mutateAsync([...selected])
      // The server decides who is actually payable — it inner-joins
      // student_bank_accounts, so a student who deleted their details since
      // this list was loaded silently drops out. The admin confirmed a count
      // and a total; if the server disagrees with either, that consent no
      // longer covers what would be sent. Stop and make them confirm again.
      if (res.recipients !== selected.size) {
        setError(
          t('incentives.send.list_changed', {
            count: res.recipients,
            picked: selected.size,
          }),
        )
        // The rows the server did write are now the truth. Drop the stale
        // selection and let the seeding effect refill it from them, so a second
        // confirm shows the real count and total instead of failing again.
        seeded.current = false
        setSelected(new Set())
        return
      }
      await disburse.mutateAsync()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('incentives.picker.search_placeholder')}
            className="pl-8"
          />
        </div>
        <Select value={course} onValueChange={setCourse}>
          <SelectTrigger className="w-56" aria-label={t('common.course')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('common.all_courses')}</SelectItem>
            {(courses ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <LoadingBlock />
      ) : loadError ? (
        <ErrorBlock error={loadError} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title={
            (candidates ?? []).length
              ? t('incentives.picker.no_match')
              : t('incentives.picker.empty')
          }
        />
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allSelected}
                    disabled={selectable.length === 0}
                    onCheckedChange={toggleAll}
                    aria-label={t('incentives.picker.select_all')}
                  />
                </TableHead>
                <TableHead>{t('common.student')}</TableHead>
                <TableHead>{t('incentives.picker.bank')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow
                  key={c.student_id}
                  className={c.has_bank ? 'cursor-pointer' : undefined}
                  onClick={() => {
                    if (c.has_bank) toggle(c.student_id)
                  }}
                >
                  {/* The cell swallows the click so the checkbox's own handler
                      is not undone by the row's. */}
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selected.has(c.student_id)}
                      disabled={!c.has_bank}
                      onCheckedChange={() => toggle(c.student_id)}
                      aria-label={c.full_name ?? c.student_no}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">
                      {c.full_name ?? t('common.unnamed')}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {c.student_no}
                    </div>
                  </TableCell>
                  <TableCell>
                    {c.has_bank ? (
                      <>
                        <div className="text-sm">
                          {bankName(c.bank_code ?? '')}
                        </div>
                        <div className="text-muted-foreground text-xs tabular-nums">
                          {c.masked_account}
                        </div>
                      </>
                    ) : (
                      <span className="text-muted-foreground text-sm">
                        {t('incentives.no_bank')}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {error ? <p className="text-destructive mt-4 text-sm">{error}</p> : null}

      <div className="bg-background/95 sticky bottom-0 mt-4 flex flex-wrap items-center justify-between gap-3 border-t py-3 backdrop-blur">
        <p className="text-sm tabular-nums">
          {tn('incentives.recipients', count)} · {formatMYR(totalSen)}
        </p>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button disabled={count === 0 || busy}>
              {busy ? t('common.sending') : t('incentives.send.action')}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t('incentives.send.confirm_title')}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {/* Plural, not `t`: "1 bank accounts" in a confirmation that
                    moves money reads as a bug in the thing about to spend. */}
                {tn('incentives.send.confirm_body', count, {
                  total: formatMYR(totalSen),
                })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={send}>
                {t('incentives.send.action')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}
