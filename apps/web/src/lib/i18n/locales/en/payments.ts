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
  'payments.empty.no_match': 'No invoices match.',

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
  'payments.detail.all_payments': 'All payments',

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

  // Payment status — the payment row's own outcome, not the invoice's
  'payments.pstatus.pending': 'Pending',
  'payments.pstatus.succeeded': 'Succeeded',
  'payments.pstatus.failed': 'Failed',
  'payments.pstatus.refunded': 'Refunded',

  // Payment log (/payments/log) — the money-in ledger
  'payments.log.title': 'Payment log',
  'payments.log.subtitle': 'Every payment received, newest first.',
  'payments.log.search_placeholder': 'Search student, invoice, or reference',
  'payments.log.all_statuses': 'All statuses',
  'payments.log.method': 'Method',
  'payments.log.reference': 'Reference',
  'payments.log.recorded_manually': 'Recorded manually',
  'payments.log.recorded_at': 'Recorded {when}',
  'payments.log.sort.recorded': 'Newest recorded',
  'payments.log.sort.paid': 'Payment date',
  'payments.log.csv.recorded_at': 'Recorded at',
  'payments.log.recorded_by': 'Recorded by {name}',
  'payments.log.csv.recorded_by': 'Recorded by',
  'payments.log.summary_one': '{count} payment · {amount} received',
  'payments.log.summary_other': '{count} payments · {amount} received',
  'payments.log.export': 'Export CSV',
  'payments.log.exporting': 'Exporting…',
  'payments.log.empty': 'No payments recorded yet.',
  'payments.log.no_match': 'No payments match.',
  'payments.log.csv.student_no': 'Student no.',
  'payments.log.csv.provider': 'Provider',

  // Payment report (/payments/report) — money received, drilled
  'payments.report.title': 'Payment report',
  'payments.report.subtitle':
    'Money received, by month, course and student. Open a row to go deeper.',
  'payments.report.all': 'All payments',
  'payments.report.trail': 'Report breakdown',
  'payments.report.month': 'Month',
  'payments.report.payments': 'Payments',
  'payments.report.received': 'Received',
  'payments.report.no_course': 'No course',
  'payments.report.from': 'From',
  'payments.report.to': 'to',
  'payments.report.empty': 'No payments received in this period.',
  'payments.report.clipped': '{count} smaller groups are not shown.',

  // Report views — the payments book, and the invoice book beside it
  'payments.report.view.received': 'Money received',
  'payments.report.view.outstanding': 'Paid vs outstanding',
  'payments.report.subtitle_outstanding':
    'Billed, paid and still owing, by month, course and student. Whoever owes most is first.',
  'payments.report.invoices': 'Invoices',
  'payments.report.billed': 'Billed',
  'payments.report.owing': 'Owing',
  'payments.report.all_invoices': 'All invoices',
  'payments.report.empty_invoices': 'No invoices issued in this period.',
  'payments.report.summary_outstanding_one':
    '{count} invoice · {billed} billed · {outstanding} outstanding',
  'payments.report.summary_outstanding_other':
    '{count} invoices · {billed} billed · {outstanding} outstanding',

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

  // Part payment — the invoice form and the pay-link card share these.
  'payments.partial.allow': 'Allow part payment',
  'payments.partial.allow_hint':
    'The student can pay this invoice in instalments online. ToyyibPay’s {fee} charge applies to each payment.',
  'payments.partial.minimum': 'Smallest payment',
  'payments.partial.minimum_placeholder': 'No minimum',
  'payments.partial.minimum_hint':
    'Leave blank to accept any amount from {min} — ToyyibPay’s own minimum.',
  'payments.partial.error_min': 'The smallest payment must be at least {min}.',
  'payments.partial.error_max':
    'The smallest payment can’t be more than the {max} outstanding.',

  // Errors raised by the data layer (features/payments/api.ts)
  'payments.error.email_failed': 'Could not send email.',
  'payments.error.no_response': 'No response from server.',
  'payments.error.start_payment': 'Could not start payment.',
  'payments.error.check_status': 'Could not check payment status.',
} as const

export type PaymentsDict = Record<keyof typeof payments, string>
