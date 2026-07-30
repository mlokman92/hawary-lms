import type { DocumentsDict } from '../en/documents'

export const documents: DocumentsDict = {
  // Tajuk dokumen
  'doc.invoice.title': 'INVOIS',
  'doc.receipt.title': 'RESIT',

  // Kepala surat
  'doc.tel': 'Tel',
  'doc.sst_no': 'No. SST',

  // Pihak dan maklumat
  'doc.bill_to': 'Dibilkan kepada',
  'doc.student_no': 'No. pelajar',
  'doc.course': 'Kursus',
  'doc.invoice_no': 'No. invois',
  'doc.issued': 'Tarikh invois',
  'doc.due': 'Tarikh akhir',
  'doc.receipt_date': 'Tarikh resit',

  // Jadual butiran
  'doc.col.qty': 'Kuantiti',
  'doc.col.unit_price': 'Harga seunit',
  'doc.col.date': 'Tarikh',
  'doc.col.method': 'Cara',
  'doc.no_items': 'Tiada butiran.',

  // Jumlah
  'doc.subtotal': 'Jumlah kecil',
  'doc.tax': 'Cukai / SST',
  'doc.paid': 'Telah dibayar',
  'doc.balance': 'Baki perlu dibayar',
  'doc.amount_received': 'Jumlah diterima',

  // Pembayaran
  'doc.payments_received': 'Pembayaran diterima',
  'doc.no_payments': 'Tiada pembayaran direkodkan.',

  // Pengaki
  'doc.notes': 'Catatan',
  'doc.footer':
    'Dokumen ini dijana komputer. Tandatangan tidak diperlukan.',
  'doc.page': 'Halaman {page} daripada {pages}',

  // Akhiran nama fail — dikekalkan ASCII kerana ia menjadi nama fail pengguna.
  'doc.file.invoice': 'invois',
  'doc.file.receipt': 'resit',

  // Butang muat turun
  'doc.download.invoice': 'Muat turun invois',
  'doc.download.receipt': 'Muat turun resit',
  'doc.download.preparing': 'Menyediakan…',
  'doc.error.failed': 'PDF tidak dapat dijana.',
}
