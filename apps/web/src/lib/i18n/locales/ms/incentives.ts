import type { IncentivesDict } from '../en/incentives'

export const incentives: IncentivesDict = {
  // Halaman senarai
  'incentives.title': 'Insentif',
  'incentives.subtitle':
    'Pindahan sekali sahaja terus ke akaun bank pelajar sendiri.',
  'incentives.back': 'Kembali ke insentif',
  'incentives.admin_only':
    'Hanya pentadbir akademi boleh mengurus bayaran insentif.',
  'incentives.empty': 'Belum ada kelompok insentif.',
  'incentives.not_found':
    'Kelompok insentif ini tidak wujud, atau anda tiada akses kepadanya.',
  'incentives.amount_per_student': 'Jumlah bagi setiap pelajar',
  'incentives.sandbox': 'Sandbox',
  'incentives.no_bank': 'Tiada butiran bank',
  'incentives.refresh_status': 'Muat semula status',
  'incentives.resume': 'Sambung semula',

  'incentives.recipients_one': '{count} penerima',
  'incentives.recipients_other': '{count} penerima',

  'incentives.batch.per_student': '{amount} bagi setiap pelajar',

  'incentives.table.recipients': 'Penerima',
  'incentives.table.created': 'Dicipta',
  'incentives.table.account': 'Akaun',
  'incentives.table.reason': 'Sebab',

  // Dialog insentif baharu
  'incentives.new.action': 'Insentif baharu',
  'incentives.new.title': 'Insentif baharu',
  'incentives.new.description':
    'Tetapkan jumlah yang diterima oleh setiap pelajar. Anda memilih penerima selepas ini.',
  'incentives.new.title_placeholder':
    'Geran pendidikan penjagaan kanak-kanak 2026',
  'incentives.new.description_placeholder':
    'Sampai kepada penerima bersama pindahan',
  'incentives.new.title_required': 'Tajuk diperlukan.',
  'incentives.new.amount_required':
    'Masukkan jumlah yang lebih besar daripada sifar.',

  // Pemilih penerima
  'incentives.picker.search_placeholder':
    'Cari mengikut nama, nombor pelajar atau e-mel',
  'incentives.picker.empty': 'Belum ada pelajar dalam akademi ini.',
  'incentives.picker.no_match': 'Tiada pelajar sepadan dengan carian anda.',
  'incentives.picker.select_all': 'Pilih semua',
  'incentives.picker.bank': 'Bank',

  // Penghantaran. "Payment Order" ialah nama produk Billplz, jadi ia dikekalkan.
  'incentives.send.action': 'Hantar pindahan',
  'incentives.send.confirm_title': 'Hantar pindahan ini?',
  'incentives.send.confirm_body_one':
    'Tindakan ini memindahkan {total} ke 1 akaun bank. Arahan pembayaran tidak boleh ditarik balik setelah dihantar.',
  'incentives.send.confirm_body_other':
    'Tindakan ini memindahkan {total} ke {count} akaun bank. Arahan pembayaran tidak boleh ditarik balik setelah dihantar.',
  'incentives.send.list_changed':
    'Tiada pindahan dihantar. Hanya {count} daripada {picked} pelajar yang anda pilih masih mempunyai maklumat bank. Senarai di bawah telah dikemas kini — sila semak dan sahkan semula.',

  'incentives.delete.action': 'Padam insentif',
  'incentives.delete.title': 'Padam insentif ini?',
  'incentives.delete.body':
    '“{title}” dan senarai penerimanya akan dibuang. Tindakan ini tidak boleh dibatalkan.',

  'incentives.error.insufficient_funds':
    'Had Payment Order Billplz anda terlalu rendah untuk kelompok ini. Tambah nilainya, kemudian sambung semula.',
  'incentives.error.not_configured':
    'Billplz belum disambungkan. Tambah kunci anda dalam Tetapan terlebih dahulu.',
  'incentives.error.no_recipients':
    'Kelompok ini tiada penerima yang mempunyai butiran bank.',
  'incentives.error.send_failed': 'Pindahan tidak dapat dihantar.',
  'incentives.error.refresh_failed':
    'Status bayaran tidak dapat dimuat semula.',
  'incentives.error.no_response': 'Tiada respons daripada pelayan.',

  // Lencana status bayaran dan status kelompok
  'incentives.payout_status.pending': 'Belum dihantar',
  'incentives.payout_status.sending': 'Sedang dihantar',
  'incentives.payout_status.processing': 'Sedang diproses',
  'incentives.payout_status.completed': 'Dibayar',
  'incentives.payout_status.failed': 'Gagal',
  'incentives.payout_status.cancelled': 'Dibatalkan',

  'incentives.batch_status.sending': 'Sedang dihantar',
  'incentives.batch_status.sent': 'Telah dihantar',
  'incentives.batch_status.cancelled': 'Dibatalkan',

  // Sebelah pelajar — jadual bayaran di bawah /learn/billing. "Bayaran
  // insentif", bukan "Bayaran" sahaja: halaman yang sama sudah menyenaraikan
  // bayaran invois.
  'incentives.learn.payouts': 'Bayaran insentif',
  'incentives.learn.col.batch': 'Insentif',

  // Akaun bank pelajar
  'incentives.bank.title': 'Akaun bank',
  'incentives.bank.description':
    'Ke mana bayaran insentif dipindahkan.',
  'incentives.bank.bank': 'Bank',
  'incentives.bank.bank_placeholder': 'Pilih bank',
  'incentives.bank.account_number': 'Nombor akaun',
  'incentives.bank.account_number_placeholder': 'Digit sahaja',
  'incentives.bank.holder': 'Nama pemegang akaun',
  'incentives.bank.holder_placeholder': 'Seperti yang dicetak oleh bank',
  'incentives.bank.holder_ic': 'Nombor IC (pilihan)',
  'incentives.bank.empty': 'Tiada akaun bank dalam rekod.',
  'incentives.bank.removing': 'Membuang…',
  'incentives.bank.remove_confirm.title': 'Buang akaun bank?',
  'incentives.bank.remove_confirm.body':
    'Butiran ini akan dipadam. Bayaran yang telah dihantar tidak terjejas.',
  'incentives.bank.error.bank': 'Pilih sebuah bank.',
  'incentives.bank.error.account_number':
    'Masukkan nombor akaun antara 5 hingga 20 digit.',
  'incentives.bank.error.holder': 'Masukkan nama pemegang akaun.',
}
