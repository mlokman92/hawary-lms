// PARTITION: teaching — loaded with ?db=teaching (web/shots.teaching.mjs).
//
// The teaching side of the back office, around the rows base already has:
//
//   1. Kuiz 1 of the hero intake shows every question type (still 10 questions, 20 points).
//   2. Coursework: quiz attempts and tugasan hand-ins for all three intakes — a marked history
//      for Siri 1 and Siri 2, and the hero intake's first week with work still waiting.
//      Trainers see only the courses they teach (the shape of app.can_grade_course).
//   3. The public join link (get_academy_enrollment) and approve_enrollment.
//   4. The staff roster (list_academy_staff).
//   5. Login analytics (login_analytics, list_user_logins), simulated once from 2 August.
//   6. The AI check column of the LPKC queue: `ai_state` / `ai_points` on each report row,
//      DERIVED from that report's own timeline after the film's clock has settled it.
//
// Nothing here inserts into enrollments(pending), report_submissions, appointments or
// notifications, so the sidebar badges and the dashboard read exactly as they do with base alone.

import type { Ctx, FakeDb, Row } from '..'
import {
  ACADEMY_ID,
  CAST_STUDENT_NUMBERS,
  ID,
  TODAY,
  TRAINERS,
  at,
  courseOfStudent,
  day,
  mytDate,
  plusMinutes,
  rng,
  roster,
  studentId,
  uid,
  ymd,
} from '..'

type CourseKey = 'siri1' | 'siri2' | 'siri3'
type WeekKey = 'week1' | 'week2'

const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000
const iso = (ms: number) => new Date(ms).toISOString()

/** An instant inside [from, to] at a waking hour of that Malaysian day. `skew` > 1 pulls it early. */
function when(r: ReturnType<typeof rng>, fromMs: number, toMs: number, skew = 1): number {
  const lo = Math.min(fromMs, toMs)
  const hi = Math.max(fromMs, toMs)
  const t = lo + Math.pow(r(), skew) * (hi - lo)
  const dayIx = Math.floor((t + 8 * HOUR_MS) / DAY_MS)
  const ms = dayIx * DAY_MS - 8 * HOUR_MS + (7 * 60 + r.int(0, 16 * 60 - 1)) * 60_000
  return Math.max(lo, Math.min(hi, ms))
}

// The brand's Academy tile (brand/icon-academy.svg, shapes copied exactly) as the academy's
// uploaded logo on the public join page. Inline because the page's CSP allows nothing remote.
const ACADEMY_LOGO =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="#0f766e"/>' +
      '<path fill="#ffffff" d="M224 760V536A288 288 0 0 1 800 536V760H672V536A160 165.33 0 0 0 352 536V760Z"/>' +
      '<circle fill="#fbbf24" cx="512" cy="668" r="96"/></svg>',
  )

export default function teaching(db: FakeDb): void {
  quizMix(db)
  coursework(db)
  enrolment(db)
  staffRoster(db)
  analytics(db)
  aiCheck(db)
}

// ---------------------------------------------------------------------------
// 1. Kuiz 1: Perkembangan Fizikal (hero intake) — one of every question type
// ---------------------------------------------------------------------------

function quizMix(db: FakeDb): void {
  const q = (i: number) => uid('question', `siri3/week1/${i}`)
  const choice = (i: number, k: number) => uid('choice', `siri3/week1/${i}/${k}`)
  const opts = (i: number, texts: string[]) => texts.map((text, k) => ({ id: choice(i, k), text }))

  // The ten rows are base's; six keep their wording, four change type. Two marks each: 20.
  db.patch('assessment_questions', q(0), { sort_order: 0 }) // single choice
  db.patch('assessment_questions', q(4), { sort_order: 1 }) // true / false

  const multi = opts(2, ['Menguli doh mainan', 'Menggunting kertas mengikut garisan', 'Berlari berhalangan di padang', 'Memasukkan manik ke dalam tali'])
  db.patch('assessment_questions', q(2), {
    sort_order: 2,
    question_type: 'multiple_choice',
    prompt: 'Pilih SEMUA aktiviti yang merangsang kemahiran motor halus.',
    options: { choices: multi },
    correct_answer: [multi[0].id, multi[1].id, multi[3].id],
  })

  const left = ['3 bulan', '7 bulan', '13 bulan', '3 tahun'].map((text, k) => ({ id: uid('choice', `siri3/week1/3/L${k}`), text }))
  const right = ['Mengangkat kepala semasa meniarap', 'Duduk tanpa sokongan', 'Berjalan sendiri', 'Mengayuh basikal roda tiga'].map((text, k) => ({ id: uid('choice', `siri3/week1/3/R${k}`), text }))
  db.patch('assessment_questions', q(3), {
    sort_order: 3,
    question_type: 'matching',
    prompt: 'Padankan setiap usia dengan pencapaian perkembangan fizikal yang biasa dilihat.',
    options: { left, right },
    correct_answer: Object.fromEntries(left.map((l, k) => [l.id, right[k].id])),
  })

  db.patch('assessment_questions', q(6), {
    sort_order: 4,
    question_type: 'short_text',
    prompt: 'Namakan satu refleks yang dapat dilihat pada bayi baru lahir.',
    options: null,
    correct_answer: null,
  })
  db.patch('assessment_questions', q(5), {
    sort_order: 5,
    question_type: 'essay',
    prompt:
      'Huraikan dua aktiviti di TASKA yang merangsang kemahiran motor kasar kanak-kanak berumur 3 tahun, dan nyatakan satu langkah keselamatan bagi setiap aktiviti.',
    options: null,
    correct_answer: null,
  })

  db.patch('assessment_questions', q(1), { sort_order: 6 })
  db.patch('assessment_questions', q(7), { sort_order: 7 })
  db.patch('assessment_questions', q(8), { sort_order: 8 })
  db.patch('assessment_questions', q(9), { sort_order: 9 })
}

// ---------------------------------------------------------------------------
// 2. Coursework
// ---------------------------------------------------------------------------

/** The hand-in opened by the `grade-submission` shot: Damia Qistina Roslan's Tugasan 1. */
export const HERO_SUBMISSION = uid('submission', 'siri3/week1/331')

const DAMIA_PLAN = [
  'RANCANGAN AKTIVITI HARIAN',
  'Kumpulan Bunga Raya (3–4 tahun), 12 orang kanak-kanak',
  '',
  '8.00 pagi · Ketibaan dan pemeriksaan kesihatan',
  'Objektif: Kanak-kanak memberi salam dan menyimpan beg di rak sendiri.',
  'Langkah keselamatan: Suhu badan dan kuku diperiksa sebelum masuk ke kelas.',
  '',
  '9.00 pagi · Motor kasar: “Lompat Arnab”',
  'Objektif: Melompat dengan dua belah kaki melepasi tiga gelung.',
  'Bahan: 6 gelung rotan, tikar getah, wisel.',
  'Langkah keselamatan: Kawasan lapang; seorang pengasuh menunggu di hujung laluan.',
  '',
  '10.00 pagi · Motor halus: Menguli doh dan mencucuk manik',
  'Objektif: Menggentel, mencubit dan memasukkan manik besar ke dalam tali.',
  'Bahan: Doh buatan sendiri, manik kayu 2 cm, tali kasut.',
  '',
  '11.00 pagi · Bahasa: Bercerita “Sang Kancil dan Buaya”',
  'Objektif: Menjawab dua soalan “siapa” dan “di mana” tentang cerita.',
  'Bahan: Buku besar bergambar, boneka jari.',
  '',
  'Refleksi: Saya menyusun aktiviti aktif dan tenang secara berselang-seli supaya kanak-kanak tidak cepat letih.',
].join('\n')

const PLAN_OPENERS = [
  'Rancangan aktiviti harian untuk kumpulan 3–4 tahun: ketibaan, senaman pagi, aktiviti motor halus, waktu bercerita dan rehat.',
  'Rancangan sehari di TASKA dengan objektif bagi setiap slot, bahan yang diperlukan dan langkah keselamatan.',
  'Jadual aktiviti harian berserta objektif pembelajaran, persediaan bahan dan catatan keselamatan.',
]
const OBSERVATION_OPENERS = [
  'Rekod anekdot 30 minit semasa bermain bebas, diikuti refleksi tentang domain sosioemosi dan bahasa.',
  'Pemerhatian ke atas “Adik A” di sudut blok; refleksi tentang kemahiran motor halus dan penyelesaian masalah.',
]

function coursework(db: FakeDb): void {
  const attempts: Row[] = []
  const submissions: Row[] = []

  // --- the two intakes that have finished both weeks: a marked history -------
  const history: { key: 'siri1' | 'siri2'; weekOne: string; graders: string[] }[] = [
    { key: 'siri1', weekOne: '2026-05-11', graders: [ID.user.amirul, ID.user.izzah] },
    { key: 'siri2', weekOne: '2026-07-13', graders: [ID.user.farah, ID.user.izzah, ID.user.hajar] },
  ]
  const scores = [20, 20, 18, 18, 18, 16, 16, 16, 14, 14, 12, 10]
  for (const h of history) {
    ;(['week1', 'week2'] as WeekKey[]).forEach((wk, wi) => {
      const ids = ID.content[h.key][wk]
      const opens = Date.parse(at(h.weekOne)) + wi * 7 * DAY_MS + 8 * HOUR_MS
      const quizCloses = opens + 11 * DAY_MS
      const due = Date.parse(db.get('assignments', ids.assignment).due_at ?? iso(opens + 9 * DAY_MS))
      for (const n of roster(h.key)) {
        const r = rng(`work/${h.key}/${wk}/${n}`)
        if (r.chance(0.965)) {
          const t1 = when(r, opens, quizCloses - 3 * HOUR_MS, 1.7)
          const s1 = r.pick(scores)
          attempts.push(attempt(`${h.key}/${wk}/${n}/1`, ids.assessment, n, 1, t1, 'graded', s1, null, t1))
          if (s1 <= 14 && r.chance(0.7)) {
            const t2 = Math.min(quizCloses - HOUR_MS, t1 + r.int(3, 40) * HOUR_MS)
            attempts.push(attempt(`${h.key}/${wk}/${n}/2`, ids.assessment, n, 2, t2, 'graded', Math.min(20, s1 + 2 * r.int(1, 3)), null, t2))
          }
        }
        if (r.chance(0.94)) {
          const late = wi === 0 && r.chance(0.06)
          const t = late ? when(r, due + 2 * HOUR_MS, due + 3 * DAY_MS) : when(r, opens + DAY_MS, due - HOUR_MS, 0.8)
          const gradedAt = when(r, t + 6 * HOUR_MS, t + 4 * DAY_MS)
          submissions.push({
            id: uid('submission', `${h.key}/${wk}/${n}`),
            assignment_id: ids.assignment,
            student_id: studentId(n),
            status: r.chance(0.9) ? 'returned' : 'graded',
            content: r.pick(wi === 0 ? PLAN_OPENERS : OBSERVATION_OPENERS),
            submitted_at: iso(t),
            grade: r.int(62, 96),
            feedback: null,
            graded_at: iso(gradedAt),
            graded_by: r.pick(h.graders),
            created_at: iso(t - r.int(20, 180) * 60_000),
          })
        }
      }
    })
  }

  // --- the hero intake: Week 1 opened on Monday 5 October --------------------
  const s3 = ID.content.siri3.week1
  const invented = rng('teaching/siri3').shuffle(roster('siri3').filter((n) => !CAST_STUDENT_NUMBERS.includes(n)))
  let next = 0
  const take = (count: number) => invented.slice(next, (next += count))

  // Kuiz 1 now has a short answer and an essay, so every attempt needs a person.
  // Marked so far: everything handed in before 10 am yesterday.
  const marked: [n: number, at: string, score: number][] = [
    [318, day(-2, '20:14'), 18], // Nur Aisyah Razak — the bell told her "18 / 20" yesterday at 16:32
    [319, day(-2, '10:42'), 16],
    [320, day(-2, '11:05'), 20],
    [321, day(-2, '14:30'), 14],
    [322, day(-2, '15:12'), 18],
    [324, day(-2, '21:40'), 20],
    [326, day(-1, '08:20'), 16],
    [327, day(-1, '09:15'), 18],
    [330, day(-2, '19:02'), 16],
    [331, day(-2, '16:48'), 18],
  ]
  for (const [n, t, score] of marked) {
    const first = Date.parse(t) < Date.parse(day(-2, '17:00'))
    const gradedAt = n === 318 ? day(-1, '16:32') : first ? day(-2, `2${n % 2}:${10 + (n % 40)}`) : day(-1, `16:${10 + (n % 30)}`)
    attempts.push(attempt(`siri3/week1/${n}/1`, s3.assessment, n, 1, Date.parse(t), 'graded', score, first ? ID.user.farah : ID.user.hajar, Date.parse(gradedAt)))
  }
  take(38).forEach((n, i) => {
    const r = rng(`work/siri3/quiz/${n}`)
    const t = when(r, Date.parse(day(-2, '09:00')), Date.parse(day(-1, '09:50')), 1.4)
    const first = t < Date.parse(day(-2, '17:00'))
    const gradedAt = first ? Date.parse(day(-2, '20:30')) + i * 150_000 : Date.parse(day(-1, '15:50')) + i * 70_000
    attempts.push(attempt(`siri3/week1/${n}/1`, s3.assessment, n, 1, t, 'graded', r.pick(scores), first ? ID.user.farah : ID.user.hajar, gradedAt))
  })

  // Waiting for a mark: the objective part is banked (out of 16), the rest is the trainer's.
  const waitingQuiz: [n: number | null, at: string, banked: number][] = [
    [323, day(-1, '10:20'), 14], // Puteri Balqis Azman
    [325, day(-1, '11:05'), 16], // Wan Nur Iman Wan Azmi
    [null, day(-1, '11:40'), 12],
    [328, day(-1, '14:11'), 14], // Khairunnisa Abd Latif
    [null, day(-1, '16:02'), 16],
    [329, day(-1, '20:34'), 12], // Alya Batrisya Fauzi
    [null, day(-1, '21:17'), 14],
    [null, day(-1, '22:05'), 10],
    [332, day(0, '07:48'), 16], // Nabilah Huda Sulaiman
    [null, day(0, '08:31'), 14],
    [333, day(0, '09:26'), 12], // Mohd Irfan Hakim Salleh
    [null, day(0, '10:03'), 16],
    [null, day(0, '10:51'), 14],
  ]
  for (const [who, t, banked] of waitingQuiz) {
    const n = who ?? take(1)[0]
    attempts.push(attempt(`siri3/week1/${n}/1`, s3.assessment, n, 1, Date.parse(t), 'submitted', banked, null, null))
  }

  // Tugasan 1: Rancangan Aktiviti Harian — due 14 October, the keen ones are in already.
  const returned: [n: number, at: string, grade: number, released: boolean][] = [
    [319, day(-2, '15:20'), 84, true],
    [321, day(-2, '17:45'), 78, true],
    [323, day(-2, '20:10'), 91, true],
    [325, day(-2, '21:30'), 80, true],
    [328, day(-2, '22:12'), 88, false],
    [329, day(-1, '07:40'), 74, true],
    [332, day(-1, '08:25'), 86, true],
  ]
  for (const [n, t, grade, released] of returned) {
    submissions.push({
      id: uid('submission', `siri3/week1/${n}`),
      assignment_id: s3.assignment,
      student_id: studentId(n),
      status: released ? 'returned' : 'graded',
      content: PLAN_OPENERS[n % PLAN_OPENERS.length],
      submitted_at: t,
      grade,
      feedback: released ? 'Objektif jelas dan aktiviti sesuai dengan umur. Teruskan.' : null,
      graded_at: day(-1, `14:${10 + (n % 45)}`),
      graded_by: ID.user.hajar,
      created_at: plusMinutes(t, -42),
    })
  }
  take(13).forEach((n, i) => {
    const r = rng(`work/siri3/tugasan/${n}`)
    const t = when(r, Date.parse(day(-2, '11:00')), Date.parse(day(-1, '08:50')))
    submissions.push({
      id: uid('submission', `siri3/week1/${n}`),
      assignment_id: s3.assignment,
      student_id: studentId(n),
      status: r.chance(0.85) ? 'returned' : 'graded',
      content: r.pick(PLAN_OPENERS),
      submitted_at: iso(t),
      grade: r.int(68, 94),
      feedback: null,
      graded_at: iso(Date.parse(day(-1, '14:05')) + i * 240_000),
      graded_by: i % 3 === 0 ? ID.user.farah : ID.user.hajar,
      created_at: iso(t - 35 * 60_000),
    })
  })

  const waitingWork: [n: number | null, at: string][] = [
    [331, day(-1, '09:18')], // Damia Qistina Roslan — opened by the grade-submission shot
    [330, day(-1, '10:47')], // Liyana Amirah Shukri
    [327, day(-1, '11:32')], // Syafiqah Ridzuan
    [null, day(-1, '14:05')],
    [326, day(-1, '16:50')], // Hannah Maisarah Jalil
    [324, day(-1, '20:26')], // Zulaikha Hamdan
    [null, day(-1, '21:40')],
    [322, day(-1, '22:15')], // Intan Syazwani Halim
    [null, day(0, '08:02')],
    [null, day(0, '09:37')],
    [320, day(0, '10:58')], // Nurul Huda Mansor
  ]
  for (const [who, t] of waitingWork) {
    const n = who ?? take(1)[0]
    submissions.push({
      id: uid('submission', `siri3/week1/${n}`),
      assignment_id: s3.assignment,
      student_id: studentId(n),
      status: 'submitted',
      content: n === 331 ? DAMIA_PLAN : PLAN_OPENERS[n % PLAN_OPENERS.length],
      submitted_at: t,
      grade: null,
      feedback: null,
      graded_at: null,
      graded_by: null,
      created_at: plusMinutes(t, -55),
    })
  }

  db.add('assessment_attempts', attempts)
  db.add('assignment_submissions', submissions)

  // Attached in the Student mobile app; the web shows them.
  const damiaAt = day(-1, '09:18')
  db.add('assignment_submission_files', [
    { id: uid('submission-file', '331/1'), submission_id: HERO_SUBMISSION, file_name: 'Rancangan_Aktiviti_Harian_Damia.pdf', file_path: `${ACADEMY_ID}/submissions/${HERO_SUBMISSION}/rancangan.pdf`, mime_type: 'application/pdf', size_bytes: 421_888, created_at: damiaAt },
    { id: uid('submission-file', '331/2'), submission_id: HERO_SUBMISSION, file_name: 'Susun_atur_kelas.jpg', file_path: `${ACADEMY_ID}/submissions/${HERO_SUBMISSION}/susun-atur.jpg`, mime_type: 'image/jpeg', size_bytes: 1_887_436, created_at: plusMinutes(damiaAt, 1) },
  ])

  // app.can_grade_course: an admin marks anything, a trainer only the courses she is assigned to.
  const courseOf = new Map<string, string>()
  for (const a of db.rows('assessments')) courseOf.set(a.id, a.course_id)
  for (const a of db.rows('assignments')) courseOf.set(a.id, a.course_id)
  const teaches = (c: Ctx, courseId: string | undefined) =>
    !!courseId && !!c.instructorId && db.rows('course_instructors').some((ci) => ci.instructor_id === c.instructorId && ci.course_id === courseId)
  db.policy('assessment_attempts', (r, c) => c.role !== 'trainer' || teaches(c, courseOf.get(r.assessment_id)))
  db.policy('assignment_submissions', (r, c) => c.role !== 'trainer' || teaches(c, courseOf.get(r.assignment_id)))
}

function attempt(key: string, assessmentId: string, n: number, no: number, submittedMs: number, status: 'submitted' | 'graded', score: number, gradedBy: string | null, gradedMs: number | null): Row {
  const started = submittedMs - (9 + (n % 10)) * 60_000
  return {
    id: uid('attempt', key),
    assessment_id: assessmentId,
    student_id: studentId(n),
    attempt_no: no,
    status,
    answers: {},
    started_at: iso(started),
    submitted_at: iso(submittedMs),
    score,
    max_score: 20,
    graded_at: gradedMs === null ? null : iso(gradedMs),
    graded_by: gradedBy,
    created_at: iso(started),
  }
}

// ---------------------------------------------------------------------------
// 3. Getting in: the public join link, and Approve
// ---------------------------------------------------------------------------

function enrolment(db: FakeDb): void {
  // Readable signed out, like the real RPC (it is granted to anon).
  db.rpc('get_academy_enrollment', (args) => {
    const academy = db.find('academies', { slug: args._slug }) as Row | undefined
    if (!academy) return null
    const settings = db.find('academy_enrollment_settings', { academy_id: academy.id }) as Row | undefined
    const taken = new Map<string, number>()
    for (const e of db.rows('enrollments')) if (e.status === 'active') taken.set(e.course_id, (taken.get(e.course_id) ?? 0) + 1)
    const now = Date.now()
    const courses = db
      .rows('courses')
      .filter((c) => c.status === 'published')
      .map((c) => ({ c, s: db.find('course_enrollment_settings', { course_id: c.id }) as Row | undefined }))
      .filter(({ s }) => !!s?.is_open && (!s.closes_at || Date.parse(s.closes_at) > now))
      .sort((a, b) => a.c.title.localeCompare(b.c.title))
      .map(({ c, s }) => ({
        id: c.id,
        title: c.title,
        code: c.code,
        description: c.description,
        price_sen: c.price_sen,
        currency: c.currency,
        capacity: s!.capacity ?? null,
        seats_taken: taken.get(c.id) ?? 0,
        closes_at: s!.closes_at ?? null,
        created_at: c.created_at,
      }))
    return {
      academy: { id: academy.id, name: academy.name, slug: academy.slug, logo_url: academy.logo_url ?? ACADEMY_LOGO },
      is_open: !!settings?.is_open,
      intro: settings?.intro ?? null,
      courses,
    }
  })

  db.rpc('approve_enrollment', (args, ctx) => {
    const e = db.byId('enrollments', args._enrollment_id) as Row | null
    if (!e) return { approved: false, notify: false, reason: 'not_found' }
    if (e.status === 'active') return { approved: false, notify: false, reason: 'already_active', status: e.status }
    if (db.applyWrites) {
      const nowIso = ctx.now.toISOString()
      Object.assign(e, { status: 'active', approved_at: nowIso, access_email_at: nowIso, updated_at: nowIso })
      db.touch()
    }
    return { approved: true, notify: true, status: 'active' }
  })
}

// ---------------------------------------------------------------------------
// 4. /members — everyone who can sign in to the back office
// ---------------------------------------------------------------------------

function staffRoster(db: FakeDb): void {
  // One more person on the roster than base knows: a trainer whose access the Director has
  // withdrawn. He has no instructor record, so nothing else in the academy counts him.
  const extra = [
    { key: 'faris', name: 'Mohd Faris Kamaruddin', email: 'faris@hawary.example', role: 'trainer', status: 'suspended', joined: '2026-02-09 10:30', phone: '+60139961274' },
  ] as const
  for (const p of extra) {
    const id = uid('user', p.key)
    db.add('profiles', { id, full_name: p.name, phone: p.phone, created_at: at(p.joined) })
    db.add('academy_members', { id: uid('member', id), user_id: id, role: p.role, status: p.status, is_director: false, joined_at: at(p.joined), created_at: at(p.joined) })
  }

  const emails = new Map<string, string>([
    [ID.user.director, 'hakim@hawary.example'],
    [ID.user.admin, 'nadia@hawary.example'],
    ...TRAINERS.map((t) => [ID.user[t.key], t.email] as [string, string]),
    ...extra.map((p) => [uid('user', p.key), p.email] as [string, string]),
  ])
  const phones = new Map<string, string>([
    [ID.user.director, '+60123308890'],
    [ID.user.admin, '+60196612047'],
  ])

  db.rpc('list_academy_staff', (_args, ctx) => {
    if (!ctx.isAdmin) throw db.fail('Only an admin can list staff', { code: '42501', status: 403 })
    const rank = (m: Row) => (m.is_director ? 0 : m.role === 'admin' ? 1 : 2)
    return db
      .rows('academy_members')
      .filter((m) => m.role === 'admin' || m.role === 'trainer')
      .map((m) => {
        const profile = db.byId('profiles', m.user_id) as Row | null
        const ins = db.find('instructors', { user_id: m.user_id }) as Row | undefined
        return {
          user_id: m.user_id,
          role: m.role,
          status: m.status,
          joined_at: m.joined_at,
          full_name: profile?.full_name ?? null,
          email: emails.get(m.user_id) ?? ins?.email ?? null,
          phone: ins?.phone ?? profile?.phone ?? phones.get(m.user_id) ?? null,
          avatar_url: ins?.avatar_url ?? profile?.avatar_url ?? null,
          is_director: m.is_director === true,
          instructor_id: ins?.id ?? null,
          instructor_no: ins?.instructor_no ?? null,
          instructor_status: ins?.status ?? null,
          courses_taught: ins ? db.rows('course_instructors').filter((ci) => ci.instructor_id === ins.id).length : 0,
          student_id: null,
          student_no: null,
          _rank: rank(m),
        }
      })
      .sort((a, b) => a._rank - b._rank || String(a.joined_at).localeCompare(String(b.joined_at)))
      .map(({ _rank, ...row }) => row)
  })
}

// ---------------------------------------------------------------------------
// 5. /analytics — student logins since the log began on 2 August
// ---------------------------------------------------------------------------

function analytics(db: FakeDb): void {
  const LOG_BEGINS = '2026-08-02'
  type Account = { n: number; student: Row; course: CourseKey | null; days: Map<string, number>; last: number | null }
  let cache: Account[] | null = null

  // When each of the cast was last in today — Nur Aisyah a minute before her second upload.
  const castToday: Record<number, string> = {
    318: '11:46', 319: '08:12', 320: '10:55', 321: '09:40', 322: '07:58', 323: '11:52', 324: '08:47', 325: '10:21',
    326: '09:03', 327: '11:18', 328: '07:31', 329: '10:02', 330: '09:55', 331: '08:26', 332: '07:44', 333: '09:21',
  }

  const simulate = (): Account[] => {
    const nowMs = Date.now()
    const todayYmd = mytDate(iso(nowMs))
    const span = Math.round((Date.parse(at(TODAY)) - Date.parse(at(LOG_BEGINS))) / DAY_MS)
    const out: Account[] = []
    for (const s of db.rows('students') as Row[]) {
      if (!s.user_id || s.archived_at) continue
      const n = Number(String(s.student_no).slice(-4))
      const course = courseOfStudent(n)
      const r = rng('login/' + n)
      const keen = 0.45 + r() * 0.75
      const dormant = course !== 'siri3' && r.chance(0.13)
      const joined = mytDate(s.created_at)
      const days = new Map<string, number>()
      let last: number | null = null
      for (let i = 0; i <= span; i++) {
        const d = ymd(i, LOG_BEGINS)
        if (d < joined || d > todayYmd) continue
        const weekday = new Date(d + 'T12:00:00+08:00').getUTCDay()
        let p: number
        if (course === 'siri1') p = 0.15
        else if (course === 'siri2') p = d < '2026-09-01' ? 0.27 : 0.22
        else if (course === 'siri3') p = d >= '2026-10-05' ? 0.86 : d >= '2026-09-28' ? 0.3 : 0.12
        else p = 0.4
        p *= (weekday === 6 ? 0.5 : weekday === 0 ? 0.62 : 1) * (1 + 0.007 * i) * keen
        if (dormant) p *= 0.04
        if (d === todayYmd) p *= 0.62 // the day is not over at 11:55
        if (r() >= Math.min(0.97, p)) continue
        const count = 1 + (r.chance(0.24) ? 1 : 0) + (r.chance(0.05) ? 1 : 0)
        days.set(d, count)
        const dayStart = Date.parse(at(d))
        const t = d === todayYmd ? dayStart + (6 * 60 + 30 + r.int(0, 5 * 60 + 15)) * 60_000 : dayStart + (7 * 60 + r.int(0, 16 * 60 - 1)) * 60_000
        last = Math.min(t, nowMs - 60_000)
      }
      const hhmm = castToday[n]
      if (hhmm) {
        const t = Date.parse(at(`${todayYmd} ${hhmm}`))
        if (t <= nowMs) {
          days.set(todayYmd, Math.max(1, days.get(todayYmd) ?? 0))
          last = t
        }
      }
      out.push({ n, student: s, course, days, last })
    }
    return out
  }
  const accounts = () => (cache ??= simulate())

  const liveCourse = (studentRowId: string): string | null => {
    const titles = db
      .lookup('enrollments', 'student_id', studentRowId)
      .filter((e) => e.status !== 'cancelled')
      .map((e) => (db.byId('courses', e.course_id) as Row | null)?.title)
      .filter(Boolean)
    return titles.length ? titles.join(', ') : null
  }
  const inCourse = (a: Account, courseId: string | undefined) =>
    !courseId || db.lookup('enrollments', 'student_id', a.student.id).some((e) => e.course_id === courseId && e.status !== 'cancelled')

  db.rpc('login_analytics', (args, ctx) => {
    if (!ctx.isDirector) throw db.fail('Not allowed', { code: '42501', status: 403 })
    const thisMonth = mytDate(ctx.now.toISOString()).slice(0, 7)
    const months: string[] = []
    for (let m = thisMonth; m >= LOG_BEGINS.slice(0, 7); ) {
      months.push(m)
      const [y, mo] = m.split('-').map(Number)
      m = mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`
    }
    const month: string = args._month ?? thisMonth
    const [year, mon] = month.split('-').map(Number)
    const length = new Date(Date.UTC(year, mon, 0)).getUTCDate()
    const list = accounts().filter((a) => inCourse(a, args._course_id))
    let active = 0
    let logins = 0
    const perDay = new Map<string, number>()
    for (const a of list) {
      let any = false
      for (const [d, count] of a.days) {
        if (!d.startsWith(month)) continue
        any = true
        logins += count
        perDay.set(d, (perDay.get(d) ?? 0) + count)
      }
      if (any) active++
    }
    const days = Array.from({ length }, (_x, i) => {
      const d = `${month}-${String(i + 1).padStart(2, '0')}`
      return { day: d, logins: perDay.get(d) ?? 0 }
    })
    return { month, months, active_users: active, logins, days }
  })

  db.rpc('list_user_logins', (args, ctx) => {
    if (!ctx.isDirector) throw db.fail('Not allowed', { code: '42501', status: 403 })
    return accounts()
      .filter((a) => inCourse(a, args._course_id))
      .sort((a, b) => (b.last ?? -1) - (a.last ?? -1) || a.n - b.n)
      .map((a) => ({
        user_id: a.student.user_id,
        full_name: a.student.full_name,
        email: a.student.email,
        last_login_at: a.last === null ? null : iso(a.last),
        student_id: a.student.id,
        course: liveCourse(a.student.id),
      }))
  })
}

// ---------------------------------------------------------------------------
// 6. LPKC — what the AI check said about the latest upload
//
// Derived, not written: after base has settled every thread at the film's
// clock, each report row gets `ai_state` ('checking' | 'fix' | 'pass') and
// `ai_points` from its own timeline. The harness variant of the /lpkc queue
// (web/variants/pages/ReportsPage.tsx) prints them; the real page ignores them.
// ---------------------------------------------------------------------------

function aiCheck(db: FakeDb): void {
  db.afterLoad(() => {
    for (const report of db.rows('report_submissions') as Row[]) {
      const events = (db.where('report_events', { report_id: report.id }) as Row[]).sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
      if (events.length === 0) continue
      let lastUpload = -1
      let lastAi = -1
      events.forEach((e, i) => {
        if (e.kind === 'submitted') lastUpload = i
        if (e.actor_role === 'system') lastAi = i
      })
      if (lastAi < lastUpload) {
        Object.assign(report, { ai_state: 'checking', ai_points: null })
      } else if (events[lastAi].to_status === 'changes_requested') {
        const points = String(events[lastAi].body ?? '').split('\n').filter((line) => /^\d+\.\s/.test(line)).length
        Object.assign(report, { ai_state: 'fix', ai_points: points })
      } else {
        Object.assign(report, { ai_state: 'pass', ai_points: 0 })
      }
    }
    db.touch()
  })
}
