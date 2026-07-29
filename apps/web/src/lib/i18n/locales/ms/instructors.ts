import type { InstructorsDict } from '../en/instructors'

export const instructors: InstructorsDict = {
  // Halaman senarai
  'instructors.description':
    'Urus pengajar akademi anda dan kursus yang ditugaskan kepada mereka.',
  'instructors.add': 'Tambah pengajar',
  'instructors.invite': 'Jemput pengajar',
  'instructors.search_placeholder': 'Cari nama, e-mel, telefon, IC, subjek…',
  'instructors.filter.all_statuses': 'Semua status',
  'instructors.sort.name_asc': 'Nama A–Z',
  'instructors.sort.name_desc': 'Nama Z–A',
  'instructors.sort.joined_desc': 'Tarikh sertai: terbaharu',
  'instructors.sort.joined_asc': 'Tarikh sertai: terlama',
  'instructors.empty.no_match': 'Tiada pengajar sepadan dengan penapis anda.',
  'instructors.empty.none':
    'Belum ada pengajar. Tambah pengajar pertama anda untuk bermula.',
  'instructors.col.contact': 'Maklumat hubungan',
  'instructors.row.meta': 'Menyertai {date} · {no}',
  'instructors.row.meta_subject': 'Menyertai {date} · {no} · {subject}',

  // Halaman butiran
  'instructors.not_found': 'Pengajar tidak ditemui.',
  'instructors.back_to_list': 'Kembali ke senarai pengajar',
  'instructors.unnamed': 'Pengajar tanpa nama',
  'instructors.this_instructor': 'Pengajar ini',
  'instructors.member_since': 'Ahli sejak {date} · ID {no}',
  'instructors.account_linked': 'Akaun aplikasi dipautkan',
  'instructors.invite_to_app': 'Jemput ke aplikasi',
  'instructors.link_account': 'Pautkan akaun sedia ada',
  'instructors.needs_email':
    'Tambah e-mel untuk menjemput pengajar ini melalui e-mel.',
  'instructors.edit_profile': 'Sunting profil',

  'instructors.personal.title': 'Butiran peribadi',
  'instructors.personal.description':
    'Paparan sahaja — gunakan “Sunting profil” untuk membuat perubahan.',

  // Label medan rekod pengajar
  'instructors.field.id': 'ID pengajar',
  'instructors.field.specialization': 'Pengkhususan',
  'instructors.field.ic': 'Nombor IC',
  'instructors.field.gender': 'Jantina',
  'instructors.field.dob': 'Tarikh lahir',
  'instructors.field.phone_number': 'Nombor telefon',
  'instructors.field.bio': 'Bio',
  'instructors.field.address': 'Alamat',

  'instructors.gender.male': 'Lelaki',
  'instructors.gender.female': 'Perempuan',

  // Kad kursus yang ditugaskan
  'instructors.courses.title': 'Kursus yang ditugaskan',
  'instructors.courses.assign': 'Tugaskan kursus',
  'instructors.courses.empty': 'Belum ditugaskan ke mana-mana kursus.',
  'instructors.courses.remove': 'Alih keluar daripada kursus',
  'instructors.course_status.archived': 'Diarkibkan',

  // Zon bahaya
  'instructors.danger.title': 'Zon bahaya',
  'instructors.danger.description':
    'Pengarkiban akan mengeluarkan pengajar ini daripada senarai anda.',
  'instructors.danger.archive': 'Arkibkan pengajar',
  'instructors.danger.confirm_title': 'Arkibkan pengajar ini?',
  'instructors.danger.confirm_body':
    '{name} akan disembunyikan daripada senarai pengajar anda.',
  'instructors.danger.confirm_action': 'Arkibkan',

  // Dialog tambah / sunting
  'instructors.form.edit_title': 'Sunting pengajar',
  'instructors.form.edit_description': 'Kemas kini butiran pengajar ini.',
  'instructors.form.add_description':
    'Tambah rekod pengajar. Hanya nama dan jantina diperlukan — ID dijana secara automatik.',
  'instructors.form.gender_placeholder': 'Pilih jantina',
  'instructors.form.ic_placeholder': 'cth. 010203-14-5678',
  'instructors.form.specialization_placeholder':
    'cth. Matematik, Bahasa Inggeris',
  'instructors.form.more': 'Tambah butiran lanjut',
  'instructors.form.avatar': 'Gambar profil',
  'instructors.form.bio_placeholder': 'Bio profesional ringkas',
  'instructors.form.save_changes': 'Simpan perubahan',
  'instructors.form.name_required': 'Nama diperlukan.',
  'instructors.form.gender_required': 'Jantina diperlukan.',

  // Dialog tugaskan kursus
  'instructors.assign.title': 'Tugaskan kursus',
  'instructors.assign.description':
    'Tugaskan pengajar ini kepada salah satu kursus akademi anda.',
  'instructors.assign.placeholder': 'Pilih kursus',
  'instructors.assign.empty': 'Tiada kursus tersedia',
  'instructors.assign.required': 'Sila pilih kursus.',
  'instructors.assign.submit': 'Tugaskan',
  'instructors.assign.busy': 'Menugaskan…',

  // Dialog jemputan pengajar
  'instructors.invite_dialog.description':
    'Tambah pengajar melalui e-mel dan hantar jemputan untuk menyertai sebagai kakitangan.',
  'instructors.invite_dialog.created':
    'Pengajar ditambah dan jemputan telah dicipta.',
  'instructors.invite_dialog.sending': 'Menghantar e-mel jemputan…',
  'instructors.invite_dialog.sent': 'E-mel jemputan telah dihantar.',
  'instructors.invite_dialog.sent_to':
    'E-mel jemputan telah dihantar kepada {email}.',
  'instructors.invite_dialog.send_error':
    'Jemputan telah dicipta tetapi e-mel tidak dapat dihantar.',
  'instructors.invite_dialog.send_failed': 'E-mel tidak dapat dihantar.',
  'instructors.invite_dialog.note_sent':
    'Salin juga pautan ini sekiranya pengajar tidak menerima e-mel tersebut.',
  'instructors.invite_dialog.note_unsent':
    'Penghantaran e-mel tidak tersedia buat masa ini — kongsi pautan ini dengan pengajar.',
  'instructors.invite_dialog.name_label': 'Nama (pilihan)',
  'instructors.invite_dialog.email_label': 'Alamat e-mel',
  'instructors.invite_dialog.email_required': 'E-mel diperlukan.',
  'instructors.invite_dialog.submit': 'Hantar jemputan',
}
