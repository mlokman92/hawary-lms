import type { StudentsDict } from '../en/students'

export const students: StudentsDict = {
  // Halaman senarai
  'students.page.description': 'Urus pelajar dan pendaftaran akademi anda.',
  'students.action.add': 'Tambah pelajar',
  'students.action.invite': 'Jemput pelajar',
  'students.search_placeholder': 'Cari nama, e-mel, telefon, IC…',
  'students.sort.name_asc': 'Nama A–Z',
  'students.sort.name_desc': 'Nama Z–A',
  'students.sort.joined_desc': 'Tarikh sertai: terbaharu',
  'students.sort.joined_asc': 'Tarikh sertai: terdahulu',
  'students.table.contact': 'Maklumat hubungan',
  'students.row.joined': 'Menyertai {date} · {no}',
  'students.empty.no_match': 'Tiada pelajar sepadan dengan tapisan anda.',
  'students.empty.none':
    'Belum ada pelajar. Tambah pelajar pertama anda untuk bermula.',

  // Butiran — pengepala
  'students.not_found': 'Pelajar tidak dijumpai.',
  'students.back_to_list': 'Kembali ke senarai pelajar',
  'students.unnamed': 'Pelajar tanpa nama',
  'students.member_since': 'Ahli sejak {date} · ID {no}',
  'students.action.edit_profile': 'Sunting profil',

  // Butiran — pautan akaun aplikasi
  'students.account.linked': 'Akaun aplikasi dipautkan',
  'students.account.invite_to_app': 'Jemput ke aplikasi',
  'students.account.link_existing': 'Pautkan akaun sedia ada',
  'students.account.needs_email':
    'Tambah e-mel untuk menjemput pelajar ini melalui e-mel.',

  // Butiran — maklumat peribadi
  'students.personal.title': 'Maklumat peribadi',
  'students.personal.description':
    'Paparan sahaja — gunakan “Sunting profil” untuk membuat perubahan.',
  'students.field.student_no': 'ID pelajar',
  'students.field.ic': 'Nombor IC',
  'students.field.gender': 'Jantina',
  'students.field.dob': 'Tarikh lahir',
  'students.field.phone_number': 'Nombor telefon',
  'students.field.organization': 'Organisasi',
  'students.field.address': 'Alamat',
  'students.gender.male': 'Lelaki',
  'students.gender.female': 'Perempuan',

  // Butiran — kursus didaftarkan
  'students.enrolled.title': 'Kursus didaftarkan',
  'students.enrolled.add': 'Tambah kursus',
  'students.enrolled.empty': 'Belum mendaftar dalam mana-mana kursus.',
  'students.enrolled.remove': 'Buang pendaftaran',
  'students.enrollment.active': 'Aktif',
  'students.enrollment.pending': 'Menunggu',
  'students.enrollment.completed': 'Selesai',
  'students.enrollment.dropped': 'Berhenti',
  'students.enrollment.cancelled': 'Dibatalkan',

  // Butiran — ringkasan bil
  'students.billing.title': 'Bil',
  'students.billing.description': 'Invois dan pembayaran untuk pelajar ini.',
  'students.billing.new_invoice': 'Invois baharu',
  'students.billing.billed': 'Jumlah bil',
  'students.billing.paid': 'Telah dibayar',
  'students.billing.outstanding': 'Baki tertunggak',
  'students.billing.empty': 'Belum ada invois.',
  'students.billing.amount_paid': '{amount} telah dibayar',
  'students.billing.due_on': 'perlu dibayar {date}',
  'students.invoice.draft': 'Draf',
  'students.invoice.issued': 'Dikeluarkan',
  'students.invoice.partially_paid': 'Sebahagian dibayar',
  'students.invoice.paid': 'Telah dibayar',
  'students.invoice.overdue': 'Tertunggak',
  'students.invoice.void': 'Tidak sah',
  'students.invoice.cancelled': 'Dibatalkan',

  // Butiran — zon berbahaya
  'students.danger.title': 'Zon berbahaya',
  'students.danger.description':
    'Pengarkiban akan mengeluarkan pelajar ini daripada senarai anda.',
  'students.danger.action': 'Arkibkan pelajar',
  'students.danger.confirm_title': 'Arkibkan pelajar ini?',
  'students.danger.confirm_body':
    '{name} akan disembunyikan daripada senarai pelajar anda.',
  'students.danger.this_student': 'Pelajar ini',
  'students.danger.confirm': 'Arkibkan',

  // Borang tambah / sunting
  'students.form.add_title': 'Tambah pelajar',
  'students.form.edit_title': 'Sunting pelajar',
  'students.form.add_description':
    'Tambah rekod pelajar. Hanya nama dan jantina diperlukan — ID pelajar dijana secara automatik.',
  'students.form.edit_description': 'Kemas kini maklumat pelajar ini.',
  'students.form.select_gender': 'Pilih jantina',
  'students.form.ic_placeholder': 'cth. 010203-14-5678',
  'students.form.more_details': 'Tambah maklumat lanjut',
  'students.form.organization_placeholder': 'cth. Klinik Mesra Sdn Bhd',
  'students.form.profile_picture': 'Gambar profil',
  'students.form.save_changes': 'Simpan perubahan',
  'students.form.name_required': 'Nama diperlukan.',
  'students.form.gender_required': 'Jantina diperlukan.',

  // Daftar dalam kursus
  'students.enroll.title': 'Daftar dalam kursus',
  'students.enroll.description':
    'Tambah pelajar ini ke salah satu kursus akademi anda.',
  'students.enroll.select_course': 'Pilih kursus',
  'students.enroll.none_available': 'Tiada kursus tersedia',
  'students.enroll.required': 'Sila pilih kursus.',
  'students.enroll.submit': 'Daftar',
  'students.enroll.busy': 'Mendaftar…',

  // Jemput pelajar ke aplikasi
  'students.invite.title': 'Jemput pelajar',
  'students.invite.description':
    'Tambah pelajar melalui e-mel dan hantar jemputan untuk menyertai.',
  'students.invite.description_done':
    'Pelajar telah ditambah dan jemputan telah dibuat.',
  'students.invite.email_label': 'Alamat e-mel',
  'students.invite.email_required': 'E-mel diperlukan.',
  'students.invite.submit': 'Hantar jemputan',
  'students.invite.sending': 'Menghantar e-mel jemputan…',
  'students.invite.sent': 'E-mel jemputan telah dihantar.',
  'students.invite.sent_to': 'E-mel jemputan telah dihantar ke {email}.',
  'students.invite.created_not_sent':
    'Jemputan telah dibuat tetapi e-mel tidak dapat dihantar.',
  'students.invite.note_sending':
    'Anda juga boleh menyalin pautan ini untuk berkongsi terus.',
  'students.invite.note_sent':
    'Salin juga pautan ini jika pelajar tidak menerima e-mel.',
  'students.invite.note_failed':
    'Penghantaran e-mel tidak berjaya — kongsi pautan ini dengan pelajar.',
  'students.invite.send_failed': 'E-mel tidak dapat dihantar.',
  'students.invite.no_response': 'Tiada respons daripada pelayan.',

  // Pemuat naik gambar profil
  'students.avatar.change': 'Tukar',
  'students.avatar.remove': 'Buang gambar',
}
