import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Enums, Tables } from '@hawary/shared'
import { useT, type TFn } from '@/lib/i18n'
import { supabase } from '@/lib/supabase'

export type IncentiveBatch = Tables<'incentive_batches'>
export type IncentivePayout = Tables<'incentive_payouts'>
export type BatchStatus = Enums<'incentive_batch_status'>
export type PayoutStatus = Enums<'incentive_payout_status'>

/** A batch as the list renders it — the recipient count arrives as an embedded
 *  count rather than a query per row. */
export type IncentiveBatchRow = IncentiveBatch & { recipients: number }

/**
 * A payout as the client is allowed to see it. `bank_account_number` is
 * deliberately absent from the Pick — it exists to be sent to Billplz, never to
 * be rendered, and `bank_account_last4` is what the table shows.
 */
export type IncentivePayoutRow = Pick<
  IncentivePayout,
  | 'id'
  | 'batch_id'
  | 'student_id'
  | 'amount_sen'
  | 'status'
  | 'provider_status'
  | 'failure_reason'
  | 'sent_at'
  | 'completed_at'
  | 'created_at'
  | 'bank_code'
  | 'bank_account_last4'
  | 'billplz_payment_order_id'
> & {
  students: { full_name: string | null; student_no: string } | null
}

/**
 * A row of `incentive_candidates`.
 *
 * Declared here rather than taken from the generated RPC type: the generator
 * cannot know which RETURNS TABLE columns are nullable, and `bank_code` /
 * `masked_account` are null for exactly the students the picker has to grey
 * out. `masked_account` arrives already masked — a full account number is never
 * returned in bulk.
 */
export type IncentiveCandidate = {
  student_id: string
  full_name: string | null
  student_no: string
  email: string | null
  status: Enums<'student_status'>
  has_bank: boolean
  bank_code: string | null
  masked_account: string | null
}

const listKey = (academyId: string | null) =>
  ['incentive-batches', academyId] as const
const oneKey = (id: string) => ['incentive-batch', id] as const
const payoutsKey = (batchId: string) => ['incentive-payouts', batchId] as const
const candidatesKey = (academyId: string | null, courseId: string | null) =>
  ['incentive-candidates', academyId, courseId] as const

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export function useIncentiveBatches(academyId: string | null) {
  return useQuery({
    queryKey: listKey(academyId),
    enabled: !!academyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('incentive_batches')
        .select('*, payouts:incentive_payouts(count)')
        .eq('academy_id', academyId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      const rows = (data ?? []) as unknown as (IncentiveBatch & {
        payouts: { count: number }[] | null
      })[]
      return rows.map(({ payouts, ...batch }) => ({
        ...batch,
        recipients: payouts?.[0]?.count ?? 0,
      })) as IncentiveBatchRow[]
    },
  })
}

export function useIncentiveBatch(id: string | undefined) {
  return useQuery({
    queryKey: oneKey(id ?? ''),
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('incentive_batches')
        .select('*')
        .eq('id', id!)
        .maybeSingle()
      if (error) throw error
      return (data ?? null) as IncentiveBatch | null
    },
  })
}

export function useIncentivePayouts(batchId: string | undefined) {
  return useQuery({
    queryKey: payoutsKey(batchId ?? ''),
    enabled: !!batchId,
    queryFn: async () => {
      // An explicit projection, NOT `*`: the snapshot carries the recipient's
      // full account number, and `*` would ship every one of them to the
      // browser to render four masked digits. `bank_account_last4` is a
      // generated column for exactly this — the same rule that made
      // `incentive_candidates` an RPC.
      const { data, error } = await supabase
        .from('incentive_payouts')
        .select(
          'id, batch_id, student_id, amount_sen, status, provider_status,' +
            ' failure_reason, sent_at, completed_at, created_at,' +
            ' bank_code, bank_account_last4, billplz_payment_order_id,' +
            ' students(full_name, student_no)',
        )
        .eq('batch_id', batchId!)
        .order('created_at')
      if (error) throw error
      return (data ?? []) as unknown as IncentivePayoutRow[]
    },
  })
}

/** Who could be paid: every unarchived student, optionally narrowed to one
 *  course's active enrolments. */
export function useIncentiveCandidates(
  academyId: string | null,
  courseId: string | null,
) {
  return useQuery({
    queryKey: candidatesKey(academyId, courseId),
    enabled: !!academyId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('incentive_candidates', {
        _academy: academyId!,
        // Omitted rather than null: the RPC's own default is "every student".
        ...(courseId ? { _course: courseId } : {}),
      })
      if (error) throw error
      return (data ?? []) as unknown as IncentiveCandidate[]
    },
  })
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export function useCreateIncentiveBatch(academyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      title: string
      description: string
      amountSen: number
    }) => {
      const { data, error } = await supabase.rpc('create_incentive_batch', {
        _academy: academyId,
        _title: input.title,
        _description: input.description,
        _amount_sen: input.amountSen,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: listKey(academyId) }),
  })
}

export type SetRecipientsResult = { recipients: number; skipped: number }

/** Replaces the batch's whole recipient list (draft only, enforced in the RPC). */
export function useSetIncentiveRecipients(batchId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (studentIds: string[]) => {
      const { data, error } = await supabase.rpc('set_incentive_recipients', {
        _batch: batchId,
        _student_ids: studentIds,
      })
      if (error) throw error
      return data as unknown as SetRecipientsResult
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: payoutsKey(batchId) })
      void qc.invalidateQueries({ queryKey: ['incentive-batches'] })
      // The RPC drops anyone whose bank details vanished, so the picker's own
      // `has_bank` flags are stale the moment it returns.
      void qc.invalidateQueries({ queryKey: ['incentive-candidates'] })
    },
  })
}

export function useDeleteIncentiveBatch(academyId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (batchId: string) => {
      const { error } = await supabase.rpc('delete_incentive_batch', {
        _batch: batchId,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: listKey(academyId) }),
  })
}

// ---------------------------------------------------------------------------
// Disbursement
// ---------------------------------------------------------------------------

export type DisburseCode =
  | 'insufficient_funds'
  | 'not_configured'
  | 'no_recipients'

type DisburseOk = {
  ok: true
  processed: number
  failed: number
  remaining: number
  batch_status: BatchStatus
}
type DisburseFail = {
  ok: false
  code?: DisburseCode
  message?: string
  processed?: number
  remaining?: number
}
type DisburseResponse = DisburseOk | DisburseFail

/**
 * One invocation sends at most 25 payouts, so a batch is walked in passes. The
 * bound is here so a server that keeps reporting work left cannot spin the
 * browser forever: 40 passes is 1000 recipients, past any real intake, and what
 * is left after it is still resumable by hand.
 */
const MAX_PASSES = 40

/**
 * Same technique as `features/settings/api.ts`: a non-2xx Edge Function reply
 * reaches the client as an error whose `context` is the raw Response, so the
 * server's own message is only readable by parsing it. Duplicated rather than
 * shared — it is four lines and it belongs next to the invoke it explains.
 */
async function readFunctionError(error: unknown): Promise<string | null> {
  const ctx = (error as { context?: unknown })?.context
  if (ctx && typeof (ctx as Response).json === 'function') {
    try {
      const parsed = (await (ctx as Response).json()) as {
        error?: string
        message?: string
      }
      return parsed.error ?? parsed.message ?? null
    } catch {
      return null
    }
  }
  return null
}

/** A refused run gets its own sentence: the three codes each need a different
 *  thing done about them, and "something went wrong" names none of them. */
function disburseMessage(res: DisburseFail, t: TFn): string {
  switch (res.code) {
    case 'insufficient_funds':
      return t('incentives.error.insufficient_funds')
    case 'not_configured':
      return t('incentives.error.not_configured')
    case 'no_recipients':
      return t('incentives.error.no_recipients')
    default:
      return res.message ?? t('incentives.error.send_failed')
  }
}

/**
 * Send the batch, resuming until nothing is pending.
 *
 * The payout query is invalidated between passes rather than only at the end,
 * so the table fills in while the run is going — a large batch is minutes of
 * sequential Billplz calls, and a screen that shows nothing until it finishes
 * reads as a hang. A refusal stops the loop at once: an insufficient payment
 * limit will not fix itself on the next pass.
 */
export function useDisburse(batchId: string) {
  const qc = useQueryClient()
  const { t } = useT()
  return useMutation({
    mutationFn: async () => {
      let processed = 0
      let failed = 0
      let remaining = 0
      let batchStatus: BatchStatus = 'sending'

      for (let pass = 0; pass < MAX_PASSES; pass++) {
        const { data, error } =
          await supabase.functions.invoke<DisburseResponse>('billplz-disburse', {
            body: { batch_id: batchId },
          })
        if (error) {
          await qc.invalidateQueries({ queryKey: payoutsKey(batchId) })
          const body = await readFunctionError(error)
          throw new Error(
            body ??
              (error instanceof Error
                ? error.message
                : t('incentives.error.send_failed')),
          )
        }
        if (!data) throw new Error(t('incentives.error.no_response'))
        if (!data.ok) {
          // Whatever this pass did send is real money moved: show it before the
          // error, not after the admin thinks to reload.
          await qc.invalidateQueries({ queryKey: payoutsKey(batchId) })
          throw new Error(disburseMessage(data, t))
        }

        processed += data.processed
        failed += data.failed
        remaining = data.remaining
        batchStatus = data.batch_status
        await qc.invalidateQueries({ queryKey: payoutsKey(batchId) })
        if (remaining <= 0) break
        // No progress but work outstanding means the rows left are claimed by a
        // run that died and are still inside their 15-minute lease. Looping
        // would just spin until MAX_PASSES; stop and let the admin resume once
        // the lease expires. `remaining` is returned either way, so the Resume
        // button stays and the batch does not read as sent.
        if (data.processed === 0 && data.failed === 0) break
      }

      return { processed, failed, remaining, batchStatus }
    },
    // Settled, not success: a run that stopped on insufficient funds still
    // moved the batch out of draft, and the page reads that off the batch row.
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: oneKey(batchId) })
      void qc.invalidateQueries({ queryKey: ['incentive-batches'] })
    },
  })
}

export type PayoutStatusResult = {
  ok: boolean
  checked: number
  updated: number
  remaining_open: number
}

/** Re-query Billplz for every payout still in flight. The callback is a fast
 *  path; this is what settlement is actually judged on. */
export function useRefreshPayoutStatus(batchId: string) {
  const qc = useQueryClient()
  const { t } = useT()
  return useMutation({
    mutationFn: async () => {
      let checked = 0
      let updated = 0
      let remainingOpen = 0
      // How many rows were open when we started. The function reconciles a
      // capped number per invocation, least-recently-checked first, so one
      // click could never settle a batch of hundreds — but it also means the
      // window rotates: keep going until we have checked as many rows as were
      // open, i.e. walked the whole set once. Looping on `remaining_open`
      // alone would re-check the same rows forever whenever Billplz is simply
      // still working on them.
      let toWalk = Infinity

      for (let pass = 0; pass < MAX_PASSES; pass++) {
        const { data, error } =
          await supabase.functions.invoke<PayoutStatusResult>(
            'billplz-payout-status',
            { body: { batch_id: batchId } },
          )
        if (error) {
          const body = await readFunctionError(error)
          throw new Error(
            body ??
              (error instanceof Error
                ? error.message
                : t('incentives.error.refresh_failed')),
          )
        }
        if (!data) throw new Error(t('incentives.error.no_response'))

        checked += data.checked
        updated += data.updated
        remainingOpen = data.remaining_open
        // Set on the first pass only: what was outstanding when the admin
        // clicked. Rows that settle along the way shrink `remaining_open`, they
        // do not add work.
        if (toWalk === Infinity) toWalk = data.checked + data.remaining_open
        await qc.invalidateQueries({ queryKey: payoutsKey(batchId) })
        // Nothing left open, nothing came back (Billplz unreachable), or we
        // have now looked at every row that was open when we started.
        if (remainingOpen <= 0 || data.checked === 0 || checked >= toWalk) break
      }

      return { ok: true, checked, updated, remaining_open: remainingOpen }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: payoutsKey(batchId) })
      void qc.invalidateQueries({ queryKey: oneKey(batchId) })
    },
  })
}
