import type { DashboardDict } from '../en/dashboard'

export const dashboard: DashboardDict = {
  // Pengepala
  'dash.header.desc': '{date} · {status}',
  'dash.header.checking': 'Memeriksa akademi anda…',
  'dash.header.all_clear': 'Tiada apa-apa memerlukan perhatian anda.',
  'dash.header.attention_one': '{count} perkara memerlukan perhatian anda.',
  'dash.header.attention_other': '{count} perkara memerlukan perhatian anda.',
  'dash.loading': 'Memuatkan akademi anda…',
  'dash.action.add_student': 'Tambah pelajar',
  'dash.action.new_invoice': 'Invois baharu',
  'dash.view_all': 'Lihat semua',

  // Senarai semak persediaan
  'dash.setup.title': 'Siapkan akademi anda',
  'dash.setup.subtitle':
    'Beberapa langkah lagi sebelum pelajar boleh mula belajar.',
  'dash.setup.hide': 'Sembunyikan',
  'dash.setup.step.course': 'Cipta kursus pertama anda',
  'dash.setup.step.module': 'Tambah modul ke dalam kursus',
  'dash.setup.step.student': 'Tambah pelajar pertama anda',
  'dash.setup.step.enroll': 'Daftarkan pelajar ke dalam kursus',
  'dash.setup.step.publish': 'Terbitkan kursus supaya pelajar dapat melihatnya',
  'dash.setup.step.gateway':
    'Sambungkan ToyyibPay untuk pembayaran dalam talian',

  // Petak perkara luar biasa
  'dash.tile.overdue.none': 'Tiada tunggakan',
  'dash.tile.overdue.hint_one': '{count} invois · paling lama {days}',
  'dash.tile.overdue.hint_other': '{count} invois · paling lama {days}',
  'dash.tile.no_course.label': 'Belum ada kursus',
  'dash.tile.no_course.none': 'Semua pelajar ada kursus',
  'dash.tile.no_course.hint': 'pelajar belum mendaftar kursus',
  'dash.tile.invites.label': 'Jemputan menunggu',
  'dash.tile.invites.none': 'Tiada jemputan menunggu',
  'dash.tile.invites.far': 'semua tamat dalam 7+ hari',
  'dash.tile.invites.today': 'satu tamat hari ini',
  'dash.tile.invites.soonest': 'paling awal tamat dalam {days}',
  'dash.tile.not_live.label': 'Belum diterbitkan',
  'dash.tile.not_live.none': 'Semuanya telah diterbitkan',
  'dash.tile.not_live.hint': 'ditanda draf dalam kursus yang diterbitkan',

  // Amaran khas pentadbir
  'dash.alert.recon.title_one': '{count} bayaran perlu diselaraskan',
  'dash.alert.recon.title_other': '{count} bayaran perlu diselaraskan',
  'dash.alert.recon.body':
    'Wang diterima dengan jumlah tidak sepadan, atau masuk ke invois yang telah dibatalkan.',
  'dash.alert.recon.cta': 'Semak',
  'dash.alert.gateway.title': 'Pembayaran dalam talian dimatikan',
  'dash.alert.gateway.body':
    'Pelajar belum boleh membayar melalui FPX — setiap invois perlu diselesaikan secara manual.',
  'dash.alert.gateway.cta': 'Sambungkan ToyyibPay',

  // Jumlah keseluruhan
  'dash.stat.students.sub': '{active} aktif · {trial} percubaan',
  'dash.stat.enrollments.label': 'Pendaftaran aktif',
  'dash.stat.enrollments.sub_one': 'dalam {count} kursus',
  'dash.stat.enrollments.sub_other': 'dalam {count} kursus',
  'dash.stat.published.label': 'Kursus diterbitkan',
  'dash.stat.published.sub': '{drafts} draf · {live}/{total} modul diterbitkan',
  'dash.stat.collected.label': 'Kutipan bulan ini',
  'dash.stat.collected.same': 'Sama seperti bulan lalu',
  'dash.stat.collected.delta': '{delta} berbanding bulan lalu',

  // Gambaran hasil
  'dash.revenue.title': 'Gambaran hasil',
  'dash.revenue.description':
    'Jumlah diinvois berbanding jumlah dikutip sepanjang {months} bulan lalu. Kutipan diambil daripada rekod bayaran; jumlah diinvois tidak termasuk draf, invois terbatal dan yang dibatalkan.',
  'dash.revenue.collected_window': 'Dikutip · {months} bulan',
  'dash.revenue.invoiced_window': 'Diinvois · {months} bulan',
  'dash.revenue.loading': 'Memuatkan hasil…',
  'dash.revenue.chart_loading': 'Memuatkan carta…',
  'dash.revenue.empty.title': 'Belum ada hasil',
  'dash.revenue.empty.body':
    'Tiada invois atau kutipan dalam {months} bulan lalu.',
  'dash.revenue.empty.cta': 'Cipta invois pertama anda',
  'dash.chart.collected': 'Dikutip',

  // Pelajar untuk disusuli
  'dash.people.title': 'Pelajar untuk disusuli',
  'dash.people.no_students': 'Belum ada pelajar.',
  'dash.people.add_first': 'Tambah pelajar pertama anda',
  'dash.people.all_enrolled': 'Setiap pelajar telah mendaftar dalam kursus.',
  'dash.people.joined': '{no} · menyertai {date}',

  // Jemputan menunggu
  'dash.invites.title': 'Jemputan menunggu',
  'dash.invites.loading': 'Memuatkan jemputan…',
  'dash.invites.empty': 'Tiada jemputan menunggu.',
  'dash.invites.cta': 'Tambah pelajar',
  'dash.invites.expires_today': 'Tamat hari ini',
  'dash.invites.expires_in': 'Tamat dalam {days}',

  // Kesediaan kursus
  'dash.courses.title': 'Kesediaan kursus',
  'dash.courses.all': 'Semua kursus',
  'dash.courses.empty.title': 'Belum ada kursus',
  'dash.courses.empty.body':
    'Cipta kursus, tambah modul, kemudian masukkan nota dan penilaian di dalamnya.',
  'dash.courses.empty.cta': 'Cipta kursus pertama anda',
  'dash.course.archived': 'Diarkibkan',
  'dash.course.modules_live': '{live}/{total} modul diterbitkan',
  'dash.course.no_modules':
    'Belum ada modul — tiada apa-apa untuk dibuka oleh pelajar.',
  'dash.course.drafts_one': '{count} draf',
  'dash.course.drafts_other': '{count} draf',
  // Nama untuk pembaca skrin pada kaunter berikon di setiap baris kursus.
  'dash.course.sr.students': 'pelajar aktif',
  'dash.course.sr.notes': 'nota',
  'dash.course.sr.assessments': 'penilaian',
  'dash.course.sr.assignments': 'tugasan',

  // Bayaran terkini
  'dash.payments.title': 'Bayaran terkini',
  'dash.payments.subtitle':
    'Bayaran yang telah dijelaskan dalam dua bulan lalu — daripada rekod bayaran, bukan baki invois.',
  'dash.payments.loading': 'Memuatkan bayaran…',
  'dash.payments.empty': 'Tiada bayaran dalam dua bulan lalu.',
}
