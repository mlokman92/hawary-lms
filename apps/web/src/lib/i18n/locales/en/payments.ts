/** Back-office payments: invoice list, invoice detail, invoice + payment forms, pay link. */
export const payments = {
  // List page
  'payments.title': 'Payments',
  'payments.subtitle': 'Invoice students and track collections.',
  'payments.new_invoice': 'New invoice',

  // Course filter (list page)
  'payments.filter.all_courses': 'All courses',
  'payments.filter.no_course': 'No course',
  'payments.filter.published_only': 'Published only',
  'payments.filter.show_all': 'Show all ({count} unpublished)',
  'payments.course_status.archived': 'Archived',

  // Stats
  'payments.stat.invoiced': 'Total invoiced',
  'payments.stat.collected': 'Collected',
  'payments.stat.outstanding': 'Outstanding',

  // Records table
  'payments.records.heading': 'Payment records',
  'payments.table.invoice': 'Invoice',
  'payments.empty.none': 'No invoices yet.',
  'payments.empty.create_first': 'Create your first invoice',
  'payments.empty.no_match': 'No invoices for this course.',

  // Invoice status badge (draft → common.draft, overdue → common.overdue)
  'payments.status.issued': 'Issued',
  'payments.status.partially_paid': 'Partially paid',
  'payments.status.paid': 'Paid',
  'payments.status.void': 'Void',
  'payments.status.cancelled': 'Cancelled',

  // Money labels, shared by the table and the invoice summary
  'payments.amount.subtotal': 'Subtotal',
  'payments.amount.tax': 'Tax / SST',
  'payments.amount.paid': 'Paid',
  'payments.amount.balance': 'Balance',

  // Invoice detail
  'payments.detail.not_found': 'Invoice not found.',
  'payments.detail.back': 'Back to payments',
  'payments.detail.course': 'Course · {title}',
  'payments.detail.dates': 'Issued {issued} · Due {due}',
  'payments.detail.void': 'Void',
  'payments.detail.void_confirm_title': 'Void this invoice?',
  'payments.detail.void_confirm_body':
    '{invoice} will be marked void. Recorded payments are kept for your records.',
  'payments.detail.void_action': 'Void invoice',
  'payments.detail.items': 'Items',
  'payments.detail.qty': 'Qty',
  'payments.detail.unit': 'Unit',
  'payments.detail.no_items': 'No line items.',
  'payments.detail.summary': 'Summary',
  'payments.detail.no_payments': 'No payments recorded yet.',

  // New-invoice dialog
  'payments.form.description':
    'Pick recipients on the left; each gets their own invoice with an auto-generated number.',
  'payments.form.recipients': 'Recipients',
  'payments.form.selected': '{count} selected',
  'payments.form.all_students': 'All students (no course)',
  'payments.form.course_hint_none':
    'Pick a course to bill its students and tag these invoices.',
  'payments.form.course_hint_selected':
    'These invoices will be tagged with this course.',
  'payments.form.show_published_only': 'Show published only',
  'payments.form.show_all_courses': 'Show all courses ({count} unpublished)',
  'payments.form.search_placeholder': 'Search name, email, or ID',
  'payments.form.remove_recipient': 'Remove {name}',
  'payments.form.matches_one': '{count} student',
  'payments.form.matches_other': '{count} students',
  'payments.form.select_all': 'Select all',
  'payments.form.no_matches': 'No students match.',
  'payments.form.truncated':
    'Showing first {count} — refine your search to narrow the list.',
  'payments.form.line_items': 'Line items',
  'payments.form.quantity': 'Quantity',
  'payments.form.unit_price': 'Unit price',
  'payments.form.unit_placeholder': 'Unit (RM)',
  'payments.form.remove_item': 'Remove item',
  'payments.form.add_item': 'Add item',
  'payments.form.due_date': 'Due date (optional)',
  'payments.form.tax': 'Tax / SST (RM, optional)',
  'payments.form.notes': 'Notes (optional)',
  'payments.form.charge_to_payor': 'Payor pays the ToyyibPay charge',
  'payments.form.charge_to_payor.hint':
    'Adds ToyyibPay’s {amount} FPX charge on top when the student pays online, so you receive the full amount. Starts from your settings default.',
  'payments.form.per_student_one': '{amount} × {count} student',
  'payments.form.per_student_other': '{amount} × {count} students',
  'payments.form.grand_total': 'Total {amount}',
  'payments.form.submit': 'Create invoice',
  'payments.form.submit_many': 'Create {count} invoices',
  'payments.form.error_no_student': 'Select at least one student.',
  'payments.form.error_no_amount': 'Add at least one line item with an amount.',

  // Record-payment dialog
  'payments.record.title': 'Record payment',
  'payments.record.balance_due': 'Balance due: {amount}',
  'payments.record.amount': 'Amount (RM)',
  'payments.record.method': 'Method',
  'payments.record.submitting': 'Recording…',
  'payments.record.error_amount': 'Enter an amount greater than zero.',

  // Payment methods
  'payments.method.cash': 'Cash',
  'payments.method.bank_transfer': 'Bank transfer',
  'payments.method.fpx': 'FPX',
  'payments.method.card': 'Card',
  'payments.method.ewallet': 'E-wallet',
  'payments.method.other': 'Other',

  // Pay link card (ToyyibPay)
  'payments.pay_link.title': 'Online payment',
  'payments.pay_link.disabled': 'Online payments aren’t set up.',
  'payments.pay_link.connect': 'Connect ToyyibPay in Settings',
  'payments.pay_link.disabled_suffix':
    'to let students pay this invoice via FPX.',
  'payments.pay_link.not_payable':
    'This invoice can’t be paid online (it’s settled or void).',
  'payments.pay_link.intro':
    'Share a secure link so the student can pay online via FPX.',
  'payments.pay_link.email': 'Email to student',
  'payments.pay_link.check': 'Check payment status',
  'payments.pay_link.checking': 'Checking…',
  'payments.pay_link.preview': 'Preview',
  'payments.pay_link.create': 'Create pay link',
  'payments.pay_link.sent': 'Sent.',
  'payments.pay_link.sent_to': 'Sent to {email}.',
  'payments.pay_link.send_failed':
    'Email couldn’t be sent — copy the link instead.',
  'payments.pay_link.confirmed': 'Payment confirmed — invoice marked paid.',
  'payments.pay_link.not_found_yet':
    'No completed payment found yet. If the student just paid, wait a moment and check again.',
  'payments.pay_link.error_create': 'Could not create a link.',
  'payments.pay_link.error_check': 'Could not check status.',

  // Errors raised by the data layer (features/payments/api.ts)
  'payments.error.email_failed': 'Could not send email.',
  'payments.error.no_response': 'No response from server.',
  'payments.error.start_payment': 'Could not start payment.',
  'payments.error.check_status': 'Could not check payment status.',
} as const

export type PaymentsDict = Record<keyof typeof payments, string>
