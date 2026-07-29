import type { PayDict } from '../en/pay'

export const pay: PayDict = {
  // Invoice card
  'pay.invoice_no': 'Invois {no}',
  'pay.amount_due': 'Jumlah perlu dibayar',
  'pay.partially_paid': '{paid} daripada {total} telah dibayar',
  'pay.fully_paid': 'Invois ini telah dijelaskan sepenuhnya. Terima kasih!',

  // Pay action
  'pay.pay_with_fpx': 'Bayar {amount} dengan FPX',
  'pay.starting': 'Memulakan…',
  'pay.secured_by': 'Dilindungi oleh ToyyibPay',

  // Link / gateway problems
  'pay.unavailable.title': 'Invois tidak tersedia',
  'pay.unavailable.body':
    'Pautan bayaran ini tidak sah, telah tamat tempoh, atau invois sudah dijelaskan. Sila hubungi akademi untuk bantuan.',
  'pay.offline_only':
    'Bayaran dalam talian tidak tersedia untuk invois ini. Sila hubungi {academy} untuk mengatur pembayaran.',
  'pay.error.not_configured':
    'Bayaran dalam talian belum disediakan untuk invois ini.',
  'pay.error.start_failed':
    'Bayaran tidak dapat dimulakan. Sila cuba lagi.',

  // Result page
  'pay.result.title': 'Pembayaran',
  'pay.result.confirming': 'Mengesahkan bayaran anda…',
  'pay.result.confirming_hint':
    'Ini mungkin mengambil masa beberapa saat selepas anda membayar.',
  'pay.result.paid': 'Bayaran diterima',
  'pay.result.paid_body': 'Terima kasih! Bayaran anda telah disahkan.',
  'pay.result.failed': 'Bayaran tidak selesai',
  'pay.result.failed_body': 'Bayaran tidak berjaya. Anda boleh cuba lagi.',
  'pay.result.back_to_invoice': 'Kembali ke invois',
}
