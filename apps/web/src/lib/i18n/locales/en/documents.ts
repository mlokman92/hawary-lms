/**
 * Copy printed inside the invoice / receipt PDFs, plus the buttons that
 * generate them. It is its own namespace because the same strings are rendered
 * from two very different places — the learner's billing screens and a plain
 * drawing helper (`features/payments/pdf.ts`) that has no hook.
 */
export const documents = {
  // Document headings
  'doc.invoice.title': 'INVOICE',
  'doc.receipt.title': 'RECEIPT',

  // Letterhead
  'doc.tel': 'Tel',
  'doc.sst_no': 'SST No.',

  // Parties and meta
  'doc.bill_to': 'Bill to',
  'doc.student_no': 'Student no.',
  'doc.course': 'Course',
  'doc.invoice_no': 'Invoice no.',
  'doc.issued': 'Invoice date',
  'doc.due': 'Due date',
  'doc.receipt_date': 'Receipt date',

  // Items table
  'doc.col.qty': 'Qty',
  'doc.col.unit_price': 'Unit price',
  'doc.col.date': 'Date',
  'doc.col.method': 'Method',
  'doc.no_items': 'No line items.',

  // Totals
  'doc.subtotal': 'Subtotal',
  'doc.tax': 'Tax / SST',
  'doc.paid': 'Paid',
  'doc.balance': 'Balance due',
  'doc.amount_received': 'Amount received',

  // Payments
  'doc.payments_received': 'Payments received',
  'doc.no_payments': 'No payments recorded.',

  // Footer
  'doc.notes': 'Notes',
  'doc.footer': 'This is a computer-generated document. No signature is required.',
  'doc.page': 'Page {page} of {pages}',

  // Filename suffixes — kept ASCII, they end up on the user's disk.
  'doc.file.invoice': 'invoice',
  'doc.file.receipt': 'receipt',

  // Download buttons
  'doc.download.invoice': 'Download invoice',
  'doc.download.receipt': 'Download receipt',
  'doc.download.preparing': 'Preparing…',
  'doc.error.failed': 'Could not generate the PDF.',
} as const

export type DocumentsDict = Record<keyof typeof documents, string>
