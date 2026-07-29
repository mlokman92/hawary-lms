import type { LearnAccountDict } from '../en/learnAccount'

export const learnAccount: LearnAccountDict = {
  // Senarai bil
  'lacct.billing.title': 'Bil',
  'lacct.billing.description': 'Invois dan pembayaran anda.',
  'lacct.billing.no_record_detail': 'Belum ada apa-apa untuk dibilkan.',
  'lacct.billing.empty': 'Anda belum mempunyai sebarang invois.',

  // Label jumlah wang
  'lacct.amount.billed': 'Dibilkan',
  'lacct.amount.paid': 'Telah dibayar',
  'lacct.amount.outstanding': 'Tertunggak',
  'lacct.amount.subtotal': 'Jumlah kecil',
  'lacct.amount.tax': 'Cukai / SST',
  'lacct.amount.balance': 'Baki',

  // Lajur jadual
  'lacct.col.invoice': 'Invois',
  'lacct.col.qty': 'Kuantiti',
  'lacct.col.unit': 'Harga seunit',

  // Satu invois
  'lacct.invoice.not_available': 'Invois ini tidak tersedia untuk anda.',
  'lacct.invoice.back': 'Kembali ke bil',
  'lacct.invoice.course': 'Kursus · {title}',
  'lacct.invoice.dates': 'Dikeluarkan {issued} · Tarikh akhir {due}',
  'lacct.invoice.pay_online': 'Bayar dalam talian',
  'lacct.invoice.items': 'Butiran',
  'lacct.invoice.no_items': 'Tiada butiran.',
  'lacct.invoice.summary': 'Ringkasan',
  'lacct.invoice.payments': 'Pembayaran',
  'lacct.invoice.no_payments': 'Tiada pembayaran direkodkan lagi.',

  // Status invois
  'lacct.invoice_status.issued': 'Dikeluarkan',
  'lacct.invoice_status.partially_paid': 'Sebahagian dibayar',
  'lacct.invoice_status.paid': 'Dibayar',
  'lacct.invoice_status.void': 'Tidak sah',
  'lacct.invoice_status.cancelled': 'Dibatalkan',

  // Cara pembayaran
  'lacct.method.cash': 'Tunai',
  'lacct.method.bank_transfer': 'Pindahan bank',
  'lacct.method.fpx': 'FPX',
  'lacct.method.card': 'Kad',
  'lacct.method.ewallet': 'E-dompet',
  'lacct.method.other': 'Lain-lain',

  // Profil
  'lacct.profile.title': 'Profil saya',
  'lacct.profile.description':
    'Butiran akaun anda, serta rekod yang disimpan oleh akademi anda.',
  'lacct.profile.account': 'Akaun',
  'lacct.profile.name_placeholder': 'Nama anda',
  'lacct.profile.email_locked':
    'E-mel log masuk anda tidak boleh ditukar di sini — hubungi akademi anda jika ia perlu dikemas kini.',
  'lacct.profile.save_changes': 'Simpan perubahan',
  'lacct.profile.save_failed': 'Profil anda tidak dapat disimpan.',
  'lacct.profile.not_signed_in': 'Anda belum log masuk.',

  // Profil → rekod yang disimpan akademi
  'lacct.profile.record': 'Rekod akademi',
  'lacct.profile.academy': 'Akademi',
  'lacct.profile.student_no': 'Nombor pelajar',
  'lacct.profile.email_on_record': 'E-mel dalam rekod',
  'lacct.profile.phone_on_record': 'Telefon dalam rekod',
  'lacct.profile.joined': 'Tarikh menyertai',
  'lacct.profile.managed_by_academy':
    'Diuruskan oleh akademi anda — hubungi mereka untuk mengemas kini maklumat ini.',
  'lacct.profile.no_record':
    'Belum ada rekod pelajar yang dipautkan dengan akaun anda di {academy}.',
}
