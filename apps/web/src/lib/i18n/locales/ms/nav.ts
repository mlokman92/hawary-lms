import type { NavDict } from '../en/nav'

export const nav: NavDict = {
  // Kumpulan bar sisi
  'nav.group.platform': 'Platform',
  'nav.group.learning': 'Pembelajaran',
  'nav.group.account': 'Akaun',

  // Destinasi pejabat belakang
  'nav.dashboard': 'Papan Pemuka',
  'nav.courses': 'Kursus',
  // Sub-navigasi di bawah Kursus, dikongsi oleh kedua-dua shell.
  'nav.assessments': 'Penilaian',
  'nav.assignments': 'Tugasan',
  'nav.enrollments': 'Pendaftaran',
  'nav.students': 'Pelajar',
  'nav.appointments': 'Temu janji',
  'nav.instructors': 'Pengajar',
  'nav.payments': 'Pembayaran',
  'nav.payment_log': 'Log bayaran',
  'nav.payment_report': 'Laporan bayaran',
  'nav.incentives': 'Insentif',
  'nav.members': 'Ahli',
  'nav.settings': 'Tetapan',

  // Destinasi pelajar
  'nav.learn.dashboard': 'Papan Pemuka',
  'nav.learn.courses': 'Kursus saya',
  'nav.learn.appointments': 'Temu janji',
  'nav.learn.work': 'Tugasan saya',
  'nav.learn.billing': 'Bil',
  'nav.learn.profile': 'Profil saya',

  // Carian pengepala
  'nav.search_placeholder': 'Cari pelajar dan pengajar…',
  'nav.search_label': 'Cari pelajar dan pengajar',
  'search.group.students': 'Pelajar',
  'search.group.instructors': 'Pengajar',
  'search.searching': 'Mencari…',
  'search.no_results': 'Tiada padanan untuk “{query}”.',
  'search.hint': 'Teruskan menaip — dua aksara atau lebih.',
  'search.failed': 'Carian gagal.',
  'search.clear': 'Kosongkan carian',

  'nav.toggle_sidebar': 'Togol bar sisi',
  'nav.sidebar': 'Bar sisi',
  'nav.sidebar_description': 'Memaparkan bar sisi mudah alih.',

  // Penukar akademi
  'academy.select': 'Pilih akademi',
  'academy.heading': 'Akademi',
  'academy.add': 'Tambah akademi',
  'academy.fallback': 'Akademi',
  'academy.this_academy': 'akademi ini',

  // Peranan
  'role.admin': 'Pentadbir',
  'role.trainer': 'Jurulatih',
  'role.student': 'Pelajar',

  // Menu pengguna
  'user.account': 'Akaun',
  'user.profile': 'Profil saya',
  'nav.profile': 'Profil saya',
  'user.theme': 'Tema',
  'user.theme.light': 'Cerah',
  'user.theme.dark': 'Gelap',
  'user.theme.system': 'Sistem',
  'user.language': 'Bahasa',
  'user.sign_out': 'Log keluar',

  // Keadaan pelajar tanpa rekod
  'shell.no_student_record.title':
    'Akaun anda belum dipautkan dengan rekod pelajar',
  'shell.no_student_record.body':
    'Anda telah log masuk ke {academy}, tetapi tiada rekod pelajar dipautkan dengan akaun anda. {detail}',
  'shell.no_student_record.detail':
    'Sila hubungi akademi anda untuk melengkapkan pendaftaran.',  'nav.appointment_list': 'Semua sesi',

}
