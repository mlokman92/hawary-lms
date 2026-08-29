import type { AppointmentsDict } from '../en/appointments'

export const appointments: AppointmentsDict = {
  'appt.title': 'Temu janji',
  'appt.subtitle': 'Sesi satu dengan satu antara pelajar dan pengajar.',
  'appt.book': 'Tempah',
  'appt.booking': 'Menempah…',
  'appt.auto_assigned': 'ditetapkan secara automatik',
  'appt.open_student': 'Buka pelajar',

  // --- Status ---------------------------------------------------------------
  'appt.status.booked': 'Ditempah',
  'appt.status.completed': 'Selesai',
  'appt.status.cancelled': 'Dibatalkan',
  'appt.status.no_show': 'Tidak hadir',

  // --- Satu sesi ------------------------------------------------------------
  'appt.field.instructor': 'Pengajar',
  'appt.field.status': 'Status',
  'appt.field.note': 'Nota',
  'appt.field.cancel_reason': 'Sebab',
  'appt.action.cancel': 'Batalkan sesi',
  'appt.action.complete': 'Tandakan selesai',
  'appt.action.no_show': 'Tidak hadir',
  'appt.cancel.reason': 'Sebab',
  'appt.cancel.reason_placeholder':
    'Digunakan hanya jika tiada pengganti. Tidak wajib.',

  // --- Kalendar -------------------------------------------------------------
  'appt.calendar.title': 'Diari',
  'appt.calendar.prev': 'Minggu sebelum',
  'appt.calendar.next': 'Minggu seterusnya',
  'appt.calendar.this_week': 'Minggu ini',
  'appt.calendar.all_instructors': 'Semua pengajar',

  // --- Setup (its own page: /appointments/settings) -------------------------
  'appt.setup.title': 'Tetapan tempahan',
  'appt.setup.subtitle':
    'Siapa boleh ditempah, bila, dan atas syarat apa. Ditetapkan sekali sahaja.',

  // --- Dasar ----------------------------------------------------------------
  'appt.settings.title': 'Tempahan',
  'appt.settings.description':
    'Tutup sehingga anda hidupkannya. Sebelum itu pelajar tidak nampak apa-apa untuk ditempah.',
  'appt.settings.open': 'Buka untuk tempahan',
  'appt.settings.slot': 'Tempoh sesi',
  'appt.settings.minutes': '{count} minit',
  'appt.settings.mode': 'Siapa memilih pengajar',
  'appt.settings.mode.round_robin': 'Tetapkan secara automatik',
  'appt.settings.mode.student_choice': 'Pelajar memilih',
  'appt.settings.mode.round_robin_hint':
    'Sesi dibahagi sama rata. Pelajar menempah masa, bukan orang, dan tidak ditunjukkan siapa yang lapang.',
  'appt.settings.mode.student_choice_hint':
    'Pelajar melihat pengajar yang lapang pada setiap masa dan memilih seorang.',
  'appt.settings.notice': 'Notis paling singkat (jam)',
  'appt.settings.notice_hint':
    'Berapa awal pelajar mesti menempah. Ia juga had lewat untuk membatalkan.',
  'appt.settings.horizon': 'Boleh tempah sehingga (hari ke hadapan)',
  'appt.settings.max_open': 'Sesi terbuka bagi setiap pelajar',
  'appt.settings.max_open_hint':
    'Berapa banyak sesi akan datang boleh dipegang seorang pelajar. Biarkan kosong untuk tiada had.',
  'appt.settings.max_week': 'Sesi bagi setiap pelajar seminggu',
  'appt.settings.max_week_hint':
    'Berapa banyak sesi boleh diambil seorang pelajar dalam seminggu. Biarkan kosong untuk tiada had.',

  // --- Waktu mingguan dan penutupan -----------------------------------------
  'appt.hours.title': 'Waktu',
  'appt.hours.description':
    'Bila sesi boleh ditempah, mengikut waktu akademi sendiri. Tambah julat kedua untuk waktu rehat.',
  'appt.hours.closed': 'Tutup',
  'appt.hours.none_yet':
    'Tempahan dibuka, tetapi tiada waktu ditetapkan — jadi tiada apa-apa untuk ditempah pelajar. Tambah waktu di bawah.',
  'appt.hours.from': 'Dari',
  'appt.hours.to': 'Hingga',
  'appt.hours.add': 'Tambah waktu',
  'appt.hours.remove': 'Buang',
  'appt.hours.range_invalid': 'Waktu tamat mesti selepas waktu mula.',
  'appt.timeoff.title': 'Tarikh tutup',
  'appt.timeoff.description':
    'Cuti umum, atau pengajar tiada. Tiada apa-apa boleh ditempah pada hari ini.',
  'appt.timeoff.add': 'Tutup tarikh',
  'appt.timeoff.who': 'Siapa',
  'appt.timeoff.whole_academy': 'Seluruh akademi',
  'appt.timeoff.from': 'Hari pertama',
  'appt.timeoff.to': 'Hari terakhir',
  'appt.timeoff.reason': 'Sebab',
  'appt.timeoff.reason_placeholder': 'Cuti umum. Tidak wajib.',
  'appt.timeoff.none': 'Tiada tarikh tutup akan datang.',
  'appt.timeoff.range_invalid':
    'Hari terakhir tidak boleh sebelum hari pertama.',

  // --- Kumpulan pengajar ----------------------------------------------------
  'appt.pool.title': 'Siapa boleh ditempah',
  'appt.pool.description':
    'Hanya pengajar ini ditawarkan. Tiada sesiapa boleh ditempah sehingga anda tetapkan.',
  'appt.pool.none': 'Belum ada pengajar',
  'appt.pool.none_hint': 'Tambah pengajar sebelum membuka tempahan.',
  'appt.pool.not_active':
    'Tidak aktif — ditinggalkan sehingga statusnya berubah.',
  'appt.pool.toggle_aria': 'Boleh ditempah — {name}',

  // --- Kakitangan menempah bagi pihak pelajar --------------------------------
  'appt.book_for.action': 'Tempah sesi',
  'appt.book_for.title': 'Tempah sesi',
  'appt.book_for.description':
    'Ditempah serta-merta, dan slot itu diambil dari sebelah pelajar juga.',
  'appt.book_for.student': 'Pelajar',
  'appt.book_for.student_search': 'Cari mengikut nama, e-mel atau nombor',
  'appt.book_for.no_students': 'Tiada pelajar sepadan.',
  'appt.book_for.change': 'Tukar',
  'appt.book_for.day': 'Hari',
  'appt.book_for.time': 'Masa',
  'appt.book_for.no_slots': 'Tiada yang lapang pada hari ini.',
  'appt.book_for.no_record':
    'Anda tiada rekod pengajar dalam akademi ini, jadi tiada sesiapa untuk menemani sesi ini. Pentadbir boleh melampirkannya di Ahli.',
  'appt.book_for.instructor': 'Pengajar',
  'appt.book_for.auto_round_robin': 'Tetapkan secara automatik',
  'appt.book_for.auto_any': 'Sesiapa yang lapang',
  'appt.book_for.note': 'Nota',
  'appt.book_for.note_placeholder': 'Tujuan sesi ini. Tidak wajib.',

  // --- Pelajar --------------------------------------------------------------
  'appt.learn.subtitle': 'Tempah masa dengan pengajar, satu dengan satu.',
  'appt.learn.closed': 'Tempahan ditutup',
  'appt.learn.closed_hint':
    'Akademi anda tidak menerima tempahan buat masa ini.',
  'appt.learn.book_title': 'Tempah sesi',
  'appt.learn.book_description': 'Pilih hari, kemudian masa.',
  'appt.learn.at_cap':
    'Anda sudah menempah sebanyak yang dibenarkan akademi. Batalkan satu untuk menempah yang lain.',
  'appt.learn.nothing_free':
    'Tiada yang lapang untuk ditempah buat masa ini.',
  'appt.learn.pick_day': 'Pilih hari di atas.',
  'appt.slots.day_count_one': '{count} slot',
  'appt.slots.day_count_other': '{count} slot',
  'appt.slots.available_one': '{count} masa tersedia',
  'appt.slots.available_other': '{count} masa tersedia',
  'appt.learn.instructor': 'Pengajar',
  'appt.learn.instructor_placeholder': 'Pilih pengajar',
  'appt.learn.note': 'Apa yang anda mahu bincangkan?',
  'appt.learn.note_placeholder': 'Tidak wajib.',
  'appt.learn.mine': 'Sesi saya',
  'appt.learn.none': 'Belum ada sesi',
  'appt.learn.none_hint': 'Tempah satu di atas dan ia akan muncul di sini.',
  // Daftar sesi — semua sesi, bukan minggu ini sahaja
  'appt.register.title': 'Semua sesi',
  'appt.register.subtitle':
    'Setiap sesi yang telah diadakan akademi, termasuk yang dibatalkan.',
  'appt.register.search': 'Cari nama atau nombor pelajar',
  'appt.register.upcoming': 'Akan datang',
  'appt.register.past': 'Lepas',
  'appt.register.any_time': 'Sebarang tarikh',
  'appt.register.any_status': 'Semua status',
  'appt.register.mine': 'Sesi saya',
  'appt.register.empty': 'Tiada sesi yang sepadan.',
  'appt.register.count': '{count} sesi',
  'appt.register.page': 'Halaman {page} daripada {of}',

  // Menyerahkan sesi kepada pengajar lain
  'appt.handover.done':
    '{name} akan mengambil alih sesi ini. Pelajar dan masa yang sama.',
  'appt.handover.none':
    'Tiada pengajar lain yang lapang pada masa itu, jadi sesi ini telah dibatalkan.',

}
