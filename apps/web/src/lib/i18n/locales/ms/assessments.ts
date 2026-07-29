import type { AssessmentsDict } from '../en/assessments'

export const assessments: AssessmentsDict = {
  // Keadaan halaman
  'assess.not_found': 'Penilaian tidak dijumpai.',
  'assess.not_found.back': 'Kembali ke kursus',

  // Pengepala
  'assess.title_placeholder': 'Penilaian tanpa tajuk',
  'assess.delete.aria': 'Padam penilaian',
  'assess.delete.title': 'Padam penilaian ini?',
  'assess.delete.body':
    '“{title}” dan semua soalannya akan dipadam secara kekal.',

  // Kad arahan
  'assess.instructions.title': 'Arahan',
  'assess.instructions.desc':
    'Penerangan, arahan dan sebarang bahan rujukan.',

  // Kad soalan
  'assess.questions.title': 'Soalan',
  'assess.questions.meta': 'Soalan terbuka · {questions} · {points}',
  'assess.questions.count_one': '{count} soalan',
  'assess.questions.count_other': '{count} soalan',
  'assess.points.count_one': '{count} markah',
  'assess.points.count_other': '{count} markah',
  'assess.questions.empty': 'Belum ada soalan.',

  // Satu baris soalan
  'assess.question.n': 'Soalan {n}',
  'assess.question.move_up': 'Alih ke atas',
  'assess.question.move_down': 'Alih ke bawah',
  'assess.question.remove': 'Buang soalan',
  'assess.question.prompt_placeholder': 'Teks soalan…',
  'assess.question.points': 'Markah',
  'assess.question.add': 'Tambah soalan',
}
