import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { MoreHorizontal, Search, Upload } from 'lucide-react'
import { formatMYR } from '@hawary/shared'
import { useAcademy } from '@/lib/academy'
import { errorMessage } from '@/lib/errors'
import { fmtDate, fmtDateTime } from '@/lib/format'
import { useT } from '@/lib/i18n'
import { useDebounced } from '@/lib/useDebounced'
import { PageHeader } from '@/components/patterns/PageHeader'
import { BackLink } from '@/components/patterns/BackLink'
import { EmptyState } from '@/components/patterns/EmptyState'
import { Pager } from '@/components/patterns/Pager'
import { ErrorBlock, LoadingBlock } from '@/components/patterns/QueryState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import {
  RECEIPT_PAGE_SIZE,
  useBankTransferReceiptCounts,
  useBankTransferReceipts,
  useOpenPaymentReceipt,
  useReceiptPicker,
  type ReceiptState,
} from '@/features/payments/receipts'

/** The page's own value for "both sides"; the RPC takes NULL for it. */
const ALL = 'all'
type StateFilter = ReceiptState | typeof ALL

/**
 * Pending is the default and so is the one value never written to the URL: the
 * page exists to clear that list, and the bare address should open on it.
 */
function readState(raw: string | null): StateFilter {
  return raw === 'uploaded' || raw === ALL ? raw : 'pending'
}

function readPage(raw: string | null): number {
  const n = Number(raw)
  return Number.isInteger(n) && n >= 1 ? n : 1
}

/**
 * Bank transfer receipts: every bank transfer in the ledger, and whether the
 * receipt it was recorded from has been uploaded.
 *
 * A transfer is the one payment the system takes on a staff member's word, so
 * the proof is kept beside the claim. One without a receipt is **pending** —
 * a fact about the paperwork only: nothing here changes what was collected.
 *
 * The page opens on the pending list because clearing it is the job. Each row
 * has one action: upload when there is nothing, view when there is. Replacing
 * a receipt is occasional, so it sits behind the row's menu.
 */
export function PaymentReceiptsPage() {
  const { t, tn } = useT()
  const { activeAcademyId } = useAcademy()
  const [params, setParams] = useSearchParams()

  const state = readState(params.get('state'))
  const search = params.get('q')?.trim() ?? ''
  const page = readPage(params.get('page'))

  // `replace`: a filter is not a place you navigate back through.
  const commit = useCallback(
    (next: Record<string, string | null>) =>
      setParams(
        (prev) => {
          const out = new URLSearchParams(prev)
          for (const [key, value] of Object.entries(next)) {
            if (value) out.set(key, value)
            else out.delete(key)
          }
          return out
        },
        { replace: true },
      ),
    [setParams],
  )

  // The box keeps its own text so typing stays instant; the URL — and so the
  // server — only hears about it once typing settles. Same pattern as the log.
  const [query, setQuery] = useState(search)
  const debounced = useDebounced(query)
  const committed = useRef(search)
  useEffect(() => {
    const needle = debounced.trim()
    if (needle === search) return
    committed.current = needle
    commit({ q: needle || null, page: null })
  }, [debounced, search, commit])
  useEffect(() => {
    if (search === committed.current) return
    committed.current = search
    setQuery(search)
  }, [search])

  const rows = useBankTransferReceipts(
    activeAcademyId,
    state === ALL ? null : state,
    search,
    page,
  )
  const counts = useBankTransferReceiptCounts(activeAcademyId, search)
  // One file input for the whole table; a row's button says which payment
  // the next chosen file belongs to.
  const picker = useReceiptPicker()
  const open = useOpenPaymentReceipt()

  const list = rows.data ?? []
  const total =
    state === 'pending'
      ? (counts.data?.pending ?? 0)
      : state === 'uploaded'
        ? (counts.data?.uploaded ?? 0)
        : (counts.data?.pending ?? 0) + (counts.data?.uploaded ?? 0)

  const failure = picker.error ?? open.error

  return (
    <div className="mx-auto w-full max-w-6xl">
      <BackLink to="/payments">{t('payments.title')}</BackLink>
      <PageHeader
        title={t('payments.receipts.title')}
        description={t('payments.receipts.subtitle')}
      />

      <input {...picker.inputProps} />

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('payments.receipts.search_placeholder')}
            aria-label={t('payments.receipts.search_placeholder')}
            className="pl-8"
          />
        </div>
        <Select
          value={state}
          onValueChange={(v) =>
            commit({ state: v === 'pending' ? null : v, page: null })
          }
        >
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">
              {t('payments.pstatus.pending')}
              {counts.data ? ` (${counts.data.pending})` : ''}
            </SelectItem>
            <SelectItem value="uploaded">
              {t('payments.receipts.uploaded')}
              {counts.data ? ` (${counts.data.uploaded})` : ''}
            </SelectItem>
            <SelectItem value={ALL}>{t('common.all')}</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-muted-foreground ml-auto text-sm tabular-nums">
          {counts.data === undefined
            ? '—'
            : tn('payments.receipts.summary', counts.data.pending, {
                amount: formatMYR(counts.data.pendingSen),
              })}
        </p>
      </div>

      {failure ? (
        <p className="text-destructive mt-3 text-sm">
          {errorMessage(failure, t('upload.failed'))}
        </p>
      ) : null}

      <div className="mt-4">
        {rows.isLoading ? (
          <LoadingBlock />
        ) : rows.error ? (
          <ErrorBlock error={rows.error} />
        ) : list.length === 0 ? (
          <EmptyState
            size="block"
            title={t(
              state === 'pending' && search === ''
                ? 'payments.receipts.empty_pending'
                : 'payments.receipts.empty_match',
            )}
          />
        ) : (
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('payments.receipts.recorded')}</TableHead>
                  <TableHead>{t('common.student')}</TableHead>
                  <TableHead>{t('payments.table.invoice')}</TableHead>
                  <TableHead className="text-right">
                    {t('common.amount')}
                  </TableHead>
                  <TableHead>{t('payments.receipts.receipt')}</TableHead>
                  <TableHead>
                    <span className="sr-only">{t('common.actions')}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="whitespace-nowrap">
                      <div>{fmtDateTime(p.created_at)}</div>
                      {/* The day the money moved — what the receipt itself is
                          dated, and so what it gets matched against. */}
                      <div className="text-muted-foreground text-xs">
                        {t('payments.receipts.paid_on', {
                          date: fmtDate(p.paid_at ?? p.created_at),
                        })}
                        {p.recorded_by_name ? ` · ${p.recorded_by_name}` : ''}
                      </div>
                    </TableCell>
                    <TableCell>
                      {p.student_id ? (
                        <Link
                          to={`/students/${p.student_id}`}
                          className="hover:underline"
                        >
                          {p.student_full_name ?? t('common.unnamed')}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                      {p.student_no ? (
                        <div className="text-muted-foreground text-xs">
                          {p.student_no}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {p.invoice_id ? (
                        <Link
                          to={`/payments/${p.invoice_id}`}
                          className="font-medium hover:underline"
                        >
                          {p.invoice_no}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                      {p.course_title ? (
                        <div className="text-muted-foreground text-xs">
                          {p.course_title}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMYR(p.amount_sen)}
                    </TableCell>
                    <TableCell>
                      {p.receipt_uploaded_at ? (
                        <>
                          <div className="max-w-56 truncate text-sm">
                            {p.receipt_file_name}
                          </div>
                          <div className="text-muted-foreground text-xs">
                            {fmtDateTime(p.receipt_uploaded_at)}
                            {p.receipt_uploaded_by_name
                              ? ` · ${p.receipt_uploaded_by_name}`
                              : ''}
                          </div>
                        </>
                      ) : (
                        <Badge variant="secondary">
                          {t('payments.pstatus.pending')}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {picker.uploadingId === p.id ? (
                        <Button variant="outline" size="sm" disabled>
                          {t('common.uploading')}
                        </Button>
                      ) : p.receipt_uploaded_at ? (
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={open.isPending}
                            onClick={() => open.mutate(p.id)}
                          >
                            {t('common.view')}
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon-sm">
                                <MoreHorizontal />
                                <span className="sr-only">
                                  {t('common.actions')}
                                </span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => picker.pick(p.id)}
                              >
                                <Upload /> {t('payments.receipts.replace')}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={picker.busy}
                          onClick={() => picker.pick(p.id)}
                        >
                          <Upload /> {t('common.upload')}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <Pager
          page={page}
          total={total}
          pageSize={RECEIPT_PAGE_SIZE}
          onPageChange={(n) => commit({ page: n > 1 ? String(n) : null })}
        />
      </div>
    </div>
  )
}
