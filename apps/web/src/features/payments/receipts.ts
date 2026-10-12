import { useCallback, useRef, type ChangeEvent } from 'react'
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { paymentReceiptUrl, uploadPaymentReceipt } from '@/lib/storage'

/**
 * Bank transfer receipts.
 *
 * A bank transfer is the one way money arrives that the system takes on trust:
 * FPX is confirmed by the gateway, a transfer is a row somebody typed. So every
 * succeeded bank transfer is expected to carry the receipt it was recorded
 * from, and one that does not is **pending**.
 *
 * Pending is a fact about the paperwork, not the money — it changes no status
 * and no total. A payment is pending exactly when it has no `payment_receipts`
 * row, which is why there is no flag to keep in step with anything.
 */

/** Which side of the paperwork to list. `all` is the page's own sentinel. */
export const RECEIPT_STATES = ['pending', 'uploaded'] as const
export type ReceiptState = (typeof RECEIPT_STATES)[number]

/**
 * One bank transfer, with its receipt if it has one.
 *
 * A hand-written mirror of `bank_transfer_receipts_page`: the generated
 * `Returns` type marks every column non-null, because Supabase cannot infer
 * nullability from a RETURNS TABLE. The four `receipt_*` fields are null
 * together — that is what pending looks like.
 */
export type BankTransferRow = {
  id: string
  amount_sen: number
  paid_at: string | null
  created_at: string
  note: string | null
  invoice_id: string | null
  invoice_no: string | null
  course_title: string | null
  student_id: string | null
  student_full_name: string | null
  student_no: string | null
  recorded_by_name: string | null
  receipt_file_name: string | null
  receipt_mime_type: string | null
  receipt_uploaded_at: string | null
  receipt_uploaded_by_name: string | null
}

export const RECEIPT_PAGE_SIZE = 50

/**
 * Bank transfers, newest-recorded first, growing: each "Load more" appends the
 * next page.
 *
 * The filters are in the key and the page is not, so a new search or the other
 * side of the paperwork starts again from the top. The function returns rows
 * and no total, so a full page is what says there may be another.
 */
export function useBankTransferReceipts(
  academyId: string | null,
  state: ReceiptState | null,
  search: string,
) {
  return useInfiniteQuery({
    queryKey: ['bank-transfer-receipts', academyId, state ?? '', search] as const,
    enabled: !!academyId,
    // Without this an upload — which takes the row off the pending list —
    // blanks the table through the empty state while the list refetches.
    placeholderData: keepPreviousData,
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabase.rpc('bank_transfer_receipts_page', {
        _academy: academyId!,
        ...(state ? { _state: state } : {}),
        ...(search.trim() ? { _search: search.trim() } : {}),
        _limit: RECEIPT_PAGE_SIZE,
        _offset: (pageParam - 1) * RECEIPT_PAGE_SIZE,
      })
      if (error) throw error
      return (data ?? []) as unknown as BankTransferRow[]
    },
    getNextPageParam: (last, pages) =>
      last.length === RECEIPT_PAGE_SIZE ? pages.length + 1 : undefined,
  })
}

/** What `useBankTransfer` reads before it is flattened to a `BankTransferRow`. */
type BankTransferEmbed = {
  id: string
  amount_sen: number
  paid_at: string | null
  created_at: string
  note: string | null
  invoice_id: string | null
  student_id: string | null
  invoice: { invoice_no: string; course: { title: string } | null } | null
  student: { full_name: string | null; student_no: string | null } | null
  recorder: { full_name: string | null } | null
  receipt: {
    file_name: string
    mime_type: string
    created_at: string
    uploaded_by_name: string | null
  } | null
}

/**
 * One bank transfer by its id — what `/payments/receipts?payment=<id>` opens.
 *
 * Its own read rather than a lookup in the list: the address is something a
 * colleague is sent, and the row it names may be on the other side of the
 * paperwork, past the pages loaded, or outside the search. A plain PostgREST
 * read is enough for one row — the page function exists for its search — and
 * the tables' own policies scope it, `payment_receipts` to admins.
 *
 * `null` is "no such bank transfer", which is also what a payment of another
 * method or another academy reads as.
 */
export function useBankTransfer(
  academyId: string | null,
  paymentId: string | null,
) {
  return useQuery({
    queryKey: ['bank-transfer-receipts', 'one', academyId, paymentId] as const,
    enabled: !!academyId && !!paymentId,
    queryFn: async (): Promise<BankTransferRow | null> => {
      const { data, error } = await supabase
        .from('payments')
        .select(
          'id, amount_sen, paid_at, created_at, note, invoice_id, student_id, invoice:invoices(invoice_no, course:courses(title)), student:students(full_name, student_no), recorder:profiles(full_name), receipt:payment_receipts(file_name, mime_type, created_at, uploaded_by_name)',
        )
        .eq('academy_id', academyId!)
        .eq('id', paymentId!)
        .eq('method', 'bank_transfer')
        .eq('status', 'succeeded')
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      const p = data as unknown as BankTransferEmbed
      return {
        id: p.id,
        amount_sen: p.amount_sen,
        paid_at: p.paid_at,
        created_at: p.created_at,
        note: p.note,
        invoice_id: p.invoice_id,
        invoice_no: p.invoice?.invoice_no ?? null,
        course_title: p.invoice?.course?.title ?? null,
        student_id: p.student_id,
        student_full_name: p.student?.full_name ?? null,
        student_no: p.student?.student_no ?? null,
        recorded_by_name: p.recorder?.full_name ?? null,
        receipt_file_name: p.receipt?.file_name ?? null,
        receipt_mime_type: p.receipt?.mime_type ?? null,
        receipt_uploaded_at: p.receipt?.created_at ?? null,
        receipt_uploaded_by_name: p.receipt?.uploaded_by_name ?? null,
      }
    },
  })
}

/**
 * A signed URL to draw a receipt in the page, rather than open it in a tab.
 *
 * `version` is the receipt's upload time, so a replaced receipt is a new key
 * and a new URL. The URL lives 60 seconds and the file is fetched once, when
 * it is first drawn — so the query never goes stale while the panel is open,
 * and is dropped the moment it closes: a cached one is mostly an expired one.
 */
export function useReceiptPreviewUrl(
  paymentId: string | null,
  version: string | null,
) {
  return useQuery({
    queryKey: ['payment-receipt-url', paymentId, version] as const,
    enabled: !!paymentId && !!version,
    staleTime: Infinity,
    gcTime: 0,
    queryFn: () => paymentReceiptUrl(paymentId!),
  })
}

type CountsRow = {
  pending_count: number
  pending_sen: number
  uploaded_count: number
  uploaded_sen: number
}

/**
 * How many are pending and uploaded, and how much money each side is.
 *
 * Both at once, whatever the list is filtered to: each side is a card that
 * filters to it, and "50 of 2,000" needs the size of whichever side is on
 * screen. Its own call for the reason `usePaymentLogTotals` is — a page of 50
 * cannot count the other 2,000.
 */
export function useBankTransferReceiptCounts(
  academyId: string | null,
  search: string,
) {
  return useQuery({
    queryKey: ['bank-transfer-receipt-counts', academyId, search] as const,
    enabled: !!academyId,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('bank_transfer_receipt_counts', {
        _academy: academyId!,
        ...(search.trim() ? { _search: search.trim() } : {}),
      })
      if (error) throw error
      const row = (data as unknown as CountsRow[] | null)?.[0]
      return {
        pending: Number(row?.pending_count ?? 0),
        pendingSen: Number(row?.pending_sen ?? 0),
        uploaded: Number(row?.uploaded_count ?? 0),
        uploadedSen: Number(row?.uploaded_sen ?? 0),
      }
    },
  })
}

/**
 * Attach (or replace) a payment's receipt.
 *
 * The row leaves pending and the two counts swap one between them — and the
 * payment becomes collected, which is why success refetches everything.
 */
export function useUploadPaymentReceipt() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ paymentId, file }: { paymentId: string; file: File }) =>
      uploadPaymentReceipt(paymentId, file),
    // Everything, not a list of keys. A receipt is what turns a bank transfer
    // into collected money, so uploading one moves every figure in the money
    // section — tiles, cards, the report, the invoice, the dashboard — and a
    // key left off that list would be a stale total on a money screen.
    onSuccess: () => {
      void qc.invalidateQueries()
    },
  })
}

/** What the file picker offers. The function and the bucket both re-check. */
export const RECEIPT_ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp'

/**
 * One hidden file input for a whole screen of payments.
 *
 * Both screens that take a receipt — the receipts queue and the invoice page —
 * list several payments, and only one of them can be choosing a file at a
 * time. So the screen mounts a single `<input {...inputProps} />`, each row's
 * button calls `pick(paymentId)`, and the file that comes back belongs to
 * whichever payment asked last.
 *
 * `uploadingId` is the payment whose upload is in flight, so its row can say
 * so; `error` is the last upload's failure, in the function's own words.
 */
export function useReceiptPicker() {
  const upload = useUploadPaymentReceipt()
  const input = useRef<HTMLInputElement>(null)
  const target = useRef<string | null>(null)
  const { mutate } = upload

  const pick = useCallback((paymentId: string) => {
    target.current = paymentId
    input.current?.click()
  }, [])

  const onChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      // Cleared so choosing the same file again — after an error, say — still
      // fires a change.
      e.target.value = ''
      if (!file || !target.current) return
      mutate({ paymentId: target.current, file })
    },
    [mutate],
  )

  return {
    pick,
    busy: upload.isPending,
    uploadingId: upload.isPending ? (upload.variables?.paymentId ?? null) : null,
    error: upload.error,
    inputProps: {
      ref: input,
      type: 'file' as const,
      accept: RECEIPT_ACCEPT,
      className: 'hidden',
      onChange,
    },
  }
}

/**
 * Open a receipt in a new tab. Not a query: the signed URL lives 60 seconds,
 * so a cached one is mostly an expired one.
 */
export function useOpenPaymentReceipt() {
  return useMutation({
    mutationFn: async (paymentId: string) => {
      const url = await paymentReceiptUrl(paymentId)
      // noopener: the signed URL is a bearer token in a query string, and
      // window.opener would hand the new tab a reference back to this one.
      window.open(url, '_blank', 'noopener,noreferrer')
      return url
    },
  })
}
