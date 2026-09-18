import type { ReportsDict } from '../en/reports'

export const reports: ReportsDict = {
  // --- status ---------------------------------------------------------------
  'report.status.submitted': 'Menunggu',
  'report.status.in_review': 'Sedang disemak',
  'report.status.changes_requested': 'Perlu pembetulan',
  'report.status.approved': 'Diluluskan',

  // --- the staff queue ------------------------------------------------------
  'report.queue.desc':
    'Laporan yang dihantar untuk semakan, yang paling lama menunggu di atas.',
  'report.queue.search': 'Cari mengikut nama pelajar',
  'report.queue.empty': 'Tiada yang menunggu.',
  'report.queue.empty_hint':
    'Pelajar menghantar laporan dari halaman mereka sendiri. Tetapkan siapa yang menyemak melalui menu di atas.',
  'report.queue.empty_filtered': 'Tiada yang sepadan.',

  // --- the thread -----------------------------------------------------------
  'report.version': 'Versi {version}',
  'report.unassigned': 'Belum ada',
  'report.checked_by': 'Disemak oleh {name}',
  'report.submitted_at': 'Dihantar {when}',
  'report.assigned_to': 'Laporan ini bersama {name}.',
  'report.resubmit': 'Hantar versi baharu',
  'report.hand_on': 'Serah kepada orang lain',
  'report.open_student': 'Buka pelajar',
  'report.reply.student':
    'Tanya soalan, atau nyatakan apa yang anda ubah…',
  'report.reply.staff': 'Apa yang perlu dibetulkan?',
  'report.send': 'Hantar',
  'report.someone': 'Seseorang',
  'report.no_url': 'Fail itu tidak dapat dibuka.',

  // --- timeline entries -----------------------------------------------------
  'report.event.submitted': '{who} menghantar ini untuk semakan',
  'report.event.resubmitted': '{who} menghantar versi {version}',
  'report.event.commented': '{who} memberi komen',
  'report.event.decided': '{who} mengemas kini status',
  'report.event.assigned': '{who} menyerahkan ini kepada {to}',
  'report.event.you': '(anda)',

  // --- files ----------------------------------------------------------------
  'report.file.attach': 'Lampirkan fail',
  'report.file.uploading': 'Memuat naik…',
  'report.file.remove': 'Buang {name}',
  'report.file.download': 'Muat turun {name}',

  // --- sending --------------------------------------------------------------
  'report.submit.title': 'Hantar laporan untuk semakan',
  'report.submit.title_again': 'Hantar versi baharu',
  'report.submit.desc':
    'Untuk {course}. Akademi anda akan menetapkan penyemak untuk anda.',
  'report.submit.desc_again':
    'Ini menjadi versi {version}. Orang yang sama akan terus menyemaknya.',
  'report.submit.what': 'Apa yang anda hantar?',
  'report.submit.what_hint': 'cth. LPKC, slaid dan portfolio',
  'report.submit.files': 'Dokumen',
  'report.submit.send': 'Hantar untuk semakan',
  'report.submit.sending': 'Menghantar…',

  // --- the rota -------------------------------------------------------------
  'report.pool.title': 'Siapa menyemak laporan',
  'report.pool.desc':
    'Laporan diagihkan antara mereka ini, yang paling sedikit dahulu. Jika tiada sesiapa di sini, pelajar tidak boleh menghantar apa-apa.',
  'report.pool.none': 'Belum ada pengajar dalam akademi ini.',
  'report.pool.not_active': 'Tidak aktif — tidak dimasukkan dalam giliran',
  'report.pool.toggle_aria': 'Benarkan {name} menyemak laporan',

  // --- the learner's list ---------------------------------------------------
  'report.learn.desc':
    'Hantar dokumen anda dan lihat apa kata penyemak.',
  'report.learn.closed': 'Akademi anda belum menyemak laporan di sini.',
  'report.learn.closed_hint':
    'Tanya pejabat bagaimana untuk menghantar laporan anda.',
  'report.learn.no_courses': 'Anda belum berada dalam mana-mana kursus.',
  'report.learn.nothing_sent': 'Belum ada yang dihantar',

  // --- dashboards -----------------------------------------------------------
  'report.dash.staff.title': 'Laporan untuk disemak',
  'report.dash.staff.empty': 'Tiada laporan menunggu semakan.',
  'report.dash.learn.title': 'Laporan anda',
  'report.dash.learn.empty': 'Tiada yang dihantar untuk semakan.',
}
