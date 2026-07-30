import type { ImportCsvDict } from '../en/importCsv'

export const importCsv: ImportCsvDict = {
  'import.students': 'Import CSV',
  'import.students.title': 'Import pelajar daripada hamparan',
  'import.students.description':
    'Tambah ramai pelajar sekali gus. Tiada apa-apa disimpan sehingga anda melihat apa yang akan terhasil daripada setiap baris.',
  'import.instructors': 'Import CSV',
  'import.instructors.title': 'Import pengajar daripada hamparan',
  'import.instructors.description':
    'Tambah banyak rekod pengajar sekali gus. Ini mencipta rekod sahaja — menjemput mereka log masuk kekal sebagai langkah berasingan.',

  'import.choose_file': 'Pilih fail CSV',
  'import.download_template': 'Muat turun templat',
  'import.paste_instead': 'Atau tampal baris',
  'import.paste_label': 'Tampal CSV, termasuk baris pengepala',
  'import.columns_hint':
    'Lajur yang dikenali: {columns}. Susunan lajur tidak penting, dan lajur lain akan diabaikan.',

  'import.missing_columns':
    'Fail ini tiada lajur {columns}, jadi tiada apa-apa untuk diimport. Tambah lajur itu — atau muat turun templat dan mulakan daripadanya.',
  'import.no_rows': 'Fail itu mempunyai baris pengepala tetapi tiada data di bawahnya.',
  'import.unknown_columns': 'Lajur yang diabaikan: {columns}.',

  'import.ready_one': '{count} baris sedia',
  'import.ready_other': '{count} baris sedia',
  'import.problems_one': '{count} baris bermasalah',
  'import.problems_other': '{count} baris bermasalah',
  'import.duplicates_one': '{count} kemungkinan pendua',
  'import.duplicates_other': '{count} kemungkinan pendua',

  'import.col.line': 'Baris',
  'import.row.ready': 'Sedia',
  'import.row.problem': 'Bermasalah',
  'import.row.duplicate_existing': 'Sudah ada',
  'import.row.duplicate_file': 'Berulang',
  'import.preview_more':
    'dan {count} baris lagi di bawah — kesemuanya akan diimport.',

  'import.problems_title': 'Baris berikut akan dilangkau',
  'import.line': 'Baris {line}',
  'import.and_more': 'dan {count} lagi.',

  'import.include_duplicates': 'Import kemungkinan pendua sekali',
  'import.duplicates_hint':
    'Sesuatu baris dikira pendua apabila {columns} sepadan dengan seseorang yang sudah ada dalam akademi ini, atau dengan baris terdahulu dalam fail ini.',

  'import.action_one': 'Import {count} baris',
  'import.action_other': 'Import {count} baris',
  'import.importing': 'Mengimport…',
  'import.done_one': '{count} baris telah diimport.',
  'import.done_other': '{count} baris telah diimport.',
  'import.failed': 'Import gagal.',
  'import.partial':
    '{count} baris telah disimpan sebelum ini gagal; import baki yang selebihnya sahaja.',

  // Masalah pada aras sel, dipaparkan di sebelah lajur yang menyebabkannya.
  'import.error.required': 'lajur ini tidak boleh kosong',
  'import.error.email': 'bukan alamat e-mel yang sah',
  'import.error.date': 'gunakan YYYY-MM-DD atau DD/MM/YYYY',
  'import.error.gender': 'gunakan male atau female',
  'import.error.student_status':
    'gunakan active, trial, inactive, withdrawn atau unenrolled',
  'import.error.instructor_status': 'gunakan active, on_leave atau inactive',
}
