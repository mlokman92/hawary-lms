/** Public (signed-out) pay-by-link page and its post-gateway result page. */
export const pay = {
  // Invoice card
  'pay.invoice_no': 'Invoice {no}',
  'pay.amount_due': 'Amount due',
  'pay.partially_paid': '{paid} of {total} paid',
  'pay.fully_paid': 'This invoice is fully paid. Thank you!',

  // Pay action
  'pay.charge_notice':
    'A {fee} FPX charge is added at checkout — {total} will be debited.',
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
