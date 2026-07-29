import type { CoursesDict } from '../en/courses'

export const courses: CoursesDict = {
  // Halaman senarai
  'courses.subtitle': 'Buka kursus untuk mengurus modul dan kandungannya.',
  'courses.new': 'Kursus baharu',
  'courses.edit': 'Sunting kursus',
  'courses.assessments': 'Penilaian',
  'courses.assignments': 'Tugasan',
  'courses.menu.edit_details': 'Sunting butiran',
  'courses.menu.archive': 'Arkibkan',
  'courses.status.archived': 'Diarkibkan',
  'courses.empty.none': 'Tiada kursus lagi.',
  'courses.empty.create_first': 'Cipta kursus pertama anda',
  'courses.empty.all_archived': 'Semua kursus telah diarkibkan.',

  // Arkib
  'courses.archived_count': 'Diarkibkan ({count})',
  'courses.view_archived': 'Lihat arkib ({count})',
  'courses.archived.title': 'Kursus diarkibkan',
  'courses.archived.description':
    'Disembunyikan daripada senarai kursus. Memulihkan kursus akan mengembalikannya sebagai draf.',
  'courses.archived.empty': 'Tiada apa-apa dalam arkib.',
  'courses.archived.restore': 'Pulihkan',

  // Halaman kursus
  'courses.not_found': 'Kursus tidak dijumpai.',
  'courses.back_to_courses': 'Kembali ke senarai kursus',
  'courses.grading': 'Pemarkahan',
  'courses.module_count_one': '{count} modul',
  'courses.module_count_other': '{count} modul',

  // Modul dalam kursus
  'courses.module.new': 'Modul baharu',
  'courses.module.hidden': 'Tersembunyi',
  'courses.module.actions': 'Tindakan modul',
  'courses.module.edit': 'Sunting modul',
  'courses.module.hide': 'Sembunyikan daripada pelajar',
  'courses.module.show': 'Tunjukkan kepada pelajar',
  'courses.module.delete': 'Padam modul',
  'courses.modules.empty.title': 'Tiada modul lagi',
  'courses.modules.empty.body':
    'Nota, penilaian dan tugasan berada di dalam modul — tambah satu untuk mula membina kursus ini.',
  'courses.modules.empty.create_first': 'Cipta modul pertama',
  'courses.move_up': 'Alih ke atas',
  'courses.move_down': 'Alih ke bawah',

  // Kandungan dalam modul
  'courses.section.empty': 'Tiada lagi.',
  'courses.item.note': 'Nota',
  'courses.item.assessment': 'Penilaian',
  'courses.item.assignment': 'Tugasan',
  'courses.item.actions': 'Tindakan untuk {title}',
  'courses.item.move_to_module': 'Alih ke modul',
  'courses.item.questions_one': '{count} soalan',
  'courses.item.questions_other': '{count} soalan',
  'courses.item.due': 'Tarikh akhir {date}',
  'courses.item.points': '{points} markah',

  // Tajuk lalai bagi kandungan yang baharu dicipta
  'courses.new_item.assessment': 'Penilaian tanpa tajuk',
  'courses.new_item.assignment': 'Tugasan tanpa tajuk',

  // Pengesahan pemadaman
  'courses.delete.note.title': 'Padam nota ini?',
  'courses.delete.assessment.title': 'Padam penilaian ini?',
  'courses.delete.assignment.title': 'Padam tugasan ini?',
  'courses.delete.module.title': 'Padam modul ini?',
  'courses.delete.body': '“{title}” akan dipadam secara kekal.',
  'courses.delete.module.body_one':
    '“{title}” dan {count} item di dalamnya akan dipadam secara kekal.',
  'courses.delete.module.body_other':
    '“{title}” dan {count} item di dalamnya akan dipadam secara kekal.',

  // Borang tambah / sunting
  'courses.form.description_new': 'Cipta kursus untuk akademi anda.',
  'courses.form.description_edit': 'Kemas kini butiran kursus ini.',
  'courses.form.title_placeholder': 'cth. Kimpalan Bertauliah — Tahap 1',
  'courses.form.code': 'Kod (pilihan)',
  'courses.form.code_placeholder': 'KIMP-101',
  'courses.form.price': 'Harga (RM)',
  'courses.form.description': 'Penerangan (pilihan)',
  'courses.form.description_placeholder': 'Apa yang dipelajari dalam kursus ini…',
  'courses.form.title_required': 'Tajuk wajib diisi.',
  'courses.form.save_changes': 'Simpan perubahan',
  'courses.form.create': 'Cipta kursus',
}
