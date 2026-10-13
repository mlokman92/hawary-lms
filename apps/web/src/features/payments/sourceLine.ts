import type { TFn } from '@/lib/i18n'
import { PAYMENT_PROVIDER_LABEL, type PaymentLogRow } from './api'

/**
 * Where a payment came from, in one line.
 *
 * A gateway names itself and its reference; a manual entry names the person who
 * typed it, because that is the only accountability a cash payment has. Falls
 * back to "Recorded manually" when nobody is named — true of every gateway row
 * (a callback wrote it) and of any manual row banked before the column existed.
 */
export function sourceLine(
  p: Pick<PaymentLogRow, 'provider' | 'provider_ref' | 'recorded_by_name'>,
  t: TFn,
): string {
  const gateway = PAYMENT_PROVIDER_LABEL[p.provider]
  if (gateway) return p.provider_ref ? `${gateway} · ${p.provider_ref}` : gateway
  const who = p.recorded_by_name?.trim()
  return who
    ? t('payments.log.recorded_by', { name: who })
    : t('payments.log.recorded_manually')
}
