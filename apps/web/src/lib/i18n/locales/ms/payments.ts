import type { PaymentsDict } from '../en/payments'

export const payments: PaymentsDict = {
  // Halaman senarai
  'payments.title': 'Pembayaran',
  'payments.subtitle': 'Keluarkan invois kepada pelajar dan pantau kutipan.',
  'payments.new_invoice': 'Invois baharu',

  // Penapis kursus
  'payments.filter.all_courses': 'Semua kursus',
  'payments.filter.no_course': 'Tiada kursus',
  'payments.filter.published_only': 'Yang diterbitkan sahaja',
  'payments.filter.show_all': 'Tunjuk semua ({count} belum diterbitkan)',
  'payments.course_status.archived': 'Diarkibkan',

  // Statistik
  'payments.stat.invoiced': 'Jumlah diinvois',
  'payments.stat.collected': 'Dikutip',
  'payments.stat.outstanding': 'Belum dijelaskan',

  // Jadual rekod
  'payments.records.heading': 'Rekod pembayaran',
  'payments.table.invoice': 'Invois',
  'payments.empty.none': 'Belum ada invois.',
  'payments.empty.create_first': 'Cipta invois pertama anda',
  'payments.empty.no_match': 'Tiada invois yang sepadan.',

  // Status invois
  'payments.status.issued': 'Dikeluarkan',
  'payments.status.partially_paid': 'Dibayar sebahagian',
  'payments.status.paid': 'Dibayar',
  'payments.status.void': 'Batal',
  'payments.status.cancelled': 'Dibatalkan',

  // Label jumlah
  'payments.amount.subtotal': 'Jumlah kecil',
  'payments.amount.tax': 'Cukai / SST',
  'payments.amount.paid': 'Dibayar',
  'payments.amount.balance': 'Baki',

  // Butiran invois
  'payments.detail.not_found': 'Invois tidak ditemui.',
  'payments.detail.back': 'Kembali ke pembayaran',
  'payments.detail.course': 'Kursus · {title}',
  'payments.detail.dates': 'Dikeluarkan {issued} · Tarikh akhir {due}',
  'payments.detail.void': 'Batalkan',
  'payments.detail.void_confirm_title': 'Batalkan invois ini?',
  'payments.detail.void_confirm_body':
    '{invoice} akan ditandakan sebagai batal. Bayaran yang telah direkodkan dikekalkan untuk rekod anda.',
  'payments.detail.void_action': 'Batalkan invois',
  'payments.detail.items': 'Butiran',
  'payments.detail.qty': 'Kuantiti',
  'payments.detail.unit': 'Harga unit',
  'payments.detail.no_items': 'Tiada butiran.',
  'payments.detail.summary': 'Ringkasan',
  'payments.detail.no_payments': 'Belum ada bayaran direkodkan.',
  'payments.detail.all_payments': 'Semua bayaran',

  // Dialog invois baharu
  'payments.form.description':
    'Pilih penerima di sebelah kiri; setiap seorang menerima invois sendiri dengan nombor yang dijana automatik.',
  'payments.form.recipients': 'Penerima',
  'payments.form.selected': '{count} dipilih',
  'payments.form.all_students': 'Semua pelajar (tiada kursus)',
  'payments.form.course_hint_none':
    'Pilih kursus untuk mengeluarkan invois kepada pelajarnya dan menandakan invois ini.',
  'payments.form.course_hint_selected':
    'Invois ini akan ditandakan dengan kursus ini.',
  'payments.form.show_published_only': 'Tunjuk yang diterbitkan sahaja',
  'payments.form.show_all_courses':
    'Tunjuk semua kursus ({count} belum diterbitkan)',
  'payments.form.search_placeholder': 'Cari nama, e-mel atau ID',
  'payments.form.remove_recipient': 'Buang {name}',
  'payments.form.matches_one': '{count} pelajar',
  'payments.form.matches_other': '{count} pelajar',
  'payments.form.select_all': 'Pilih semua',
  'payments.form.no_matches': 'Tiada pelajar sepadan.',
  'payments.form.truncated':
    'Menunjukkan {count} yang pertama — perhalusi carian anda untuk menyempitkan senarai.',
  'payments.form.line_items': 'Butiran invois',
  'payments.form.quantity': 'Kuantiti',
  'payments.form.unit_price': 'Harga unit',
  'payments.form.unit_placeholder': 'Unit (RM)',
  'payments.form.remove_item': 'Buang butiran',
  'payments.form.add_item': 'Tambah butiran',
  'payments.form.due_date': 'Tarikh akhir (pilihan)',
  'payments.form.tax': 'Cukai / SST (RM, pilihan)',
  'payments.form.notes': 'Nota (pilihan)',
  'payments.form.charge_to_payor': 'Pembayar menanggung caj ToyyibPay',
  'payments.form.charge_to_payor.hint':
    'Menambah caj FPX {amount} ToyyibPay apabila pelajar membayar dalam talian, jadi anda menerima jumlah penuh. Bermula daripada tetapan lalai anda.',
  'payments.form.per_student_one': '{amount} × {count} pelajar',
  'payments.form.per_student_other': '{amount} × {count} pelajar',
  'payments.form.grand_total': 'Jumlah {amount}',
  'payments.form.submit': 'Cipta invois',
  'payments.form.submit_many': 'Cipta {count} invois',
  'payments.form.error_no_student': 'Pilih sekurang-kurangnya seorang pelajar.',
  'payments.form.error_no_amount':
    'Tambah sekurang-kurangnya satu butiran yang berjumlah.',

  // Dialog rekod bayaran
  'payments.record.title': 'Rekod bayaran',
  'payments.record.balance_due': 'Baki perlu dibayar: {amount}',
  'payments.record.amount': 'Jumlah (RM)',
  'payments.record.method': 'Kaedah',
  'payments.record.submitting': 'Merekod…',
  'payments.record.error_amount':
    'Masukkan jumlah yang lebih besar daripada sifar.',

  // Status bayaran — keputusan baris bayaran itu sendiri, bukan invois
  'payments.pstatus.pending': 'Menunggu',
  'payments.pstatus.succeeded': 'Berjaya',
  'payments.pstatus.failed': 'Gagal',
  'payments.pstatus.refunded': 'Dikembalikan',

  // Log bayaran (/payments/log) — lejar wang masuk
  'payments.log.title': 'Log bayaran',
  'payments.log.subtitle': 'Setiap bayaran yang diterima, terbaharu dahulu.',
  'payments.log.search_placeholder': 'Cari pelajar, invois, atau rujukan',
  'payments.log.all_statuses': 'Semua status',
  'payments.log.method': 'Kaedah',
  'payments.log.reference': 'Rujukan',
  'payments.log.recorded_manually': 'Direkod secara manual',
  'payments.log.recorded_at': 'Direkod {when}',
  'payments.log.sort.recorded': 'Terbaharu direkod',
  'payments.log.sort.paid': 'Tarikh bayaran',
  'payments.log.csv.recorded_at': 'Direkod pada',
  'payments.log.recorded_by': 'Direkod oleh {name}',
  'payments.log.csv.recorded_by': 'Direkod oleh',
  'payments.log.summary_one': '{count} bayaran · {amount} diterima',
  'payments.log.summary_other': '{count} bayaran · {amount} diterima',
  'payments.log.export': 'Eksport CSV',
  'payments.log.exporting': 'Mengeksport…',
  'payments.log.empty': 'Belum ada bayaran direkodkan.',
  'payments.log.no_match': 'Tiada bayaran yang sepadan.',
  'payments.log.csv.student_no': 'No. pelajar',
  'payments.log.csv.provider': 'Penyedia',

  // Laporan bayaran (/payments/report) — wang diterima, boleh dileraikan
  'payments.report.title': 'Laporan bayaran',
  'payments.report.subtitle':
    'Wang diterima, mengikut bulan, kursus dan pelajar. Buka satu baris untuk melihat lebih terperinci.',
  'payments.report.all': 'Semua bayaran',
  'payments.report.trail': 'Leraian laporan',
  'payments.report.month': 'Bulan',
  'payments.report.payments': 'Bayaran',
  'payments.report.received': 'Diterima',
  'payments.report.no_course': 'Tiada kursus',
  'payments.report.from': 'Dari',
  'payments.report.to': 'hingga',
  'payments.report.empty': 'Tiada bayaran diterima dalam tempoh ini.',
  'payments.report.clipped': '{count} kumpulan lebih kecil tidak dipaparkan.',

  // Paparan laporan — buku bayaran, dan buku invois di sebelahnya
  'payments.report.view.received': 'Wang diterima',
  'payments.report.view.outstanding': 'Dibayar vs tertunggak',
  'payments.report.subtitle_outstanding':
    'Dibilkan, dibayar dan masih terhutang, mengikut bulan, kursus dan pelajar. Yang paling banyak berhutang di atas.',
  'payments.report.invoices': 'Invois',
  'payments.report.billed': 'Dibilkan',
  'payments.report.owing': 'Terhutang',
  'payments.report.all_invoices': 'Semua invois',
  'payments.report.empty_invoices': 'Tiada invois dikeluarkan dalam tempoh ini.',
  'payments.report.summary_outstanding_one':
    '{count} invois · {billed} dibilkan · {outstanding} tertunggak',
  'payments.report.summary_outstanding_other':
    '{count} invois · {billed} dibilkan · {outstanding} tertunggak',

  // Kaedah bayaran
  'payments.method.cash': 'Tunai',
  'payments.method.bank_transfer': 'Pindahan bank',
  'payments.method.fpx': 'FPX',
  'payments.method.card': 'Kad',
  'payments.method.ewallet': 'E-dompet',
  'payments.method.other': 'Lain-lain',

  // Kad pautan bayaran (ToyyibPay)
  'payments.pay_link.title': 'Pembayaran dalam talian',
  'payments.pay_link.disabled': 'Pembayaran dalam talian belum disediakan.',
  'payments.pay_link.connect': 'Sambungkan ToyyibPay dalam Tetapan',
  'payments.pay_link.disabled_suffix':
    'supaya pelajar boleh membayar invois ini melalui FPX.',
  'payments.pay_link.not_payable':
    'Invois ini tidak boleh dibayar dalam talian (sudah dijelaskan atau dibatalkan).',
  'payments.pay_link.intro':
    'Kongsi pautan selamat supaya pelajar boleh membayar dalam talian melalui FPX.',
  'payments.pay_link.email': 'E-mel kepada pelajar',
  'payments.pay_link.check': 'Semak status bayaran',
  'payments.pay_link.checking': 'Menyemak…',
  'payments.pay_link.preview': 'Pratonton',
  'payments.pay_link.create': 'Cipta pautan bayaran',
  'payments.pay_link.sent': 'Telah dihantar.',
  'payments.pay_link.sent_to': 'Telah dihantar kepada {email}.',
  'payments.pay_link.send_failed':
    'E-mel tidak dapat dihantar — salin pautan sebagai ganti.',
  'payments.pay_link.confirmed':
    'Bayaran disahkan — invois ditandakan sebagai dibayar.',
  'payments.pay_link.not_found_yet':
    'Belum ada bayaran yang selesai ditemui. Jika pelajar baru sahaja membayar, tunggu sebentar dan semak semula.',
  'payments.pay_link.error_create': 'Pautan tidak dapat dicipta.',
  'payments.pay_link.error_check': 'Status tidak dapat disemak.',

  // Ralat daripada lapisan data
  // Part payment — the invoice form and the pay-link card share these.
  'payments.partial.allow': 'Benarkan bayaran sebahagian',
  'payments.partial.allow_hint':
    'Pelajar boleh menjelaskan invois ini secara ansuran dalam talian. Caj ToyyibPay {fee} dikenakan pada setiap bayaran.',
  'payments.partial.minimum': 'Bayaran terkecil',
  'payments.partial.minimum_placeholder': 'Tiada minimum',
  'payments.partial.minimum_hint':
    'Biarkan kosong untuk menerima apa-apa jumlah dari {min} — minimum ToyyibPay sendiri.',
  'payments.partial.error_min':
    'Bayaran terkecil mestilah sekurang-kurangnya {min}.',
  'payments.partial.error_max':
    'Bayaran terkecil tidak boleh melebihi baki tertunggak {max}.',

  'payments.error.email_failed': 'E-mel tidak dapat dihantar.',
  'payments.error.no_response': 'Tiada respons daripada pelayan.',
  'payments.error.start_payment': 'Pembayaran tidak dapat dimulakan.',
  'payments.error.check_status': 'Status bayaran tidak dapat disemak.',
}
