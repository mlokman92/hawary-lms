import type { jsPDF } from 'jspdf'
import {
  L,
  b,
  block,
  letterDate,
  letterDateOf,
  letterFileName,
  letterIc,
  letterhead,
  loadImages,
  setFont,
  widthOf,
  type BlockOptions,
  type Images,
  type Run,
} from '@/features/offer-letter/letter'

/**
 * The KWSP letter (Surat Pengesahan Pendaftaran Pelajar) — see
 * docs/documents.md.
 *
 * The academy's confirmation to KWSP that somebody is its student, drawn as the
 * offer letter is (features/offer-letter/letter.ts): one A4 page under the same
 * letterhead and footer, built on demand from what the record says today,
 * nothing stored. The wording and the order are the academy's own form.
 *
 * The name, the IC number, the course's two dates and the day the letter was
 * created come from the record. Everything else — the programme, its code, the
 * fee, the payee, the signature and the stamp — is the form.
 */

export type KwspLetterInput = {
  /** `students.full_name`. */
  fullName: string | null
  /** `students.ic_number`. */
  icNumber: string | null
  /** `courses.start_date` and `end_date` of the student's course, 'YYYY-MM-DD'. */
  startDate: string | null
  endDate: string | null
  /** `student_kwsp_letters.created_at` — the day the letter is signed on. */
  createdAt: string | null
}

// --- page geometry (pt, A4 portrait) ----------------------------------------

const R = 539.3 // the wordmark's right edge; the form is too dense for less
const SIZE = 9
const FORM = 8.5 // the lettered rows, as the form sets them
const LEAD = 10.6
const PARA = LEAD + 4 // last line of one paragraph to the first of the next
const TOP = 114

const X_TEXT = L + 36 // the text of "2." and "3."
const X_SUB = L + 19 // "2.1"
const X_TAG = L + 45 // "(a)", and the heading of its section
const X_LABEL = L + 69
const X_COLON = L + 262
const X_VALUE = L + 274
const X_PAYEE_TAG = L + 36
const X_PAYEE_LABEL = L + 54
const X_PAYEE_COLON = L + 166
const X_PAYEE_VALUE = L + 174

const SIGN_GAP = 35 // room for the signature above the line
const SIGN_RULE = 135
const DATE_X = R - 165
const SIGN_FLOOR = 699 // the lowest the line may sit, the stamp under it clear of the footer

// The signatory's name stamp, in the stamp's blue, centred under the line.
const STAMP = ['ROSZLINDA BINTI SHAM', 'Pengurus Pusat Latihan', 'Hawary Academy']
const STAMP_INK: [number, number, number] = [30, 58, 168]
const STAMP_SIZE = 9.5

// --- the form ---------------------------------------------------------------

const struck = (text: string): Run => ({ text, style: 'normal', strike: true })

type Row = {
  label: Run[]
  /** Left out, the label runs the full width and takes no colon. */
  value?: string
}

function studyRows(input: KwspLetterInput): Row[] {
  const ic = letterIc(input.icNumber)
  const start = letterDate(input.startDate)
  const end = letterDate(input.endDate)
  return [
    { label: ['Nama Pelajar'], value: (input.fullName ?? '').trim().toUpperCase() },
    { label: ['No.Kad Pengenalan'], value: ic },
    // The academy registers a student under their IC number.
    { label: ['No.Pendaftaran/Matrix Pelajar'], value: ic },
    { label: ['No Dokument Pelajar (Utm Sahaja)'], value: '-' },
    { label: ['Nama Kursus'], value: 'Pengajaran Prasekolah' },
    {
      label: [
        'Tahap Kursus (Sijil Tahap 3/Diploma/ Ijazah Sarjana Muda/Sarjana/ Kedoktoran/Dll',
      ],
      value: 'Tahap 4',
    },
    {
      label: [
        'Tarikh Pengajian Bermula – Tahun Tamat Pengajian ( Nyatakan Bulan Dan Tahun)',
      ],
      value: start && end ? `${start} sehingga ${end}` : start,
    },
    { label: ['Tempoh Pengajian'], value: '6 Bulan' },
    { label: ['Tahun Pengajian Semasa'], value: (input.startDate ?? '').slice(0, 4) },
    { label: ['Semesta Pengajian Semasa'], value: '-' },
    {
      // The form names three authorities; the two that are not this
      // programme's are ruled out, as on the academy's own copy.
      label: [
        'Kod Kursus / ',
        struck(
          'Pengajian Yang Di Luluskan Oleh Kementerian Pendidikan Malaysia (KPM)/ Malaysian Qualifications Agency (MQA)/',
        ),
        ' Jabatan Pembangunan Kemahiran Malaysia',
      ],
      value: 'P851-002-4:2025',
    },
    {
      label: [
        'Nombor Pendaftaran Institusi Yang Diluluskan Oleh ',
        struck('KPM/'),
        'JPK',
      ],
      value: 'PD6238',
    },
  ]
}

const FEE_ROWS: Row[] = [
  { label: ['Yuran Pengajian Tahun Semasa'], value: 'RM 2,500.00' },
  { label: ['Yuran Pengajian Semesta Semasa'], value: '-' },
  { label: ['Jumlah Yuran Keseluruhan Pengajian'], value: 'RM 2,500.00' },
]

const SPONSOR_ROWS: Row[] = [
  { label: ['Nama Pemberi Pinjaman / Penaja'], value: '-' },
  { label: ['Tempoh Pinjaman / Tajaan'], value: '-' },
  {
    label: [
      'Tempoh Pinjaman Bermula – Tempoh Pinjaman Berakhir ( Nyatakan Bulan Dan Tahun)',
    ],
    value: '-',
  },
  { label: ['Jumlah Pinjaman / Tajaan Keseluruhan'], value: '-' },
  {
    label: [
      'Jumlah yuran untuk tahun / semesta pengajian semasa yang tidak dibiayai penaja dan perlu dibiayai sendiri pelajar',
    ],
    value: '-',
  },
  {
    label: [
      'Alasan pelajar perlu menjelaskan yuran pengajian sendiri (sila nyatakan)',
    ],
  },
]

const PAYEE: [string, string][] = [
  [
    'Nama Penerima Bayaran',
    'Hawary Education Sdn Bhd (5511 9112 8510) Maybank Berhad',
  ],
  [
    'Alamat Penerima Bayaran',
    'No.15 Jalan Perjiranan 4/4 Bandar Dato Onn, 81100 Johor Bahru, Johor.',
  ],
]

// --- the page ---------------------------------------------------------------

function rule(doc: jsPDF, from: number, to: number, y: number) {
  doc.setDrawColor(0)
  doc.setLineWidth(0.5)
  doc.line(from, y, to, y)
}

function page(doc: jsPDF, input: KwspLetterInput, images: Images) {
  const set = (size: number) => (y: number, runs: Run[], options: BlockOptions = {}) =>
    block(doc, y, runs, { right: R, size, lead: LEAD, justify: false, ...options })
  const text = set(SIZE)
  const form = set(FORM)

  const section = (y: number, no: string, title: string) => {
    form(y, [no], { x: X_SUB })
    return form(y, [b(title)], { x: X_TAG, underline: true })
  }
  /** Lettered rows; returns the baseline of the last line drawn. */
  const rows = (y: number, items: Row[]) => {
    let at = y
    items.forEach(({ label, value }, i) => {
      if (i > 0) at += LEAD
      form(at, [`(${String.fromCharCode(97 + i)})`], { x: X_TAG })
      if (value === undefined) {
        at = form(at, label, { x: X_LABEL })
        return
      }
      const end = form(at, label, { x: X_LABEL, right: X_COLON - 8 })
      form(at, [':'], { x: X_COLON })
      at = Math.max(end, form(at, [value], { x: X_VALUE, maxLines: 3 }))
    })
    return at
  }

  let y = text(TOP, ['Kepada Ketua Pegawai Eksekutif'])
  y = text(y + PARA, [b('KUMPULAN WANG SIMPANAN PEKERJA')])
  y = text(y + PARA, ['Tuan,'])
  y = text(y + PARA, [b('PENGESAHAN PENDAFTARAN PELAJAR')], { underline: true })
  y = text(y + PARA, [
    'Saya ini merujuk kepada pendaftaran masuk pelajar di institusi kami.',
  ])

  y += PARA
  text(y, ['2.'])
  y = text(
    y,
    [
      'Kami mengesahkan butir-butir seperti di bawah yang telah didaftarkan sebagai pelajar di institusi kami :-',
    ],
    { x: X_TEXT },
  )

  y = section(y + PARA, '2.1', 'BUTIRAN PENGAJIAN PELAJAR')
  y = rows(y + LEAD, studyRows(input))

  y = section(y + PARA, '2.2', 'BUTIRAN YURAN')
  y = rows(y + LEAD, FEE_ROWS)

  y = section(
    y + PARA,
    '2.3',
    'BUTIRAN MAKLUMAT TENTANG TAJAAN (BIASISWA/PINJAMAN/BANTUAN PENGAJIAN (JIKA ADA)',
  )
  y = rows(y + LEAD, SPONSOR_ROWS)
  // The line the last row's answer is written on.
  y += LEAD
  rule(doc, X_LABEL, R, y)

  y += PARA
  text(y, ['3.'])
  y = text(
    y,
    [
      'Bagi tujuan pembiayaan menerusi ',
      b('Cek Jurubank'),
      ' secara pos berdaftar kepada Institusi kami, maklumat adalah seperti berikut',
    ],
    { x: X_TEXT },
  )

  y += PARA - LEAD
  PAYEE.forEach(([label, value], i) => {
    y += LEAD
    text(y, [`(${String.fromCharCode(97 + i)})`], { x: X_PAYEE_TAG })
    text(y, [label], { x: X_PAYEE_LABEL })
    text(y, [':'], { x: X_PAYEE_COLON })
    y = text(y, [value], { x: X_PAYEE_VALUE })
  })

  y = text(y + PARA, [
    'Dengan ini kami mengesahkan maklumat di atas adalah benar dan mematuhi peruntukan yang di sediakan di bawah Seksyen 54(6), Akta KWSP 1991 (pindaan) 2007.',
  ])

  // A name that ran to a second line has already spent some of the room; the
  // line gives it up rather than the footer.
  y = Math.min(y + SIGN_GAP, SIGN_FLOOR)

  // The signature sits across the line, as it does on paper. Drawn first: the
  // scan is ink on white, and the line and the stamp have to land on top of it.
  doc.addImage(images.signature, 'PNG', L + 36, y - 32, 60, 48.4)
  rule(doc, L, L + SIGN_RULE, y)

  doc.setFont('helvetica', 'bold')
  STAMP.forEach((line, i) => {
    if (i === 1) doc.setFont('helvetica', 'normal')
    doc.setFontSize(STAMP_SIZE)
    doc.setTextColor(...STAMP_INK)
    doc.text(line, L + SIGN_RULE / 2, y + 18 + i * 10.5, { align: 'center' })
  })

  const label = 'Tarikh :'
  text(y, [label], { x: DATE_X })
  setFont(doc, 'normal', SIZE)
  const from = DATE_X + widthOf(doc, label) + 2
  text(y - 2, [letterDateOf(input.createdAt)], { x: from + 6 })
  rule(doc, from, R, y)
}

// --- entry points -----------------------------------------------------------

const TITLE = 'Surat Pengesahan KWSP'

/**
 * One letter to a page, so a course's worth prints as one file. Building and
 * delivering are separate steps, as in features/payments/pdf.ts.
 */
export async function buildKwspLetters(inputs: KwspLetterInput[]) {
  const [{ jsPDF: JsPDF }, images] = await Promise.all([
    import('jspdf'),
    loadImages(),
  ])
  const doc = new JsPDF({ unit: 'pt', format: 'a4', compress: true })
  doc.setProperties({ title: TITLE, creator: 'Hawary Academy' })

  inputs.forEach((input, i) => {
    if (i > 0) doc.addPage()
    letterhead(doc, images)
    page(doc, input, images)
  })
  const only = inputs.length === 1 ? inputs[0] : undefined
  return {
    doc,
    fileName: only
      ? letterFileName(TITLE, only.fullName)
      : `${TITLE} (${inputs.length}).pdf`,
  }
}

export async function downloadKwspLetters(inputs: KwspLetterInput[]) {
  if (inputs.length === 0) return
  const { doc, fileName } = await buildKwspLetters(inputs)
  doc.save(fileName)
}
