import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Tables, TablesUpdate } from '@hawary/shared'
import { translate } from '@/lib/i18n'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/errors'

/** Non-secret gateway metadata. The secret key itself lives in Vault and is
 *  never selectable from the client — only `has_secret` / `last4` are exposed. */
export type PaymentSettings = Tables<'academy_payment_settings'>

const settingsKey = (academyId: string | null) =>
  ['payment-settings', academyId] as const

export function usePaymentSettings(academyId: string | null) {
  return useQuery({
    queryKey: settingsKey(academyId),
    enabled: !!academyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('academy_payment_settings')
        .select('*')
        .eq('academy_id', academyId!)
        .maybeSingle()
      if (error) throw error
      return (data ?? null) as PaymentSettings | null
    },
  })
}

/**
 * Result of the `toyyibpay-connect` edge function. `ok: false` with a `code`
 * is a soft outcome the UI surfaces inline (bad key, category creation failed).
 */
export type ConnectResult = {
  ok: boolean
  has_secret?: boolean
  last4?: string
  category_code?: string
  is_sandbox?: boolean
  enabled?: boolean
  code?: 'category_failed'
  message?: string
}

/** Save/replace the ToyyibPay secret key (server-side: verifies key, provisions
 *  a category, stores the secret in Vault). The key never round-trips back. */
export function useSaveToyyibpay(academyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      secretKey: string
      isSandbox: boolean
      categoryCode?: string
    }) => {
      const { data, error } = await supabase.functions.invoke<ConnectResult>(
        'toyyibpay-connect',
        {
          body: {
            academy_id: academyId,
            secret_key: input.secretKey,
            is_sandbox: input.isSandbox,
            category_code: input.categoryCode || undefined,
          },
        },
      )
      if (error) {
        const body = await readFunctionError(error)
        throw new Error(
          body ??
            errorMessage(
              error,
              translate('settings.toyyibpay.error.save_failed'),
            ),
        )
      }
      return (data ?? {
        ok: false,
        message: translate('settings.toyyibpay.error.no_response'),
      }) as ConnectResult
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKey(academyId) }),
  })
}

/** Remove the stored ToyyibPay key (deletes the Vault secret + clears metadata). */
export function useRemoveToyyibpay(academyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('remove_toyyibpay_credentials', {
        _academy: academyId,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKey(academyId) }),
  })
}

/**
 * A direct `academy_payment_settings` update, Director-gated by RLS. A refused
 * UPDATE is not an error to PostgREST — it matches no rows — so the returned
 * rows are what tells a save from a silent no-op.
 */
async function updatePaymentSettings(
  academyId: string,
  patch: TablesUpdate<'academy_payment_settings'>,
) {
  const { data, error } = await supabase
    .from('academy_payment_settings')
    .update(patch)
    .eq('academy_id', academyId)
    .select('academy_id')
  if (error) throw error
  if (!data?.length) throw new Error(translate('common.error'))
}

/** Toggle whether students can pay online. */
export function useSetGatewayEnabled(academyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (enabled: boolean) => {
      await updatePaymentSettings(academyId, { toyyibpay_enabled: enabled })
      return enabled
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKey(academyId) }),
  })
}

/**
 * Toggle the academy's *default* for who absorbs the ToyyibPay FPX charge.
 *
 * Only a default: each invoice carries its own `charge_to_payor`, and
 * `create-bill` reads `invoice.charge_to_payor ?? this`. Flipping it therefore
 * changes future invoices left on "follow the default", never a bill a payer has
 * already been shown.
 */
export function useSetChargeToPayor(academyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (chargeToPayor: boolean) => {
      await updatePaymentSettings(academyId, {
        toyyibpay_charge_to_payor: chargeToPayor,
      })
      return chargeToPayor
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKey(academyId) }),
  })
}

/**
 * The academy's *default* instalment terms.
 *
 * Same two-level shape as `useSetChargeToPayor`: each invoice carries its own
 * `allow_partial_payment`, and `create-bill` reads `invoice ?? this`. An
 * invoice that says true or false keeps saying it — only one left NULL follows
 * this, so flipping it never re-prices a bill a payer has already been shown.
 *
 * The minimum is stored as NULL when blank, which is how "no floor of our own,
 * use ToyyibPay's RM1.00" is represented; the CHECK constraint rejects anything
 * under 100 sen.
 */
export function useSetPartialDefault(academyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      allowPartial: boolean
      minPartialSen: number | null
    }) => {
      await updatePaymentSettings(academyId, {
        allow_partial_payment: input.allowPartial,
        min_partial_sen: input.allowPartial ? input.minPartialSen : null,
      })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKey(academyId) }),
  })
}

/**
 * Result of the `billplz-connect` edge function. `ok: false` with a `code` is a
 * soft outcome rendered inline (the keys did not verify). `limit_sen` is the
 * Payment Order Limit — the prefunded balance a disbursement draws down — and
 * only ever arrives here, since verifying the keys is the call that reads it.
 */
export type BillplzConnectResult = {
  ok: boolean
  last4?: string
  is_sandbox?: boolean
  enabled?: boolean
  limit_sen?: number
  code?: 'verify_failed'
  message?: string
}

/** Save/replace the Billplz disbursement keys (server-side: verifies both keys
 *  against `GET /payment_order_limit`, stores them in Vault). Neither key
 *  round-trips back. */
export function useSaveBillplz(academyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      secretKey: string
      xSignatureKey: string
      isSandbox: boolean
    }) => {
      const { data, error } =
        await supabase.functions.invoke<BillplzConnectResult>(
          'billplz-connect',
          {
            body: {
              academy_id: academyId,
              secret_key: input.secretKey,
              x_signature_key: input.xSignatureKey,
              is_sandbox: input.isSandbox,
            },
          },
        )
      if (error) {
        const body = await readFunctionError(error)
        throw new Error(
          body ??
            errorMessage(
              error,
              translate('settings.billplz.error.save_failed'),
            ),
        )
      }
      return (data ?? {
        ok: false,
        message: translate('settings.billplz.error.no_response'),
      }) as BillplzConnectResult
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKey(academyId) }),
  })
}

/** Remove the stored Billplz keys (deletes both Vault secrets + clears metadata). */
export function useRemoveBillplz(academyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('remove_billplz_credentials', {
        _academy: academyId,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKey(academyId) }),
  })
}

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
