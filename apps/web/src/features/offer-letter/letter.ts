import type { jsPDF } from 'jspdf'
import { pdfText } from '@/features/payments/pdf'
import emblemUrl from './assets/emblem.jpg'
import wordmarkUrl from './assets/wordmark.jpg'
import signatureUrl from './assets/signature.png'

/**
 * The offer letter (surat tawaran) — see docs/offer-letter.md.
 *
 * Drawn with jsPDF for the same reason the invoice is (features/payments/
 * pdf.ts): one deterministic A4 artefact, built on demand from what the record
 * says today, with nothing stored. The wording, the page breaks and the
 * positions follow the academy's own five-page letter; the measurements below
 * are that letter's, in points.
 *
 * Four things on page one come from the record — the date, the name, the IC
 * number and the address. Everything else is the letter. It is always Malay,
 * whatever language the reader has the app in: it is a document, not a screen.
 */

export type OfferLetterInput = {
  /** `students.full_name`. */
  fullName: string | null
  /** `students.ic_number`. */
  icNumber: string | null
  /** `students.personal_address`. */
  address: string | null
  /** `courses.start_date` of the student's course, 'YYYY-MM-DD'. */
  startDate: string | null
}

// --- page geometry (pt, A4 portrait) ----------------------------------------

const L = 85 // left text edge
const R = 513.6 // right text edge
const SIZE = 11
const LEAD = 19 // 1.5 line spacing
const TIGHT = 12.65 // single spacing, for the one list that must fit its page
const PARA = LEAD * 2 // last line of one paragraph to the first of the next
const TOP = 148.1 // first baseline on a continuation page
const LIST_LABEL = 103
const LIST_TEXT = 121
const VALUE_COLON = 229 // the ":" after a field label on page one
const VALUE_X = 235.1

const FOOTER = [
  'Alamat : No.15 Jalan Perjiranan 4/4, Bandar Dato Onn, 81100 Johor Bahru, Johor',
  'Tel : 017-707 5153   Fax: 07-357 7142  Email : hawary.education@gmail.com',
  'FB Page : Hawary Academy  Website : www.hawary.com.my',
]

const MONTHS = [
  'Januari',
  'Februari',
  'Mac',
  'April',
  'Mei',
  'Jun',
  'Julai',
  'Ogos',
  'September',
  'Oktober',
  'November',
  'Disember',
]

// --- the record, as the letter prints it ------------------------------------

/**
 * '2026-04-01' -> '01 April 2026'. Read from the string, never through `Date`:
 * a start date is a calendar day and must not move with the reader's timezone.
 */
export function letterDate(day: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day ?? '')
  if (!m) return ''
  const month = MONTHS[Number(m[2]) - 1]
  return month ? `${m[3]} ${month} ${m[1]}` : ''
}

/** A MyKad number gets its dashes back; a passport number prints as stored. */
export function letterIc(ic: string | null): string {
  const value = (ic ?? '').replace(/[\s-]/g, '')
  return /^\d{12}$/.test(value)
    ? `${value.slice(0, 6)}-${value.slice(6, 8)}-${value.slice(8)}`
    : (ic ?? '').trim()
}

/** The address as one run of text: typed line breaks become commas. */
function letterAddress(address: string | null): string {
  return (address ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/,+$/, ''))
    .filter(Boolean)
    .join(', ')
    .toUpperCase()
}

// --- text -------------------------------------------------------------------

type Style = 'normal' | 'bold' | 'italic'
type Run = string | { text: string; style: Style }
const b = (text: string): Run => ({ text, style: 'bold' })

/**
 * Width as the page will draw it. jsPDF measures with kerning pairs but writes
 * the string without them, so the default measurement runs short and a
 * justified line would overshoot the margin.
 */
function widthOf(doc: jsPDF, text: string): number {
  return doc.getStringUnitWidth(text, { doKerning: false }) * doc.getFontSize()
}

function setFont(doc: jsPDF, style: Style, size = SIZE) {
  doc.setFont('helvetica', style)
  doc.setFontSize(size)
  doc.setTextColor(0)
}

type Piece = { text: string; style: Style; width: number }
/** What sits between two spaces. Usually one piece; "Amali" + "." is two. */
type Word = { pieces: Piece[]; width: number }

function wordsOf(doc: jsPDF, runs: Run[], size: number): Word[] {
  const out: Word[] = []
  let open: Word | null = null
  for (const run of runs) {
    const { text, style } =
      typeof run === 'string' ? { text: run, style: 'normal' as Style } : run
    setFont(doc, style, size)
    for (const part of pdfText(text).split(/(\s+)/)) {
      if (!part) continue
      if (/^\s+$/.test(part)) {
        open = null
        continue
      }
      const piece = { text: part, style, width: widthOf(doc, part) }
      if (open) {
        open.pieces.push(piece)
        open.width += piece.width
      } else {
        open = { pieces: [piece], width: piece.width }
        out.push(open)
      }
    }
  }
  return out
}

function breakLines(words: Word[], width: number, space: number): Word[][] {
  const lines: Word[][] = []
  let used = 0
  for (const word of words) {
    const line = lines[lines.length - 1]
    if (line && used + space + word.width <= width + 0.01) {
      line.push(word)
      used += space + word.width
    } else {
      lines.push([word])
      used = word.width
    }
  }
  return lines
}

type BlockOptions = {
  x?: number
  right?: number
  lead?: number
  size?: number
  /** Stretch every line but the last to the right edge. On by default. */
  justify?: boolean
  maxLines?: number
}

/**
 * Draw a paragraph of mixed weights from baseline `y`; returns the baseline of
 * its last line, so the caller steps on from where the text actually ended.
 */
function block(
  doc: jsPDF,
  y: number,
  runs: Run[],
  { x = L, right = R, lead = LEAD, size = SIZE, justify = true, maxLines }: BlockOptions = {},
): number {
  const width = right - x
  setFont(doc, 'normal', size)
  const space = widthOf(doc, ' ')
  let lines = breakLines(wordsOf(doc, runs, size), width, space)
  if (maxLines && lines.length > maxLines) lines = lines.slice(0, maxLines)

  lines.forEach((line, i) => {
    const last = i === lines.length - 1
    const natural = line.reduce((sum, word) => sum + word.width, 0)
    const gaps = line.length - 1
    const gap = justify && !last && gaps > 0 ? (width - natural) / gaps : space
    let cursor = x
    for (const word of line) {
      for (const piece of word.pieces) {
        setFont(doc, piece.style, size)
        doc.text(piece.text, cursor, y + i * lead)
        cursor += piece.width
      }
      cursor += gap
    }
  })
  return y + Math.max(0, lines.length - 1) * lead
}

function heading(doc: jsPDF, y: number, text: string): number {
  return block(doc, y, [b(text)])
}

function line(doc: jsPDF, y: number, text: string): number {
  return block(doc, y, [text], { justify: false })
}

/** A labelled list; `gap` is last line of one item to the first of the next. */
function list(
  doc: jsPDF,
  y: number,
  items: string[],
  label: (index: number) => string,
  { lead = LEAD, gap = LEAD }: { lead?: number; gap?: number } = {},
): number {
  let at = y
  items.forEach((item, i) => {
    if (i > 0) at += gap
    setFont(doc, 'normal')
    doc.text(label(i), LIST_LABEL, at)
    at = block(doc, at, [item], { x: LIST_TEXT, lead })
  })
  return at
}

const numbered = (i: number) => `${i + 1}.`
const lettered = (i: number) => `${String.fromCharCode(97 + i)}.`

function rightAligned(doc: jsPDF, y: number, text: string) {
  setFont(doc, 'normal')
  doc.text(text, R - widthOf(doc, text), y)
}

// --- letterhead -------------------------------------------------------------

type Images = { emblem: string; wordmark: string; signature: string }

async function dataUrl(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Could not load ${url}`)
  const blob = await res.blob()
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

/**
 * Unlike the invoice's logo, a failure here stops the download: a letter that
 * silently lost its letterhead or its signature is a wrong document, and these
 * three ship with the app, so the only way to fail is to be offline.
 */
async function loadImages(): Promise<Images> {
  const [emblem, wordmark, signature] = await Promise.all([
    dataUrl(emblemUrl),
    dataUrl(wordmarkUrl),
    dataUrl(signatureUrl),
  ])
  return { emblem, wordmark, signature }
}

function letterhead(doc: jsPDF, images: Images) {
  // Side by side. The emblem is a JPEG on white; laid over the wordmark's edge
  // it would blank the first letter.
  doc.addImage(images.emblem, 'JPEG', 85.4, 41.6, 72.7, 55.8)
  doc.addImage(images.wordmark, 'JPEG', 158.1, 46.3, 381.2, 54.3)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(0, 128, 0)
  FOOTER.forEach((text, i) => {
    doc.text(text, 297.64, 748.9 + i * 11.15, { align: 'center' })
  })
}

// --- pages ------------------------------------------------------------------

function pageOne(doc: jsPDF, input: OfferLetterInput) {
  rightAligned(doc, 148.2, 'Ruj. Kami: HA/DKM/4/2026')
  setFont(doc, 'normal')
  doc.text('Tarikh:', 373.8, 167.2)
  rightAligned(doc, 167.2, letterDate(input.startDate))

  const label = (y: number, text: string) => {
    setFont(doc, 'normal')
    doc.text(text, L, y)
    doc.text(':', VALUE_COLON, y)
  }
  const value = (y: number, text: string, options: BlockOptions = {}) =>
    block(doc, y, [text], { x: VALUE_X, justify: false, ...options })

  let y = 205.1
  label(y, 'NAMA CALON')
  y = value(y, (input.fullName ?? '').trim().toUpperCase(), { maxLines: 2 })

  y += LEAD
  label(y, 'NO. KAD PENGENALAN')
  value(y, letterIc(input.icNumber))

  y += LEAD
  label(y, 'ALAMAT')
  const address = letterAddress(input.address)
  // The letter leaves two lines for the address. A third still fits the page
  // at full size; anything longer is set smaller and tighter, so a long
  // address costs the body a line or two rather than pushing it off the page.
  setFont(doc, 'normal')
  const fits =
    breakLines(wordsOf(doc, [address], SIZE), R - VALUE_X, widthOf(doc, ' '))
      .length <= 3
  const end = fits
    ? value(y, address)
    : value(y, address, { size: 9, lead: TIGHT, maxLines: 5 })
  // Past its two lines, the address takes the room from the blank line under
  // it — with a two-line name above, a full gap here would walk the last
  // paragraph into the footer.
  const overran = end > y + LEAD
  y = Math.max(y + LEAD, end)

  y += overran ? LEAD + 4 : PARA
  y = line(doc, y, 'Tuan/Puan,')

  y += PARA
  y = block(doc, y, [
    b(
      'TAWARAN MENGIKUTI PROGRAM BIMBINGAN DIPLOMA KEMAHIRAN - MALAYSIA (DKM) TAHAP 4 PENGAJARAN PRASEKOLAH (P851-002-4:2025) PENGIKTIRAFAN PENCAPAIAN TERDAHULU (PPT) & PENILAIAN AMALI (PPA)',
    ),
  ])

  y += PARA
  y = line(doc, y, 'Assalamualaikum W.B.T. dan selamat sejahtera,')
  y = line(doc, y + LEAD, 'Dengan segala hormatnya perkara di atas adalah dirujuk.')

  y += PARA
  y = block(doc, y, [
    'Sukacita dimaklumkan bahawa pihak ',
    b('Hawary Academy'),
    ' dengan ini menawarkan kepada saudara/saudari untuk mengikuti ',
    b(
      'Program Bimbingan Diploma Kemahiran Malaysia (DKM) Tahap 4 Pengajaran Prasekolah (P851-002-4:2025) melalui kaedah Pengiktirafan Pencapaian terdahulu (PPT) dan Penilaian Amali',
    ),
    '.',
  ])

  y += PARA
  y = block(doc, y, [
    'Program bimbingan ini akan dilaksanakan bagi membantu calon membuat persediaan secara sistematik dan terancang dalam memenuhi keperluan kompetensi, penilaian serta dokumentasi yang ditetapkan oleh Jabatan Pembangunan Kemahiran (JPK).',
  ])

  y += PARA
  block(doc, y, [
    'Selain membantu calon melengkapkan keperluan pensijilan, program ini turut memberi penekanan terhadap peningkatan pengetahuan, kemahiran dan kompetensi profesional dalam bidang Pengajaran Prasekolah, selaras dengan standard Kemahiran Pekerjaan Kebangsaan (NOSS) yang berkaitan.',
  ])
}

function pageTwo(doc: jsPDF) {
  let y = heading(doc, TOP, '1. MAKLUMAT PROGRAM')
  for (const text of [
    'Program: Diploma Kemahiran Malaysia (DKM) Tahap 4 Pengajaran Prasekolah',
    'Kod NOSS: P851-002-4:2025',
    'Tempoh Bimbingan: 6 Bulan',
    'Kaedah Pelaksanaan: Pengiktirafan Pencapaian Terdahulu (PPT) & Penilaian Amali',
  ]) {
    y = line(doc, y + LEAD, text)
  }

  y = heading(doc, y + PARA, '2. KAEDAH PEMBELAJARAN DAN BIMBINGAN')
  y = line(
    doc,
    y + LEAD,
    'Program bimbingan akan dilaksanakan melalui kaedah berikut:',
  )
  y = list(
    doc,
    y + LEAD,
    [
      'Kelas bersemuka;',
      'Pembelajaran secara dalam talian;',
      'Sesi bimbingan secara individu; dan',
      'Sesi bimbingan secara berkumpulan; dan',
      'Konsultasi bersama tenaga pengajar mengikut keperluan calon.',
    ],
    numbered,
  )

  y = heading(doc, y + PARA, '3. SKOP BIMBINGAN')
  y = block(doc, y + LEAD, [
    'Sepanjang tempoh program, calon akan diberikan bimbingan dan khidmat konsultasi yang merangkumi perkara-perkara berikut:',
  ])
  list(
    doc,
    y + LEAD,
    [
      'Taklimat dan penerangan berkaitan pelaksanaan program DKM Tahap 4 – Pengajaran Prasekolah.',
      'Penyediaan Fail Kompetensi/Portfolio mengikut keperluan dan garis panduan JPK;',
      'Penyediaan Laporan Projek Kemahiran (LPKC);',
      'Penyediaan bahan pembentangan/slide presentation;',
      'Bimbingan dan persediaan bagi Penilaian Amali;',
      'Semakan, penambahbaikan dan pembetulan dokumen calon;',
      'Sesi konsultasi bersama tenaga pengajar;',
      'Bimbingan dalam penyediaan bukti-bukti kompetensi berdasarkan NOSS; dan',
      'Persediaan calon bagi menghadapi proses penilaian dan verifikasi yang berkaitan.',
    ],
    numbered,
  )
}

function pageThree(doc: jsPDF) {
  let y = heading(doc, TOP, '4. TANGGUNGJAWAB CALON')
  y = line(
    doc,
    y + LEAD,
    'Sepanjang mengikuti program bimbingan ini, calon bertanggungjawab untuk;',
  )
  y = list(
    doc,
    y + LEAD,
    [
      'Menghadiri kelas dan sesi bimbingan mengikut jadual yang telah ditetapkan;',
      'Memberikan komitmen dan kerjasama sepenuhnya sepanjang tempoh program;',
      'Menyiapkan semua tugasan, portfolio, LPKC, pembentangan dan dokumen yang diperlukan dalam tempoh yang ditetapkan;',
      'Mematuhi segala arahan, prosedur, peraturan, dan garis panduan yang ditetapkan oleh Hawary Academy;',
      'Membuat pembetulan atau penambahbaikan terhadap tugasan berdasarkan arahan tenaga pengajar;',
      'Mengemukakan maklumat dan dokumen yang benar, sah serta berkaitan dengan pengalaman dan kompetensi calon;',
      'Menjaga kerahsiaan bahan pembelajaran, modul, template, dokumen serta bahan bimbingan yang diberikan oleh Hawary Academy; dan',
      'Memastikan semua bayaran yuran dijelaskan mengikut tempoh dan kaedah pembayaran yang telah ditetapkan.',
    ],
    lettered,
  )

  y = heading(doc, y + PARA, '5. YURAN BIMBINGAN')
  y = block(doc, y + LEAD, [
    'Jumlah keseluruhan yuran bimbingan Program DKM Tahap 4 adalah sebanyak RM2,500.00.',
  ])
  y = block(doc, y + PARA, [
    'Yuran tersebut adalah sebagaimana yang telah dimaklumkan kepada calon semasa proses pendaftaran dan hendaklah dijelaskan sepenuhnya mengikut jadual pembayaran yang ditetapkan sepanjang tempoh bimbingan selama 6 bulan.',
  ])
  block(doc, y + PARA, [
    'Yuran bimbingan ini meliputi sesi pengajaran, bimbingan, konsultasi, semakan tugasan serta persediaan dokumentasi calon sepanjang tempoh program sebagaimana skop bimbingan yang dinyatakan.',
  ])
}

function pageFour(doc: jsPDF) {
  // Starts higher and sets its list single-spaced, as the letter does: three
  // sections have to share this page.
  let y = heading(doc, 119.7, '6. PRASYARAT DKM PENGAJARAN PRASEKOLAH – TANPA SPM')
  y = list(
    doc,
    y + LEAD,
    [
      'Berumur sekurang-kurangnya 21 tahun.',
      'Mempunyai pengalaman kerja berkaitan bidang prasekolah/pendidikan awal kanak-kanak.',
      'Bagi calon yang menggunakan pengalaman kerja sepenuhnya dan tidak bergantung kepada kelayakan akademik/formal, kategori DKM* menetapkan minimum 5 tahun pengalaman kerja dalam bidang berkaitan bagi laluan PPT.',
      'Pengalaman tersebut perlu boleh dibuktikan dan disahkan, contohnya pengalaman sebagai guru prasekolah, pengusaha/pengurus tadika atau tugas berkaitan pengajaran dan pengurusan pembelajaran prasekolah.',
      'Calon perlu membuat Penilaian Kendiri/Analisis Jurang Kompetensi dalam MYSPIKE dan memenuhi keperluan NOSS sebelum permohonan PPT dapat diteruskan.',
      'Calon perlu membuktikan kompetensi berdasarkan NOSS melalui penilaian portfolio atau penilaian amali, dan bagi DKM turut melibatkan Laporan Projek Kompetensi Calon (LPKC)',
    ],
    numbered,
    { lead: TIGHT },
  )

  y = heading(doc, y + 31.6, '7. MAKLUMAT PEMBAYARAN YURAN')
  y = line(
    doc,
    y + LEAD,
    'Pembayaran yuran hendaklah dibuat ke akaun rasmi seperti berikut:',
  )
  y = line(doc, y + PARA, 'Nama syarikat: Hawary Education sdn.bhd. (Hawary Academy)')
  y = line(doc, y + LEAD, 'Nama bank: Maybank Islamic Berhad.')
  y = line(doc, y + LEAD, 'No. Akaun: 5511 9112 8510')
  y = block(doc, y + PARA, [
    'Calon hendaklah mengemukakan bukti/resit pembayaran kepada pihak pentadbiran Hawary Academy bagi tujuan rekod dan pengesahan pembayaran.',
  ])

  y = heading(doc, y + PARA, '8. PENERIMAAN TAWARAN')
  y = block(doc, y + LEAD, [
    'Kami percaya bahawa penyertaan tuan/puan dalam program ini akan memberi nilai tambah kepada kerjaya serta meningkatkan tahap profesionalisme dalam bidang pendidikan awal kanak-kanak.',
  ])
  block(doc, y + PARA, [
    'Pihak Hawary Academy berharap agar peluang ini dapat dimanfaatkan sebaik-baiknya oleh calon dengan memberikan komitmen yang tinggi sehingga keseluruhan proses bimbingan, penyediaan portfolio, LPKC, penilaian amali dan proses penilaian berkaitan dapat diselesaikan dengan sempurna.',
  ])
}

function pageFive(doc: jsPDF, images: Images) {
  let y = block(doc, TOP, [
    'Kerjasama, disiplin dan komitmen calon amat penting bagi memastikan perjalanan program dapat dilaksanakan secara teratur dan memenuhi keperluan pensijilan kemahiran yang ditetapkan oleh Jabatan Pembangunan Kemahiran (JPK).',
  ])
  y = line(doc, y + LEAD * 3, 'Sekian, terima kasih.')
  y = block(doc, y + PARA, [
    {
      text: '"Memperkasa TVET, Melahirkan Tenaga Pendidikan yang Berkualiti"',
      style: 'italic',
    },
  ])
  y = line(doc, y + PARA, 'Yang menjalankan amanah,')

  // The signature sits across the dotted line, as it does on paper. Drawn
  // first: the scan is ink on white, and the dots have to land on top of it.
  doc.addImage(images.signature, 'PNG', L + 9, y + 12, 78.8, 63.6)
  y = line(doc, y + LEAD * 3, '.'.repeat(73))
  y = block(doc, y + LEAD, ['(', b('Roszlinda Bt Sham'), ')'])
  y = line(doc, y + LEAD, 'Pengurus Pusat Latihan')
  line(doc, y + LEAD, 'Hawary Academy')
}

// --- entry points -----------------------------------------------------------

/** `Surat Tawaran - NUR AISYAH.pdf`, or just `Surat Tawaran.pdf` for a blank. */
function fileName(fullName: string | null): string {
  const name = (fullName ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return name ? `Surat Tawaran - ${name}.pdf` : 'Surat Tawaran.pdf'
}

/** Building and delivering are separate steps, as in features/payments/pdf.ts. */
export async function buildOfferLetter(input: OfferLetterInput) {
  const [{ jsPDF: JsPDF }, images] = await Promise.all([
    import('jspdf'),
    loadImages(),
  ])
  const doc = new JsPDF({ unit: 'pt', format: 'a4', compress: true })
  doc.setProperties({ title: 'Surat Tawaran', creator: 'Hawary Academy' })

  const pages = [
    () => pageOne(doc, input),
    () => pageTwo(doc),
    () => pageThree(doc),
    () => pageFour(doc),
    () => pageFive(doc, images),
  ]
  pages.forEach((draw, i) => {
    if (i > 0) doc.addPage()
    letterhead(doc, images)
    draw()
  })
  return { doc, fileName: fileName(input.fullName) }
}

export async function downloadOfferLetter(input: OfferLetterInput) {
  const { doc, fileName: name } = await buildOfferLetter(input)
  doc.save(name)
}
