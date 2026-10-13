import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Clock,
  FileCheck,
  Flag,
  MoreHorizontal,
  Search,
  Upload,
} from 'lucide-react'
import { formatMYR } from '@hawary/shared'
import { useAcademy } from '@/lib/academy'
import { errorMessage } from '@/lib/errors'
import { fmtDate, fmtDateTime } from '@/lib/format'
import { useT } from '@/lib/i18n'
import { useDebounced } from '@/lib/useDebounced'
import { PageHeader } from '@/components/patterns/PageHeader'
import { BackLink } from '@/components/patterns/BackLink'
import { EmptyState } from '@/components/patterns/EmptyState'
import { FilterStatCard } from '@/components/patterns/FilterStatCard'
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { InvoiceSheet } from '@/features/payments/InvoiceSheet'
import { ReceiptSheet } from '@/features/payments/ReceiptSheet'
import { StudentSheet } from '@/features/students/StudentSheet'
import {
  FLAG_REASON_LABEL,
  useBankTransferReceiptCounts,
  useBankTransferReceipts,
  useReceiptPicker,
  type BankTransferRow,
  type ReceiptSort,
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
  return raw === 'uploaded' ||
    raw === 'flagged' ||
    raw === 'confirmed' ||
    raw === ALL
    ? raw
    : 'pending'
}

/** Newest first is the default and, like pending, is never written. */
function readSort(raw: string | null): ReceiptSort {
  return raw === 'oldest' ? 'oldest' : 'newest'
}

const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i

/** Anything that is not an id reads as "nothing open", not a failed cast. */
function readId(raw: string | null): string | null {
  return raw && UUID.test(raw) ? raw : null
}

/**
 * Bank transfer receipts: every bank transfer in the ledger, and whether the
 * receipt it was recorded from has been uploaded.
 *
 * A transfer is the one payment the system takes on a staff member's word, so
 * the proof is kept beside the claim. One without a receipt is **pending**;
 * one with a receipt is **uploaded** until a Director has looked at it, and
 * then **checked**, or **flagged** with what is wrong.
 *
 * The page opens on the pending list because clearing it is the job. The four
 * cards are the filter — each is the count and the money in that state, and
 * pressing the pressed one shows all four. Each row has one
 * action: upload when there is nothing, view when there is. Replacing a
 * receipt is occasional, so it sits behind the row's menu.
 *
 * A row opens that transfer in a panel on the right, receipt drawn, and puts
 * its id in the address (`?payment=`). The address is then the record: an
 * invoice carries several transfers, often of the same amount, and this is the
 * one link a colleague can be sent that means exactly this one.
 */
export function PaymentReceiptsPage() {
  const { t } = useT()
  const { activeAcademyId, active } = useAcademy()
  const [params, setParams] = useSearchParams()

  const state = readState(params.get('state'))
  const search = params.get('q')?.trim() ?? ''
  const paymentId = readId(params.get('payment'))
  const studentId = readId(params.get('student'))
  const invoiceId = readId(params.get('invoice'))
  const sort = readSort(params.get('sort'))

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

  // A name or an invoice number opens that record in a panel here, not its
  // page: the question is asked from the middle of this list. Still a real
  // link, so a modified click opens the page itself in another tab. One panel
  // at a time — opening one closes whichever was open.
  const openIn =
    (key: 'student' | 'invoice', id: string) => (e: MouseEvent) => {
      e.stopPropagation()
      if (e.metaKey || e.ctrlKey || e.shiftKey) return
      e.preventDefault()
      commit({ payment: null, student: null, invoice: null, [key]: id })
    }

  // The box keeps its own text so typing stays instant; the URL — and so the
  // server — only hears about it once typing settles. Same pattern as the log.
  const [query, setQuery] = useState(search)
  const debounced = useDebounced(query)
  const committed = useRef(search)
  useEffect(() => {
    const needle = debounced.trim()
    if (needle === search) return
    committed.current = needle
    commit({ q: needle || null })
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
    sort,
  )
  const counts = useBankTransferReceiptCounts(activeAcademyId, search)
  // One file input for the whole table; a row's button says which payment
  // the next chosen file belongs to.
  const picker = useReceiptPicker()

  // Pages are cut by OFFSET, so a transfer recorded between two loads pushes
  // every row down one and the next page starts with a row already on screen.
  // Keeping the first sighting of each id is what stops it appearing twice.
  const list = useMemo(() => {
    const seen = new Set<string>()
    const out: BankTransferRow[] = []
    for (const page of rows.data?.pages ?? [])
      for (const row of page)
        if (!seen.has(row.id)) {
          seen.add(row.id)
          out.push(row)
        }
    return out
  }, [rows.data])
  const total =
    state === 'pending'
      ? (counts.data?.pending ?? 0)
      : state === 'uploaded'
        ? (counts.data?.uploaded ?? 0)
        : state === 'flagged'
          ? (counts.data?.flagged ?? 0)
          : state === 'confirmed'
            ? (counts.data?.confirmed ?? 0)
            : (counts.data?.pending ?? 0) +
              (counts.data?.uploaded ?? 0) +
              (counts.data?.flagged ?? 0) +
              (counts.data?.confirmed ?? 0)

  const failure = picker.error

  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 400)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className="mx-auto w-full max-w-6xl">
      <BackLink to="/payments">{t('payments.title')}</BackLink>
      <PageHeader
        title={t('payments.receipts.title')}
        description={t('payments.receipts.subtitle')}
      />

      <input {...picker.inputProps} />

      {/* The filter. Pressing the pressed card shows all four, so the cards
          are also the way back out of the filter they applied. */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <FilterStatCard
          label={t('payments.pstatus.pending')}
          value={formatMYR(counts.data?.pendingSen ?? 0)}
          count={counts.data?.pending}
          icon={Clock}
          tone="warning"
          active={state === 'pending'}
          onClick={() => commit({ state: state === 'pending' ? ALL : null })}
        />
        <FilterStatCard
          label={t('payments.receipts.uploaded')}
          value={formatMYR(counts.data?.uploadedSen ?? 0)}
          count={counts.data?.uploaded}
          icon={FileCheck}
          tone="info"
          active={state === 'uploaded'}
          onClick={() =>
            commit({ state: state === 'uploaded' ? ALL : 'uploaded' })
          }
        />
        <FilterStatCard
          label={t('payments.receipts.flagged')}
          value={formatMYR(counts.data?.flaggedSen ?? 0)}
          count={counts.data?.flagged}
          icon={Flag}
          tone="danger"
          active={state === 'flagged'}
          onClick={() =>
            commit({ state: state === 'flagged' ? ALL : 'flagged' })
          }
        />
        <FilterStatCard
          label={t('payments.receipts.checked')}
          value={formatMYR(counts.data?.confirmedSen ?? 0)}
          count={counts.data?.confirmed}
          icon={CheckCircle2}
          tone="positive"
          active={state === 'confirmed'}
          onClick={() =>
            commit({ state: state === 'confirmed' ? ALL : 'confirmed' })
          }
        />
      </div>

      <div className="relative mt-4">
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
                  {/* The one sortable column: which end of the queue is
                      at the top. */}
                  <TableHead>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="-ml-2.5"
                      onClick={() =>
                        commit({ sort: sort === 'newest' ? 'oldest' : null })
                      }
                    >
                      {t('payments.receipts.recorded')}
                      {sort === 'newest' ? <ArrowDown /> : <ArrowUp />}
                    </Button>
                  </TableHead>
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
                  <TableRow
                    key={p.id}
                    className="cursor-pointer"
                    onClick={() =>
                      commit({ payment: p.id, student: null, invoice: null })
                    }
                  >
                    {/* Names wrap rather than widen: every text cell here is
                        somebody's name or a course's, and one long one
                        otherwise pushes the actions off the screen. */}
                    <TableCell className="whitespace-normal">
                      <div className="whitespace-nowrap">
                        {fmtDateTime(p.created_at)}
                      </div>
                      {/* The day the money moved — what the receipt itself is
                          dated, and so what it gets matched against. */}
                      <div className="text-muted-foreground text-xs">
                        {t('payments.receipts.paid_on', {
                          date: fmtDate(p.paid_at ?? p.created_at),
                        })}
                        {p.recorded_by_name ? ` · ${p.recorded_by_name}` : ''}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      {p.student_id ? (
                        <Link
                          to={`/students/${p.student_id}`}
                          className="hover:underline"
                          onClick={openIn('student', p.student_id)}
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
                    <TableCell className="whitespace-normal">
                      {p.invoice_id ? (
                        <Link
                          to={`/payments/${p.invoice_id}`}
                          className="font-medium hover:underline"
                          onClick={openIn('invoice', p.invoice_id)}
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
                    <TableCell className="whitespace-normal">
                      {p.receipt_uploaded_at ? (
                        <>
                          <div className="max-w-48 truncate text-sm">
                            {p.receipt_file_name}
                          </div>
                          <div className="text-muted-foreground text-xs">
                            {fmtDateTime(p.receipt_uploaded_at)}
                            {p.receipt_uploaded_by_name
                              ? ` · ${p.receipt_uploaded_by_name}`
                              : ''}
                          </div>
                          {p.receipt_flag_reasons?.length ? (
                            <div className="text-destructive text-xs">
                              {t('payments.receipts.flagged_as', {
                                reasons: p.receipt_flag_reasons
                                  .map((r) => t(FLAG_REASON_LABEL[r]))
                                  .join(', '),
                              })}
                            </div>
                          ) : null}
                          {p.receipt_confirmed_at ? (
                            <div className="text-muted-foreground text-xs">
                              {t('payments.receipts.checked_on', {
                                date: fmtDateTime(p.receipt_confirmed_at),
                              })}
                              {p.receipt_confirmed_by_name
                                ? ` · ${p.receipt_confirmed_by_name}`
                                : ''}
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <Badge variant="secondary">
                          {t('payments.pstatus.pending')}
                        </Badge>
                      )}
                    </TableCell>
                    {/* The menu's items are portalled but still bubble through
                        React to the row, so the cell is where they stop. */}
                    <TableCell
                      className="text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {picker.uploadingId === p.id ? (
                        <Button variant="outline" size="sm" disabled>
                          {t('common.uploading')}
                        </Button>
                      ) : p.receipt_uploaded_at ? (
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              commit({
                                payment: p.id,
                                student: null,
                                invoice: null,
                              })
                            }
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

        {rows.hasNextPage ? (
          <div className="mt-4 flex items-center justify-center gap-3">
            <Button
              variant="outline"
              size="sm"
              disabled={rows.isFetchingNextPage}
              onClick={() => void rows.fetchNextPage()}
            >
              {rows.isFetchingNextPage
                ? t('common.loading')
                : t('common.load_more')}
            </Button>
            <span className="text-muted-foreground text-sm tabular-nums">
              {t('common.shown_of', { shown: list.length, total })}
            </span>
          </div>
        ) : null}
      </div>

      {/* A loaded-more list is a long way down from its cards and search. */}
      {scrolled ? (
        <Button
          variant="outline"
          size="icon"
          className="fixed right-6 bottom-6 z-40 rounded-full shadow-md"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        >
          <ArrowUp />
          <span className="sr-only">{t('common.back_to_top')}</span>
        </Button>
      ) : null}

      <StudentSheet
        studentId={studentId}
        onClose={() => commit({ student: null })}
      />
      <InvoiceSheet
        invoiceId={invoiceId}
        onClose={() => commit({ invoice: null })}
      />

      <ReceiptSheet
        academyId={activeAcademyId}
        paymentId={paymentId}
        hint={list.find((row) => row.id === paymentId)}
        picker={picker}
        isDirector={active?.isDirector === true}
        onClose={() => commit({ payment: null })}
      />
    </div>
  )
}
