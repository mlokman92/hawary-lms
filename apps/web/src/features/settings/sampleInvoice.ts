import { translate } from '@/lib/i18n'
import type { InvoiceDetail } from '@/features/payments/api'

/**
 * A stand-in invoice for the Settings preview.
 *
 * The point of the preview is the *letterhead* — an admin who has just typed an
 * address or uploaded a logo wants to see where it lands on the page, and until
 * this existed the only way was to issue a real invoice to a real student. So
 * the academy half is live and the invoice half is invented.
 *
 * It is deliberately part-paid with one payment recorded: that is the only
 * shape that exercises every block both documents can draw — line items, tax,
 * an amount paid, an outstanding balance, and a payments table on the receipt.
 *
 * Everything printed is either translated copy or a plainly fictional figure.
 * The "student" is `doc.sample.student`, not a plausible person's name: this
 * document must never be mistakable for a real bill if it is printed or saved.
 */

const ISSUED_AT = '2026-01-06T09:00:00.000Z'
const DUE_AT = '2026-01-20T15:59:59.000Z'
const PAID_AT = '2026-01-09T04:30:00.000Z'

const ITEMS: Array<[key: string, quantity: number, unitPriceSen: number]> = [
  ['doc.sample.item_course', 1, 180_000],
  ['doc.sample.item_registration', 1, 15_000],
  ['doc.sample.item_materials', 2, 7_500],
]

const TAX_SEN = 16_800 // 8% SST on the 2,100.00 subtotal
const PAID_SEN = 100_000

/**
 * Built on demand rather than held as a constant: `translate()` reads the
 * language at call time, so a module-level object would be frozen in whichever
 * language happened to be active when the module first loaded.
 */
export function sampleInvoice(academyId: string): InvoiceDetail {
  const items = ITEMS.map(([key, quantity, unitPriceSen], i) => ({
    id: `sample-item-${i}`,
    academy_id: academyId,
    invoice_id: 'sample-invoice',
    created_at: ISSUED_AT,
    description: translate(key as Parameters<typeof translate>[0]),
    quantity,
    unit_price_sen: unitPriceSen,
    amount_sen: quantity * unitPriceSen,
  }))

  const subtotalSen = items.reduce((sum, it) => sum + it.amount_sen, 0)

  return {
    id: 'sample-invoice',
    academy_id: academyId,
    student_id: 'sample-student',
    enrollment_id: null,
    course_id: null,
    invoice_no: translate('doc.sample.invoice_no'),
    status: 'partially_paid',
    currency: 'MYR',
    subtotal_sen: subtotalSen,
    tax_sen: TAX_SEN,
    total_sen: subtotalSen + TAX_SEN,
    amount_paid_sen: PAID_SEN,
    // Generated in the database; computed here so the fixture agrees with what
    // a real row would hold rather than carrying a second, invented balance.
    balance_sen: Math.max(0, subtotalSen + TAX_SEN - PAID_SEN),
    issued_at: ISSUED_AT,
    due_at: DUE_AT,
    notes: translate('doc.sample.notes'),
    created_by: null,
    created_at: ISSUED_AT,
    updated_at: PAID_AT,
    pay_token: null,
    pay_token_created_at: null,
    charge_to_payor: null,
    allow_partial_payment: true,
    min_partial_sen: null,
    student: {
      full_name: translate('doc.sample.student'),
      student_no: translate('doc.sample.student_no'),
      email: translate('doc.sample.email'),
      organization: null,
      address: translate('doc.sample.address'),
    },
    course: { id: 'sample-course', title: translate('doc.sample.course') },
    items,
    payments: [
      {
        id: 'sample-payment',
        academy_id: academyId,
        invoice_id: 'sample-invoice',
        student_id: 'sample-student',
        amount_sen: PAID_SEN,
        currency: 'MYR',
        method: 'fpx',
        provider: 'toyyibpay',
        provider_ref: null,
        status: 'succeeded',
        paid_at: PAID_AT,
        created_by: null,
        created_at: PAID_AT,
        updated_at: PAID_AT,
      },
    ],
  }
}
