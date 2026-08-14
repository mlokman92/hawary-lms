import type { Enums } from '@hawary/shared'
import type { TKey } from '@/lib/i18n'

type Variant = 'default' | 'secondary' | 'outline' | 'destructive'

/**
 * Payout status → badge. The label is a translation key, not a string: this map
 * is a module constant built before any language is known, while every surface
 * that renders it (the batch page, the learner's billing list) has a `t`.
 *
 * `processing` is Billplz holding the money, not a finished transfer, so it
 * reads as in-flight; `failed` covers a refund, which is money that came back.
 */
export const PAYOUT_STATUS_META: Record<
  Enums<'incentive_payout_status'>,
  { labelKey: TKey; variant: Variant }
> = {
  pending: { labelKey: 'incentives.payout_status.pending', variant: 'outline' },
  sending: {
    labelKey: 'incentives.payout_status.sending',
    variant: 'secondary',
  },
  processing: {
    labelKey: 'incentives.payout_status.processing',
    variant: 'secondary',
  },
  completed: {
    labelKey: 'incentives.payout_status.completed',
    variant: 'default',
  },
  failed: {
    labelKey: 'incentives.payout_status.failed',
    variant: 'destructive',
  },
  cancelled: {
    labelKey: 'incentives.payout_status.cancelled',
    variant: 'outline',
  },
}

/** Batch status → badge, in the same shape and for the same reason. */
export const BATCH_STATUS_META: Record<
  Enums<'incentive_batch_status'>,
  { labelKey: TKey; variant: Variant }
> = {
  draft: { labelKey: 'common.draft', variant: 'outline' },
  sending: { labelKey: 'incentives.batch_status.sending', variant: 'secondary' },
  sent: { labelKey: 'incentives.batch_status.sent', variant: 'default' },
  cancelled: {
    labelKey: 'incentives.batch_status.cancelled',
    variant: 'outline',
  },
}
