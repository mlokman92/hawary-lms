import {
  keepPreviousData,
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

const pageKey = (
  academyId: string | null,
  state: ReceiptState | null,
  search: string,
  page: number,
) => ['bank-transfer-receipts', academyId, state ?? '', search, page] as const

/** One page of bank transfers, newest-recorded first. */
export function useBankTransferReceipts(
  academyId: string | null,
  state: ReceiptState | null,
  search: string,
  page: number,
) {
  return useQuery({
    queryKey: pageKey(academyId, state, search, page),
    enabled: !!academyId,
    // Without this an upload — which takes the row off the pending list —
    // blanks the table through the empty state while the page refetches.
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('bank_transfer_receipts_page', {
        _academy: academyId!,
        ...(state ? { _state: state } : {}),
        ...(search.trim() ? { _search: search.trim() } : {}),
        _limit: RECEIPT_PAGE_SIZE,
        _offset: (page - 1) * RECEIPT_PAGE_SIZE,
      })
      if (error) throw error
      return (data ?? []) as unknown as BankTransferRow[]
    },
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
 * Both at once, whatever the list is filtered to: the filter shows each count
 * beside its name, and the pager needs the size of whichever side is on
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
 * Both lists move on success: the row leaves pending, and the two counts swap
 * one between them. Invalidated by prefix because every state, search and page
 * is its own cache entry and any of them may now be wrong.
 */
export function useUploadPaymentReceipt() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ paymentId, file }: { paymentId: string; file: File }) =>
      uploadPaymentReceipt(paymentId, file),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['bank-transfer-receipts'] })
      void qc.invalidateQueries({ queryKey: ['bank-transfer-receipt-counts'] })
    },
  })
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
