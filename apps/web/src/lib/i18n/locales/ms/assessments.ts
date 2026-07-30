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
  'assess.questions.meta': '{questions} · {points}',
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

  // Tetapan mengikut jenis soalan
  'qtype.label': 'Jenis soalan',
  'qedit.auto_marked': 'Dinilai automatik',
  'qedit.correct_answer': 'Jawapan betul',
  'qedit.choices.single': 'Pilihan — tandakan yang betul',
  'qedit.choices.multi': 'Pilihan — tandakan semua yang betul',
  'qedit.mark_correct': 'Tandakan sebagai betul',
  'qedit.option_placeholder': 'Pilihan {n}',
  'qedit.add_option': 'Tambah pilihan',
  'qedit.remove_option': 'Buang pilihan',
  'qedit.no_key_hint':
    'Tiada jawapan betul ditetapkan — soalan ini dinilai oleh pengajar.',
  'qedit.pairs': 'Pasangan — item dan padanannya',
  'qedit.pair_left_placeholder': 'Item {n}',
  'qedit.pair_right_placeholder': 'Padanan dengan…',
  'qedit.add_pair': 'Tambah pasangan',
  'qedit.remove_pair': 'Buang pasangan',
}
