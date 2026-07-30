/** Learner account surfaces: the billing list, one invoice, the editable profile. */
export const learnAccount = {
  // Billing list
  'lacct.billing.title': 'Billing',
  'lacct.billing.description': 'Your invoices and payments.',
  'lacct.billing.no_record_detail': 'There is nothing to bill yet.',
  'lacct.billing.empty': 'You don’t have any invoices yet.',
  'lacct.billing.documents': 'Documents',

  // Money labels (stat tiles and the invoice summary read the same words)
  'lacct.amount.billed': 'Billed',
  'lacct.amount.paid': 'Paid',
  'lacct.amount.outstanding': 'Outstanding',
  'lacct.amount.subtotal': 'Subtotal',
  'lacct.amount.tax': 'Tax / SST',
  'lacct.amount.balance': 'Balance',

  // Table columns
  'lacct.col.invoice': 'Invoice',
  'lacct.col.qty': 'Qty',
  'lacct.col.unit': 'Unit',

  // One invoice
  'lacct.invoice.not_available': 'This invoice isn’t available to you.',
  'lacct.invoice.back': 'Back to billing',
  'lacct.invoice.course': 'Course · {title}',
  'lacct.invoice.dates': 'Issued {issued} · Due {due}',
  'lacct.invoice.pay_online': 'Pay online',
  'lacct.invoice.items': 'Items',
  'lacct.invoice.no_items': 'No line items.',
  'lacct.invoice.summary': 'Summary',
  'lacct.invoice.payments': 'Payments',
  'lacct.invoice.no_payments': 'No payments recorded yet.',

  // Invoice status badge. `draft` and `overdue` reuse the common keys; only the
  // states common has no word for are defined here.
  'lacct.invoice_status.issued': 'Issued',
  'lacct.invoice_status.partially_paid': 'Partially paid',
  'lacct.invoice_status.paid': 'Paid',
  'lacct.invoice_status.void': 'Void',
  'lacct.invoice_status.cancelled': 'Cancelled',

  // How a recorded payment was made
  'lacct.method.cash': 'Cash',
  'lacct.method.bank_transfer': 'Bank transfer',
  'lacct.method.fpx': 'FPX',
  'lacct.method.card': 'Card',
  'lacct.method.ewallet': 'E-wallet',
  'lacct.method.other': 'Other',

  // Profile
  'lacct.profile.title': 'My profile',
  'lacct.profile.description':
    'Your account details, and the record your academy holds for you.',
  'lacct.profile.account': 'Account',
  'lacct.profile.name_placeholder': 'Your name',
  'lacct.profile.email_locked':
    'Your sign-in email can’t be changed here — ask your academy if it needs updating.',
  'lacct.profile.save_changes': 'Save changes',
  'lacct.profile.save_failed': 'Could not save your profile.',

  // Profile → the record the academy holds
  'lacct.profile.record': 'Academy record',
  'lacct.profile.academy': 'Academy',
  'lacct.profile.student_no': 'Student number',
  'lacct.profile.email_on_record': 'Email on record',
  'lacct.profile.phone_on_record': 'Phone on record',
  'lacct.profile.joined': 'Joined',
  'lacct.profile.managed_by_academy':
    'Managed by your academy — ask them to update these.',
  'lacct.profile.no_record':
    'No student record is linked to your account in {academy} yet.',
} as const

export type LearnAccountDict = Record<keyof typeof learnAccount, string>
