import type { EnrollmentDict } from '../en/enrollment'

export const enrollment: EnrollmentDict = {
  // --- Awam: direktori akademi ---------------------------------------------
  'enroll.directory.subtitle': 'Kursus yang dibuka untuk pendaftaran',
  'enroll.directory.empty': 'Tiada kursus dibuka untuk pendaftaran buat masa ini.',
  'enroll.directory.empty_hint': 'Sila semak semula kemudian, atau hubungi akademi.',
  'enroll.unavailable.title': 'Halaman tidak tersedia',
  'enroll.unavailable.body':
    'Pautan pendaftaran ini tidak sah, atau akademi tidak lagi menerima permohonan di sini.',

  // --- Awam: halaman kursus -------------------------------------------------
  'enroll.closed.title': 'Pendaftaran ditutup',
  'enroll.closed.body':
    'Kemasukan ini tidak menerima permohonan buat masa ini.',
  'enroll.closes': 'Permohonan ditutup {date}',
  'enroll.closed_on': 'Permohonan ditutup pada {date}',
  'enroll.price_free': 'Percuma',
  'enroll.seats.left_one': '{count} tempat kosong',
  'enroll.seats.left_other': '{count} tempat kosong',
  'enroll.seats.enrolled': '{count} telah mendaftar',
  'enroll.seats.full':
    'Kesemua {count} tempat telah diisi. Anda masih boleh memohon — akademi akan memaklumkan jika ada tempat kosong.',
  'enroll.view_courses': 'Lihat kursus lain',

  // --- Awam: ajakan memohon -------------------------------------------------
  'enroll.cta.title': 'Mohon satu tempat',
  'enroll.cta.body':
    'Pendaftaran adalah melalui permohonan: buka akaun, hantar maklumat anda, dan akademi akan mengesahkan tempat anda.',
  'enroll.cta.create_account': 'Buka akaun untuk memohon',
  'enroll.cta.have_account': 'Sudah ada akaun?',
  'enroll.cta.sign_in': 'Log masuk',
  'enroll.cta.staff':
    'Anda kakitangan akademi ini, jadi anda tidak boleh memohon di sini. Daftarkan pelajar dari halaman kursus.',

  // --- Awam: borang ---------------------------------------------------------
  'enroll.form.title': 'Maklumat anda',
  'enroll.form.description':
    'Akademi menyemak setiap permohonan sebelum tempat disahkan.',
  'enroll.form.submit': 'Hantar permohonan',
  'enroll.form.sending': 'Menghantar…',
  'enroll.form.required_error': 'Sila isi setiap ruangan yang diperlukan.',
  'enroll.field.full_name': 'Nama penuh',
  'enroll.field.email': 'E-mel',
  'enroll.field.email_hint':
    'Biarkan seperti sedia ada untuk menggunakan e-mel akaun anda. Ia hanya digunakan untuk menghubungi anda.',
  'enroll.field.phone': 'Telefon',
  'enroll.field.ic_number': 'Nombor kad pengenalan',
  'enroll.field.date_of_birth': 'Tarikh lahir',
  'enroll.field.gender': 'Jantina',
  'enroll.field.address': 'Alamat',
  'enroll.field.organization': 'Organisasi',
  'enroll.field.notes': 'Ada apa-apa lagi yang perlu akademi tahu?',
  'enroll.field.optional': 'pilihan',
  'enroll.gender.male': 'Lelaki',
  'enroll.gender.female': 'Perempuan',
  'enroll.gender.placeholder': 'Pilih',

  // --- Awam: status permohonan ----------------------------------------------
  'enroll.applied.title': 'Permohonan dihantar',
  'enroll.applied.body':
    'Akademi sedang menyemaknya. Keputusan akan dipaparkan di sini — tiada e-mel diperlukan.',
  'enroll.applied.on': 'Dimohon {date}',
  'enroll.withdraw': 'Tarik balik permohonan',
  'enroll.withdrawing': 'Menarik balik…',
  'enroll.approved.title': 'Anda telah didaftarkan',
  'enroll.approved.body': 'Buka kursus dari papan pemuka anda.',
  'enroll.approved.go': 'Ke kursus saya',
  'enroll.rejected.title': 'Tidak berjaya kali ini',
  'enroll.rejected.body':
    'Akademi tidak dapat menawarkan tempat kepada anda untuk kemasukan ini.',
  'enroll.withdrawn.title': 'Permohonan ditarik balik',
  'enroll.reapply': 'Mohon semula',
  'enroll.review_note': 'Nota daripada akademi',

  'enroll.status.pending': 'Menunggu semakan',
  'enroll.status.approved': 'Diluluskan',
  'enroll.status.rejected': 'Tidak diterima',
  'enroll.status.withdrawn': 'Ditarik balik',

  // --- Senarai pemohon sendiri ----------------------------------------------
  'enroll.mine.title': 'Permohonan anda',
  'enroll.mine.description':
    'Kursus yang anda mohon. Permohonan yang diluluskan memberi anda akses serta-merta.',
  'enroll.mine.reviewed': 'Disemak {date}',

  // --- Kakitangan: baris gilir semakan --------------------------------------
  'enroll.queue.subtitle':
    'Permohonan daripada halaman pendaftaran awam kursus anda.',
  'enroll.queue.pending': 'Menunggu semakan',
  'enroll.queue.reviewed': 'Telah disemak',
  'enroll.queue.search_placeholder': 'Cari nama, e-mel, telefon atau kursus',
  'enroll.queue.empty': 'Tiada permohonan lagi.',
  'enroll.queue.empty_hint':
    'Buka satu kursus untuk pendaftaran dan kongsi pautannya untuk mula menerima permohonan.',
  'enroll.queue.no_match': 'Tiada permohonan sepadan dengan penapis ini.',

  // --- Kakitangan: helaian semakan ------------------------------------------
  'enroll.review.title': 'Permohonan pendaftaran',
  'enroll.review.details': 'Maklumat yang dihantar',
  'enroll.review.applicant_note': 'Daripada pemohon',
  'enroll.review.note_label': 'Nota (pilihan)',
  'enroll.review.note_placeholder':
    'Dipaparkan kepada pemohon bersama keputusan.',
  'enroll.review.approve': 'Luluskan',
  'enroll.review.approving': 'Meluluskan…',
  'enroll.review.reject': 'Tolak',
  'enroll.review.rejecting': 'Menolak…',
  'enroll.review.reviewed_on': 'Disemak {date}',
  'enroll.review.outcome_student': 'Rekod pelajar',
  'enroll.review.full_warning':
    'Kemasukan ini telah penuh ({taken} daripada {capacity}). Meluluskannya menambah tempat melebihi had.',
  'enroll.review.what_happens':
    'Kelulusan akan mencipta rekod pelajar jika belum ada, memautkannya kepada akaun ini dan mendaftarkan mereka. Tiada invois dicipta.',

  'enroll.review.match.title': 'Kemungkinan rekod sedia ada',
  'enroll.review.match.body':
    'Akademi ini sudah mempunyai rekod pelajar yang menyerupai pemohon ini.',
  'enroll.review.match.create_new': 'Cipta rekod pelajar baharu',
  'enroll.review.match.link': 'Pautkan kepada {name}',
  'enroll.review.match.verified_email': 'E-mel disahkan yang sama',
  'enroll.review.match.email': 'E-mel sama — belum disahkan',
  'enroll.review.match.ic': 'Nombor kad pengenalan yang sama',
  'enroll.review.match.not_linkable':
    'Tidak boleh dipautkan secara automatik: pemohon belum mengesahkan alamat e-mel ini. Luluskan sebagai rekod baharu dan gabungkan kedua-duanya secara manual.',

  // --- Kakitangan: kad tetapan kursus ---------------------------------------
  'enroll.card.title': 'Pendaftaran',
  'enroll.card.description':
    'Tambah pelajar yang sudah mempunyai rekod, atau buka halaman awam supaya orang baharu boleh memohon.',
  'enroll.settings.title': 'Halaman pendaftaran',
  'enroll.settings.description':
    'Benarkan orang ramai memohon tempat melalui pautan awam.',
  'enroll.settings.open': 'Buka untuk pendaftaran',
  'enroll.settings.needs_publish':
    'Kursus perlu diterbitkan sebelum halaman ini boleh diakses.',
  'enroll.settings.listed': 'Papar pada halaman pendaftaran akademi',
  'enroll.settings.listed_hint':
    'Matikan untuk kemasukan tertutup — pautan masih berfungsi.',
  'enroll.settings.configure': 'Tetapan',
  'enroll.settings.preview': 'Pratonton',
  'enroll.settings.link_note':
    'Sesiapa yang ada pautan ini boleh memohon. Tiada sesiapa didaftarkan sehingga anda meluluskannya.',
  'enroll.settings.pending_one': '{count} menunggu semakan',
  'enroll.settings.pending_other': '{count} menunggu semakan',
  'enroll.settings.seats_uncapped': '{taken} telah mendaftar · tiada had tempat',
  'enroll.settings.seats_capped': '{taken} daripada {capacity} tempat diisi',
  'enroll.settings.no_deadline': 'Tiada tarikh tutup',
  'enroll.settings.dialog.title': 'Tetapan pendaftaran',
  'enroll.settings.dialog.description': 'Terpakai untuk kursus ini sahaja.',
  'enroll.settings.capacity': 'Tempat',
  'enroll.settings.capacity_hint':
    'Biarkan kosong untuk tiada had. Kemasukan yang penuh masih menerima permohonan — anda yang menentukan siapa mendapat tempat.',
  'enroll.settings.closes_at': 'Tutup permohonan pada',
  'enroll.settings.closes_at_hint':
    'Biarkan kosong untuk kekal terbuka sehingga anda menutupnya.',
  'enroll.settings.intro': 'Pengenalan',
  'enroll.settings.intro_placeholder':
    'Dipaparkan di atas borang — untuk siapa kemasukan ini, apa yang perlu dibawa, bila ia bermula.',
  'enroll.settings.required': 'Maklumat yang dikumpulkan',
  'enroll.settings.required_hint':
    'Nama penuh dan e-mel sentiasa diminta. Tanda apa-apa lagi yang perlu dikumpulkan borang — semua yang ditanda adalah wajib.',

  // --- Kakitangan: pendaftaran pukal melalui e-mel --------------------------
  'enroll.bulk.action': 'Daftarkan pelajar',
  'enroll.bulk.title': 'Daftarkan pelajar sedia ada',
  'enroll.bulk.description':
    'Tampal senarai alamat e-mel, atau muat naik CSV. Hanya mereka yang sudah mempunyai rekod pelajar dalam akademi ini boleh didaftarkan dengan cara ini.',
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
    'Mereka perlu rekod pelajar dalam akademi ini dahulu — tambah atau import mereka di halaman Pelajar, atau hantar pautan pendaftaran supaya mereka boleh memohon.',
  'enroll.bulk.ambiguous_title':
    'Lebih daripada seorang pelajar berkongsi alamat ini',
  'enroll.bulk.ambiguous_hint':
    'Daftarkan mereka dari halaman pelajar itu sendiri, supaya rekod yang betul dipilih.',
  'enroll.bulk.invalid_title': 'Alamat e-mel tidak sah',
  'enroll.bulk.archived_note':
    'Pelajar yang diarkibkan tidak dipadankan — ia dikira sebagai tiada rekod.',
  'enroll.bulk.submit': 'Daftarkan {count}',
  'enroll.bulk.submitting': 'Mendaftarkan…',
  'enroll.bulk.nothing': 'Tiada apa-apa untuk didaftarkan.',
  'enroll.bulk.done_one': '{count} pelajar telah didaftarkan.',
  'enroll.bulk.done_other': '{count} pelajar telah didaftarkan.',
}
