import type { MembersDict } from '../en/members'

export const members: MembersDict = {
  'members.title': 'Ahli',
  'members.subtitle':
    'Semua orang yang boleh log masuk ke pejabat belakang akademi ini. Pelajar diurus di halaman Pelajar.',
  'members.col.person': 'Individu',
  'members.col.access': 'Akses',
  'members.col.contact': 'Hubungan',
  'members.you': '(anda)',
  'members.actions': 'Tindakan ahli',
  'members.empty':
    'Belum ada sesiapa yang mempunyai akses pejabat belakang ke akademi ini.',
  'members.member_since': 'Ahli sejak {date}',
  'members.no_email': 'Tiada e-mel dalam rekod',
  'members.no_record':
    'Tiada rekod untuk dibuka — berikan rekod pengajar kepadanya dahulu.',

  // Tahap akses. "Pengarah" ialah individu yang mencipta akademi ini — nama
  // bagi pengasas, bukan set kebenaran yang berasingan.
  'members.tier.director': 'Pengarah',
  'members.tier.admin': 'Pentadbir',
  'members.tier.trainer': 'Jurulatih',
  'members.tier.student': 'Pelajar',
  'members.tier.director_hint':
    'Mencipta akademi ini. Kuasanya sama seperti pentadbir.',
  'members.tier.admin_hint':
    'Akses penuh kepada setiap kursus, pelajar, invois dan tetapan.',
  'members.tier.trainer_hint':
    'Akses pejabat belakang, tetapi hanya boleh memberi markah bagi kursus yang ditugaskan kepadanya.',
  'members.tier.student_hint':
    'Akses pelajar sahaja — pejabat belakang tertutup kepadanya.',

  // academy_members.status
  'members.status.active': 'Aktif',
  'members.status.invited': 'Dijemput',
  'members.status.suspended': 'Digantung',

  // Tindakan
  'members.make_admin': 'Jadikan pentadbir',
  'members.make_trainer': 'Jadikan jurulatih',
  'members.suspend': 'Gantung akses',
  'members.restore': 'Pulihkan akses',
  'members.last_admin':
    'Ini pentadbir aktif yang terakhir — menurunkan pangkat atau menggantungnya akan meninggalkan akademi ini tanpa sesiapa yang boleh mengurusnya.',
  'members.footnote':
    'Menggantung seseorang ahli akan menarik balik aksesnya serta-merta. Akses pelajar diurus di halaman pelajar masing-masing.',
  'members.access.failed': 'Akses ahli ini tidak dapat ditukar.',

  // Paksi kedua: rekod `instructors` yang dipautkan.
  'members.instructor': 'Pengajar',
  'members.instructor.make': 'Jadikan pengajar',
  'members.instructor.create_new': 'Cipta rekod baharu',
  'members.instructor.dialog_description':
    'Memberikan {name} rekod pengajar, supaya dia boleh ditugaskan kursus dan memberi markah. Tahap aksesnya tidak berubah.',
  'members.instructor.making': 'Mencipta rekod…',
  'members.instructor.made_from_profile':
    'Mencipta rekod pengajar daripada nama, e-mel dan telefon akaun ini.',
  'members.instructor.attach_label': 'Atau pautkan rekod yang sedia ada',
  'members.instructor.attach_placeholder': 'Pilih rekod pengajar',
  'members.instructor.attach': 'Pautkan rekod',
  'members.instructor.attach_empty':
    'Setiap rekod pengajar dalam akademi ini sudah dipautkan dengan sesuatu akaun.',
  'members.instructor.detach': 'Buang rekod pengajar',
  'members.instructor.needs_email':
    'Akaun ini tiada alamat e-mel, jadi rekod pengajar tidak boleh dipautkan kepadanya.',
  'members.instructor.failed': 'Rekod pengajar tidak dapat dikemas kini.',
  'members.instructor.courses_one': 'Mengajar {count} kursus',
  'members.instructor.courses_other': 'Mengajar {count} kursus',
  'members.instructor.record': 'Rekod {no}',
}
