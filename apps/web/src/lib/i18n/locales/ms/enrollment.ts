import type { EnrollmentDict } from '../en/enrollment'

export const enrollment: EnrollmentDict = {
  // --- Halaman sertai awam --------------------------------------------------
  'enroll.unavailable.title': 'Halaman tidak tersedia',
  'enroll.unavailable.body':
    'Pautan ini tidak sah, atau akademi tidak lagi menerima pelajar baharu di sini.',
  'enroll.closed.title': 'Pendaftaran ditutup',
  'enroll.closed.body':
    'Akademi ini tidak menerima pelajar baharu buat masa ini.',
  'enroll.page.title': 'Sertai akademi ini',
  'enroll.page.subtitle':
    'Pilih kursus yang anda mahu. Anda menyertai serta-merta; kursus dibuka setelah kakitangan meluluskannya.',
  'enroll.choose': 'Pilih kursus',
  'enroll.no_courses': 'Tiada kursus dibuka untuk pendaftaran buat masa ini.',
  'enroll.join': 'Sertai dan mohon kursus ini',
  'enroll.joining': 'Menyertai…',
  'enroll.cta.create_account': 'Buka akaun',
  'enroll.cta.sign_in': 'Log masuk',
  'enroll.cta.have_account': 'Sudah ada akaun?',
  'enroll.already_staff':
    'Anda kakitangan akademi ini — daftarkan pelajar dari pejabat belakang.',
  'enroll.go_dashboard': 'Ke papan pemuka saya',
  'enroll.price_free': 'Percuma',
  'enroll.seats.left_one': '{count} tempat kosong',
  'enroll.seats.left_other': '{count} tempat kosong',
  'enroll.seats.enrolled': '{count} telah mendaftar',
  'enroll.closes': 'Ditutup {date}',

  // --- Status pendaftaran ---------------------------------------------------
  'enroll.status.pending': 'Menunggu kelulusan',
  'enroll.status.active': 'Aktif',
  'enroll.status.completed': 'Selesai',
  'enroll.status.dropped': 'Berhenti',
  'enroll.status.rejected': 'Tidak diluluskan',

  // --- Pelajar --------------------------------------------------------------
  'enroll.learn.pending': 'Menunggu kelulusan',
  'enroll.learn.pending_hint':
    'Akan dibuka setelah kakitangan meluluskan tempat anda.',

  // --- Kakitangan: halaman --------------------------------------------------
  'enroll.staff.subtitle':
    'Pautan sertai awam, kursus yang menerima permohonan, dan siapa yang menunggu.',

  'enroll.link.title': 'Pautan sertai awam',
  'enroll.link.description':
    'Sesiapa yang ada pautan ini boleh membuka akaun dan memohon kursus. Tiada sesiapa mendapat akses kursus sehingga anda meluluskannya.',
  'enroll.link.open': 'Buka untuk pendaftaran',
  'enroll.link.closed_note': 'Hidupkan untuk menerbitkan pautan.',
  'enroll.link.intro': 'Mesej pada halaman',
  'enroll.link.intro_placeholder':
    'Untuk siapa, bila kelas bermula, apa yang perlu dibawa.',
  'enroll.link.preview': 'Pratonton',
  'enroll.link.admin_only': 'Hanya pentadbir boleh mengubah tetapan ini.',

  'enroll.courses.title': 'Kursus yang menerima permohonan',
  'enroll.courses.description':
    'Kursus perlu diterbitkan dan dihidupkan di sini sebelum ia muncul pada pautan.',
  'enroll.courses.empty': 'Tiada kursus lagi.',
  'enroll.courses.limits': 'Had',
  'enroll.courses.seats_uncapped': '{taken} telah mendaftar',
  'enroll.courses.seats_capped': '{taken} daripada {capacity} tempat',
  'enroll.courses.no_deadline': 'Tiada tarikh tutup',

  'enroll.limits.title': 'Had pendaftaran',
  'enroll.limits.description': 'Terpakai untuk {course}.',
  'enroll.limits.capacity': 'Tempat',
  'enroll.limits.capacity_hint':
    'Kosongkan untuk tiada had. Kursus yang penuh masih menerima permohonan — anda yang menentukan siapa mendapat tempat.',
  'enroll.limits.closes_at': 'Berhenti menerima permohonan pada',
  'enroll.limits.closes_at_hint':
    'Kosongkan untuk kekal terbuka sehingga anda mematikannya.',

  'enroll.requests.title': 'Permohonan',
  'enroll.requests.pending': 'Menunggu kelulusan',
  'enroll.requests.enrolled': 'Telah didaftarkan',
  'enroll.requests.search_placeholder': 'Cari nama, e-mel, telefon atau kursus',
  'enroll.requests.empty': 'Tiada permohonan lagi.',
  'enroll.requests.empty_hint':
    'Buka pautan dan hidupkan satu kursus untuk mula menerima permohonan.',
  'enroll.requests.no_match': 'Tiada yang sepadan dengan penapis ini.',
  'enroll.requests.approve': 'Luluskan',
  'enroll.requests.reject': 'Tolak',
  'enroll.requests.full': 'Penuh',

  // --- Kakitangan: pendaftaran pukal melalui e-mel --------------------------
  'enroll.bulk.action': 'Daftarkan pelajar',
  'enroll.bulk.title': 'Daftarkan pelajar sedia ada',
  'enroll.bulk.description':
    'Tampal senarai alamat e-mel, atau muat naik CSV. Hanya mereka yang sudah mempunyai rekod pelajar dalam akademi ini boleh didaftarkan dengan cara ini.',
  'enroll.bulk.course': 'Kursus',
  'enroll.bulk.pick_course': 'Pilih kursus',
  'enroll.bulk.label': 'Alamat e-mel',
  'enroll.bulk.placeholder': 'aina@example.com\nrahim@example.com',
  'enroll.bulk.hint':
    'Satu alamat setiap baris, atau CSV dengan lajur “email”. Pendua akan dibuang.',
  'enroll.bulk.upload': 'Muat naik CSV',
  'enroll.bulk.stat.ready': 'Untuk didaftarkan',
  'enroll.bulk.stat.already': 'Telah didaftarkan',
  'enroll.bulk.stat.unknown': 'Tiada rekod pelajar',
  'enroll.bulk.stat.invalid': 'Bukan e-mel',
  'enroll.bulk.stat.ambiguous': 'Lebih daripada satu padanan',
  'enroll.bulk.unknown_title': 'Tiada rekod pelajar untuk alamat ini',
  'enroll.bulk.unknown_hint':
    'Tambah atau import mereka di halaman Pelajar, atau hantar pautan sertai supaya mereka boleh memohon tempat. Pelajar yang diarkibkan tidak dipadankan.',
  'enroll.bulk.ambiguous_title':
    'Lebih daripada seorang pelajar berkongsi alamat ini',
  'enroll.bulk.ambiguous_hint':
    'Daftarkan mereka dari halaman pelajar itu sendiri, supaya rekod yang betul dipilih.',
  'enroll.bulk.invalid_title': 'Alamat e-mel tidak sah',
  'enroll.bulk.submit': 'Daftarkan {count}',
  'enroll.bulk.submitting': 'Mendaftarkan…',
  'enroll.bulk.nothing': 'Tiada untuk didaftarkan',
  'enroll.bulk.done_one': '{count} pelajar telah didaftarkan.',
  'enroll.bulk.done_other': '{count} pelajar telah didaftarkan.',
}
