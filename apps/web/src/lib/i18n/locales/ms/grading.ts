import type { GradingDict } from '../en/grading'

export const grading: GradingDict = {
  // Queue page
  'grading.title': 'Pemarkahan',
  'grading.subtitle': 'Kerja yang dihantar untuk kursus ini.',
  'grading.back_to_courses': 'Kembali ke kursus',
  'grading.queue.awaiting': 'Menunggu markah',
  'grading.queue.awaiting_empty': 'Tiada kerja sedang menunggu markah.',
  'grading.queue.marked': 'Sudah diberi markah',
  'grading.queue.marked_empty': 'Belum ada kerja yang diberi markah.',

  // Baris gilir seluruh akademi (/assessments, /assignments)
  'grading.queue.subtitle.assessments':
    'Percubaan untuk dinilai, merentas semua kursus yang anda ajar.',
  'grading.queue.subtitle.assignments':
    'Penghantaran untuk dinilai, merentas semua kursus yang anda ajar.',
  'grading.queue.search_placeholder': 'Cari mengikut pelajar, tajuk atau kursus…',
  'grading.queue.no_match': 'Tiada yang sepadan dengan carian itu.',
  'grading.queue.empty.assessments': 'Belum ada percubaan penilaian.',
  'grading.queue.empty.assignments': 'Belum ada penghantaran tugasan.',
  'grading.queue.empty.hint':
    'Kerja akan muncul di sini setelah pelajar menghantarnya. Penilaian dan tugasan dicipta di dalam modul kursus.',
  'grading.item.assignment': 'Tugasan',
  'grading.item.assessment': 'Penilaian',
  'grading.attempt_no': 'Percubaan {no}',
  'grading.unknown_student': 'Pelajar tidak dikenali',

  // Not a grader of this course
  'grading.denied.title': 'Anda tidak boleh memberi markah bagi kursus ini',
  'grading.denied.not_assigned':
    'Anda tidak ditugaskan sebagai pengajar bagi kursus ini. Pentadbir boleh menugaskan anda melalui senarai pengajar kursus tersebut.',
  'grading.denied.no_instructor_record':
    'Akaun anda belum dipautkan kepada rekod pengajar di akademi ini, jadi tiada kursus ditugaskan kepada anda. Pentadbir boleh memautkannya melalui halaman Pengajar.',

  // Marking a submission
  'grading.submission.unavailable': 'Hantaran ini tidak tersedia untuk anda.',
  'grading.submission.meta': '{title} · dihantar {when}',
  'grading.submission.brief': 'Arahan tugasan',
  'grading.submission.work': 'Kerja yang dihantar',
  'grading.submission.no_text': 'Tiada teks dihantar.',
  'grading.mark': 'Markah',
  'grading.mark_out_of': 'Markah (daripada {max})',
  'grading.feedback': 'Maklum balas',
  'grading.feedback_placeholder': 'Apa yang baik, apa yang boleh diperbaiki…',
  'grading.save_mark': 'Simpan markah',
  'grading.save_and_return': 'Simpan & pulangkan kepada pelajar',
  'grading.return_hint':
    '“Dipulangkan” ialah tindakan yang melepaskan markah dan maklum balas kepada pelajar.',

  // Marking an attempt
  'grading.attempt.unavailable': 'Percubaan ini tidak tersedia untuk anda.',
  'grading.attempt.meta': '{title} · percubaan {no} · dihantar {when}',
  'grading.attempt.no_answer': 'Tiada jawapan diberikan.',
  'grading.attempt.no_questions': 'Penilaian ini tiada soalan.',
  'grading.attempt.manual': 'Anda menilai ini',
  'grading.attempt.auto_earned': '{earned} / {max}',
  'grading.attempt.auto_summary':
    'Dinilai secara automatik: {scored} daripada {auto}. Baki {manual} markah adalah untuk anda berikan.',
  'grading.attempt.use_auto': 'Mula daripada {scored}',
  'grading.attempt.release_hint':
    'Memberi markah pada percubaan akan memaparkan markah tersebut kepada pelajar.',
  'grading.score_out_of': 'Skor (daripada {max})',
  'grading.points_one': '{count} markah',
  'grading.points_other': '{count} markah',

  // Errors
  'grading.error.invalid_mark': 'Masukkan markah 0 atau lebih.',
  'grading.error.save_failed': 'Markah tidak dapat disimpan.',
}
