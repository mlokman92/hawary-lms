/** Public (signed-out) pay-by-link page and its post-gateway result page. */
export const pay = {
  // Invoice card
  'pay.invoice_no': 'Invoice {no}',
  'pay.amount_due': 'Amount due',
  'pay.partially_paid': '{paid} of {total} paid',
  'pay.fully_paid': 'This invoice is fully paid. Thank you!',

  // Choosing how much to pay (only when the invoice allows part payment)
  'pay.amount.full': 'Pay in full',
  'pay.amount.part': 'Pay part of it',
  'pay.amount.part_hint': 'Choose an amount',
  'pay.amount.label': 'Amount to pay (RM)',
  'pay.amount.remaining':
    'From {min}. {remaining} will still be outstanding after this payment.',
  'pay.amount.error_required': 'Enter an amount.',
  'pay.amount.error_min': 'The smallest payment accepted is {min}.',
  'pay.amount.error_max': 'That’s more than the {max} outstanding.',

  // Pay action
  'pay.charge_notice':
    'A {fee} FPX charge is added at checkout — {total} will be debited.',
  'pay.charge_notice_each':
    'A {fee} FPX charge is added to each payment — {total} will be debited.',
  'pay.pay_with_fpx': 'Pay {amount} with FPX',
  'pay.starting': 'Starting…',
  'pay.secured_by': 'Secured by ToyyibPay',

  // Link / gateway problems
  'pay.unavailable.title': 'Invoice unavailable',
  'pay.unavailable.body':
    'This payment link is invalid, expired, or already settled. Please contact the academy for help.',
  'pay.offline_only':
    'Online payment isn’t available for this invoice. Please contact {academy} to arrange payment.',
  'pay.error.not_configured':
    'Online payment isn’t set up for this invoice yet.',
  'pay.error.start_failed': 'Could not start the payment. Please try again.',

  // Result page
  'pay.result.title': 'Payment',
  'pay.result.confirming': 'Confirming your payment…',
  'pay.result.confirming_hint': 'This can take a few moments after you pay.',
  'pay.result.paid': 'Payment received',
  'pay.result.paid_body': 'Thank you! Your payment has been confirmed.',
  'pay.result.failed': 'Payment not completed',
  'pay.result.failed_body': 'The payment didn’t go through. You can try again.',
  'pay.result.back_to_invoice': 'Back to invoice',
} as const

export type PayDict = Record<keyof typeof pay, string>
