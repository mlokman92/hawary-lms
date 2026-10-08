// PARTITION: base — always loaded.
//
// The spine of the fictional Hawary Academy: everything a number on one screen
// could contradict on another. The academy, the staff and their accounts, 805
// students, the three real courses with the cast's modules and content, every
// enrolment, the whole invoice book and payment ledger (it adds up to
// cast.money.tiles to the sen), the appointment diary, the eight LPKC reports
// of cast.lpkc.queue, the bell, the pending invitations.
//
// Other partitions add DETAIL around these rows (submissions, attempts, report
// timelines, incentive batches, RPC page handlers) and may patch them. What the
// sidebar counts is listed at the bottom of this file — read it before adding
// rows to those tables.

import type { Ctx, FakeDb, Row } from '../db'
import { ACADEMY_ID, ID, enrollmentId, invoiceId, reportId, studentId, studentUserId, uid } from '../ids.js'
import {
  COURSE_FEE_SEN,
  TODAY,
  at,
  cast,
  day,
  emailFor,
  icFor,
  inventNames,
  invoiceNo,
  phoneFor,
  plusDays,
  plusMinutes,
  rm,
  rng,
  studentNo,
  ymd,
} from '../kit'
import { ASSIGNMENT_BRIEF, MODULE_BLURB, NOTE_HTML, QUIZ } from './base.content'
import { AI_NAME, HERO_MOMENTS, seedReports } from './base.reports'

type CourseKey = 'siri1' | 'siri2' | 'siri3'

// ---------------------------------------------------------------------------
// Facts other partitions may want to import
// ---------------------------------------------------------------------------

export const TRAINERS = [
  { key: 'hajar', name: 'Siti Hajar Ismail', email: 'hajar@hawary.example', no: 'HA-TR-001', gender: 'female', phone: '+60123004411', spec: 'Perkembangan Kanak-Kanak', bio: 'Jurulatih DKM sejak 2019. Bekas pengusaha TASKA di Bangi.' },
  { key: 'farah', name: 'Farah Nadia Othman', email: 'farah@hawary.example', no: 'HA-TR-002', gender: 'female', phone: '+60137712290', spec: 'Kurikulum & Pedagogi Awal', bio: 'Pakar kurikulum PERMATA dan pembelajaran melalui bermain.' },
  { key: 'amirul', name: 'Amirul Hafiz Rahman', email: 'amirul@hawary.example', no: 'HA-TR-003', gender: 'male', phone: '+60196640385', spec: 'Keselamatan & Kesihatan', bio: 'Jurulatih pertolongan cemas kanak-kanak bertauliah.' },
  { key: 'izzah', name: 'Nurul Izzah Kamal', email: 'izzah@hawary.example', no: 'HA-TR-004', gender: 'female', phone: '+60148826017', spec: 'Pemakanan & Penjagaan', bio: 'Pegawai pemakanan; menyelia praktikal di TASKA.' },
] as const

export type TrainerKey = (typeof TRAINERS)[number]['key']

/** Which student numbers sit in which course. HA-2026-0318…0333 are the cast's sixteen. */
export function courseOfStudent(n: number): CourseKey | null {
  if (n >= 1 && n <= 284) return 'siri1'
  if (n >= 318 && n <= 333) return 'siri3'
  if (n >= 285 && n <= 634) return 'siri2'
  if (n >= 635 && n <= 796) return 'siri3'
  return null
}

/** Student number -> the number in their invoice_no. The hero (318) holds INV-2026-0412. */
export function invoiceSeqOfStudent(n: number): number {
  if (n >= 318 && n <= 333) return n + 94
  if (n >= 334 && n <= 427) return n - 16
  return n
}

/** Last student with an enrolment; 797–800 have no course, 801–805 have a pending request. */
export const LAST_ENROLLED = 796
export const STUDENT_COUNT = 805

const COURSES: { key: CourseKey; title: string; code: string; created: string; dueFee: string }[] = [
  { key: 'siri1', title: cast.courses[2].title, code: 'DKM-PRA-S1/26', created: '2026-04-01 10:00', dueFee: '2026-08-31' },
  { key: 'siri2', title: cast.courses[1].title, code: 'DKM-PRA-S2/26', created: '2026-06-02 10:00', dueFee: '2026-09-30' },
  { key: 'siri3', title: cast.courses[0].title, code: 'DKM-PRA-S3/26', created: '2026-08-10 10:00', dueFee: '2026-10-31' },
]

// ---------------------------------------------------------------------------
// Small generators
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000

/** The i-th of `count` moments spread evenly over [from, to], inside working hours. Monotonic in i. */
function spread(i: number, count: number, from: string, to: string, open = 8, close = 22): string {
  const days = Math.round((Date.parse(at(to)) - Date.parse(at(from))) / DAY_MS) + 1
  const perDay = (close - open) * 60
  const p = ((i + 0.5) / count) * days * perDay
  const d = Math.min(days - 1, Math.floor(p / perDay))
  const minute = Math.floor(p % perDay)
  const hh = String(open + Math.floor(minute / 60)).padStart(2, '0')
  const mm = String(minute % 60).padStart(2, '0')
  return at(`${ymd(d, from)} ${hh}:${mm}`)
}

const isMale = (name: string) => /^(Muhammad|Mohd|Ahmad|Amirul|Hakim)\b/.test(name)

export default function base(db: FakeDb): void {
  const directorId = ID.user.director
  const adminId = ID.user.admin

  // -------------------------------------------------------------------------
  // The academy
  // -------------------------------------------------------------------------
  db.add('academies', {
    id: ACADEMY_ID,
    name: cast.academy.name,
    slug: cast.academy.slug,
    email: 'akademi@hawary.example',
    phone: '+60389001200',
    address: 'No. 12-2, Jalan Ilmu 3, Taman Ilmu',
    city: 'Bandar Baru Bangi',
    state: 'Selangor',
    postcode: '43650',
    registration_no: '202601000123 (1600123-X)',
    created_at: at('2026-01-05 09:00'),
    created_by: directorId,
  })

  // -------------------------------------------------------------------------
  // Staff: accounts, memberships, instructor records
  // -------------------------------------------------------------------------
  const director = cast.people.director
  const staffAccounts: { id: string; name: string; email: string; role: 'admin' | 'trainer'; director?: boolean; joined: string }[] = [
    { id: directorId, name: director.name, email: director.email, role: 'admin', director: true, joined: '2026-01-05 09:00' },
    { id: adminId, name: 'Nadia Syazana Rahman', email: 'nadia@hawary.example', role: 'admin', joined: '2026-01-12 09:30' },
    ...TRAINERS.map((t, i) => ({ id: ID.user[t.key], name: t.name, email: t.email, role: 'trainer' as const, joined: `2026-01-${19 + i} 10:00` })),
  ]
  for (const a of staffAccounts) {
    db.add('profiles', { id: a.id, full_name: a.name, phone: null, created_at: at(a.joined) })
    db.add('academy_members', {
      id: uid('member', a.id),
      user_id: a.id,
      role: a.role,
      is_director: !!a.director,
      status: 'active',
      joined_at: at(a.joined),
      created_at: at(a.joined),
    })
  }

  TRAINERS.forEach((t, i) => {
    const { ic, dob } = icFor('trainer' + t.key, t.gender === 'female')
    db.add('instructors', {
      id: ID.instructor[t.key],
      user_id: ID.user[t.key],
      full_name: t.name,
      email: t.email,
      phone: t.phone,
      instructor_no: t.no,
      gender: t.gender,
      specialization: t.spec,
      bio: t.bio,
      ic_number: ic.replace(/^\d\d/, String(84 + i * 2)),
      date_of_birth: dob.replace(/^\d{4}/, String(1984 + i * 2)),
      status: 'active',
      is_bookable: true,
      is_report_checker: true,
      created_at: at(`2026-01-${19 + i} 10:00`),
      created_by: directorId,
    })
  })

  // Who can be signed in. `?as=<key>` on the web.
  db.persona({ key: 'director', userId: directorId, email: director.email, fullName: director.name, label: 'Hakim Zulkifli — admin + Director, sees everything' })
  db.persona({ key: 'admin', userId: adminId, email: 'nadia@hawary.example', fullName: 'Nadia Syazana Rahman', label: 'Nadia Syazana Rahman — admin, not a Director (no Settings)' })
  db.persona({ key: 'trainer', userId: ID.user.hajar, email: 'hajar@hawary.example', fullName: 'Siti Hajar Ismail', label: 'Siti Hajar Ismail — trainer (the hero trainer)' })
  for (const t of TRAINERS) {
    db.persona({ key: t.key, userId: ID.user[t.key], email: t.email, fullName: t.name, label: `${t.name} — trainer` })
  }
  db.persona({ key: 'student', userId: ID.user.aisyah, email: cast.people.heroStudent.email, fullName: cast.people.heroStudent.name, label: 'Nur Aisyah Razak — student, HA-2026-0318, DKM Prasekolah Siri 3/2026' })
  db.persona({ key: 'newcomer', userId: uid('user', 'newcomer'), email: 'sofea.hanim@mail.example', fullName: 'Sofea Hanim Idris', label: 'signed in, no membership anywhere — lands on /onboarding' })
  db.persona({ key: 'anon', userId: null, label: 'signed out — the public pages (/signin, /enroll/hawary-academy, /pay/:token)' })
  db.add('profiles', { id: uid('user', 'newcomer'), full_name: 'Sofea Hanim Idris', created_at: day(0, '09:30') })

  // -------------------------------------------------------------------------
  // Courses -> modules -> content. An intake is a duplicate of the last one,
  // so all three carry the cast's two weeks.
  // -------------------------------------------------------------------------
  const courseTitle: Record<CourseKey, string> = { siri1: '', siri2: '', siri3: '' }
  for (const c of COURSES) {
    courseTitle[c.key] = c.title
    db.add('courses', {
      id: ID.course[c.key],
      title: c.title,
      code: c.code,
      description:
        'Diploma Kemahiran Malaysia (DKM) dalam bidang Pengasuhan dan Pendidikan Awal Kanak-Kanak, di bawah Jabatan Pembangunan Kemahiran (JPK).',
      price_sen: COURSE_FEE_SEN,
      status: 'published',
      created_at: at(c.created),
      created_by: directorId,
    })
  }

  const author: Record<CourseKey, string> = { siri1: ID.user.amirul, siri2: ID.user.farah, siri3: ID.user.hajar }
  /** When each intake's Week 1 opened; assignment deadlines follow from it. */
  const weekOne: Record<CourseKey, string> = { siri1: '2026-05-11', siri2: '2026-07-13', siri3: '2026-10-05' }

  for (const c of COURSES) {
    const courseId = ID.course[c.key]
    cast.modules.forEach((m, mi) => {
      const wk = mi === 0 ? 'week1' : 'week2'
      const ids = ID.content[c.key][wk]
      const made = plusDays(at(c.created), 1 + mi)
      db.add('course_modules', {
        id: ids.module,
        course_id: courseId,
        title: m.title,
        description: MODULE_BLURB[m.title] ?? null,
        sort_order: mi,
        is_published: true,
        created_at: made,
        created_by: author[c.key],
      })
      const common = { course_id: courseId, module_id: ids.module, created_by: author[c.key] }
      let noteIx = 0
      for (const item of m.content) {
        // Only the hero intake has anything still in draft (the cast's Tugasan 2).
        const published = c.key === 'siri3' ? item.published : true
        if (item.type === 'note') {
          db.add('notes', {
            ...common,
            id: ids.notes[noteIx],
            title: item.title,
            content: NOTE_HTML[item.title] ?? '',
            body: [],
            sort_order: noteIx,
            is_published: published,
            created_at: plusMinutes(made, 20 + noteIx * 35),
          })
          noteIx++
        } else if (item.type === 'assessment') {
          const closes = plusDays(at(`${weekOne[c.key]} 23:59`), mi * 7 + 11)
          db.add('assessments', {
            ...common,
            id: ids.assessment,
            title: item.title,
            type: 'quiz',
            total_points: 'points' in item ? (item.points ?? 20) : 20,
            duration_minutes: 20,
            max_attempts: 2,
            available_from: at(plusDays(at(weekOne[c.key]), mi * 7)),
            available_until: closes,
            instructions: [{ id: uid('block', ids.assessment), type: 'text', text: 'Jawab semua soalan. Anda mempunyai 20 minit dan dua percubaan; markah tertinggi diambil kira.' }],
            sort_order: 0,
            is_published: published,
            created_at: plusMinutes(made, 120),
          })
          const questions = QUIZ[item.title] ?? []
          questions.forEach((q, qi) => {
            const qid = uid('question', `${c.key}/${wk}/${qi}`)
            const choiceIds = q.type === 'single_choice' ? q.choices.map((_t, k) => uid('choice', `${c.key}/${wk}/${qi}/${k}`)) : []
            db.add('assessment_questions', {
              id: qid,
              assessment_id: ids.assessment,
              prompt: q.prompt,
              question_type: q.type,
              points: 2,
              sort_order: qi,
              options: q.type === 'single_choice' ? { choices: q.choices.map((text, k) => ({ id: choiceIds[k], text })) } : null,
              correct_answer: q.type === 'single_choice' ? [choiceIds[q.answer]] : q.answer,
              created_at: plusMinutes(made, 121 + qi),
            })
          })
        } else if (item.type === 'assignment') {
          const due = c.key === 'siri3' && 'due' in item && item.due ? at(`${item.due} 23:59`) : plusDays(at(`${weekOne[c.key]} 23:59`), mi * 7 + 9)
          db.add('assignments', {
            ...common,
            id: ids.assignment,
            title: item.title,
            total_points: 100,
            due_at: due,
            allow_late: mi === 0,
            instructions: (ASSIGNMENT_BRIEF[item.title] ?? []).map((text, k) => ({ id: uid('block', `${ids.assignment}/${k}`), type: 'text', text })),
            sort_order: 0,
            is_published: published,
            created_at: plusMinutes(made, 180),
          })
        }
      }
      db.add('course_materials', {
        ...common,
        id: ids.material,
        title: `Slaid Kuliah ${m.title}`,
        file_name: `Slaid_Kuliah_${m.title.replace(/\s+/g, '_')}.pdf`,
        file_path: `${ACADEMY_ID}/${courseId}/slaid-${wk}.pdf`,
        mime_type: 'application/pdf',
        size_bytes: mi === 0 ? 3_565_158 : 2_936_013,
        sort_order: 0,
        is_published: true,
        created_at: plusMinutes(made, 90),
      })
    })
  }

  // Two trainers teach each intake; Siti Hajar leads the hero one.
  const teaching: [CourseKey, TrainerKey][] = [
    ['siri3', 'hajar'], ['siri3', 'farah'],
    ['siri2', 'farah'], ['siri2', 'izzah'], ['siri2', 'hajar'],
    ['siri1', 'amirul'], ['siri1', 'izzah'],
  ]
  for (const [c, t] of teaching) {
    db.add('course_instructors', { id: uid('course-instructor', `${c}/${t}`), course_id: ID.course[c], instructor_id: ID.instructor[t] })
  }

  // -------------------------------------------------------------------------
  // Students. The cast's sixteen keep their numbers; the rest are invented in
  // the same style.
  // -------------------------------------------------------------------------
  const castNames = new Map<number, string>()
  for (const s of cast.people.students) castNames.set(Number(s.student_no.slice(-4)), s.name)
  const reserved = [...castNames.values(), ...staffAccounts.map((a) => a.name), 'Sofea Hanim Idris']
  const invented = inventNames(STUDENT_COUNT - castNames.size, 'hawary-academy-students', reserved)
  const organizations = ['TASKA Permata Kasih', 'TASKA Ceria Bestari', 'TADIKA Sinar Ilmu', 'TASKA Nur Iman', 'TASKA Bintang Kecil', 'TADIKA Seri Murni']

  const usedEmails = new Set<string>()
  const studentName: string[] = []
  const studentCreated: string[] = []
  let inv = 0
  for (let n = 1; n <= STUDENT_COUNT; n++) {
    const name = castNames.get(n) ?? invented[inv++]
    studentName[n] = name
    let created: string
    if (n <= 284) created = spread(n - 1, 284, '2026-04-06', '2026-05-29')
    else if (n <= 634) created = spread(n - 285, 350, '2026-06-08', '2026-08-07')
    else if (n <= 796) created = spread(n - 635, 162, '2026-08-17', '2026-10-02')
    // Numbers are handed out in the order people arrive, so these stay monotonic.
    else if (n <= 800) created = [day(-4, '10:20'), day(-3, '16:05'), day(-2, '09:40'), day(-2, '15:25')][n - 797]
    else created = [day(-2, '20:14'), day(-1, '08:52'), day(-1, '13:37'), day(-1, '21:05'), day(0, '10:18')][n - 801]
    studentCreated[n] = created

    const r = rng('student' + n)
    const isCast = castNames.has(n)
    const male = isMale(name)
    const { ic, dob } = icFor(n, !male)
    let email = n === 318 ? cast.people.heroStudent.email : emailFor(name)
    if (usedEmails.has(email)) email = emailFor(name, n)
    usedEmails.add(email)
    // 797–800 were added by staff and have not claimed their account yet;
    // 801–805 signed up themselves through the public join link.
    // 770 is enrolled but never claimed hers: the invitation about to lapse.
    const claimed = (n >= 797 && n <= 800) || n === 770 ? false : isCast || n > 800 || r.chance(0.88)
    db.add('students', {
      id: studentId(n),
      student_no: studentNo(n),
      full_name: name,
      email,
      phone: phoneFor(n),
      ic_number: ic,
      date_of_birth: dob,
      gender: male ? 'male' : 'female',
      organization: isCast || r.chance(0.35) ? r.pick(organizations) : null,
      address: isCast ? `No. ${r.int(3, 88)}, Jalan ${r.pick(['Kenanga', 'Melur', 'Cempaka', 'Dahlia', 'Seroja'])} ${r.int(1, 9)}, ${r.pick(['Bandar Baru Bangi', 'Kajang', 'Semenyih', 'Putrajaya', 'Seri Kembangan'])}, Selangor` : null,
      status: n === 798 || n === 800 ? 'trial' : 'active',
      user_id: claimed ? studentUserId(n) : null,
      created_at: created,
      created_by: n > 800 ? null : r.chance(0.5) ? adminId : directorId,
    })

    const course = courseOfStudent(n)
    if (course) {
      db.add('enrollments', {
        id: enrollmentId(n),
        student_id: studentId(n),
        course_id: ID.course[course],
        status: 'active',
        enrolled_at: plusMinutes(created, 25),
        approved_at: plusMinutes(created, 25),
        access_email_at: plusMinutes(created, 26),
        created_at: plusMinutes(created, 25),
      })
    } else if (n > 800) {
      // A request waiting for staff: the "Enrolments" badge in the sidebar.
      db.add('enrollments', {
        id: enrollmentId(n),
        student_id: studentId(n),
        course_id: ID.course.siri3,
        status: 'pending',
        enrolled_at: plusMinutes(created, 4),
        created_at: plusMinutes(created, 4),
      })
    }

    // Accounts that exist as rows: the cast's sixteen and the five who joined by link.
    if (isCast || n > 800) {
      db.add('profiles', { id: studentUserId(n), full_name: name, phone: phoneFor(n), created_at: created })
      db.add('academy_members', {
        id: uid('member', studentUserId(n)),
        user_id: studentUserId(n),
        role: 'student',
        status: 'active',
        student_no: studentNo(n),
        joined_at: created,
        created_at: created,
      })
    }
  }

  // The public join link and each course's door.
  db.add('academy_enrollment_settings', {
    is_open: true,
    intro: 'Selamat datang ke Hawary Academy. Pilih ambilan anda dan kami akan menghubungi anda dalam masa satu hari bekerja.',
    created_at: at('2026-01-06 09:00'),
  })
  db.add('course_enrollment_settings', [
    { course_id: ID.course.siri3, is_open: true, capacity: 200, closes_at: at('2026-10-16 23:59'), created_at: at('2026-08-10 10:30') },
    { course_id: ID.course.siri2, is_open: false, capacity: 350, closes_at: at('2026-07-24 23:59'), created_at: at('2026-06-02 10:30') },
    { course_id: ID.course.siri1, is_open: false, capacity: 300, closes_at: at('2026-05-22 23:59'), created_at: at('2026-04-01 10:30') },
  ])

  // -------------------------------------------------------------------------
  // The invoice book and the ledger.
  //
  // One invoice per enrolled student, RM 1,800.00 each: 796 x 180000 sen is
  // cast.money.tiles.invoiced_sen exactly. 630 are paid, 60 part-paid, 106
  // unpaid, which lands on collected / outstanding to the sen.
  // -------------------------------------------------------------------------
  const members: Record<CourseKey, number[]> = { siri1: [], siri2: [], siri3: [] }
  for (let n = 1; n <= LAST_ENROLLED; n++) members[courseOfStudent(n)!].push(n)

  const plan: Record<CourseKey, { unpaid: number; partial: number; overdueUnpaid: number; overduePartial: number }> = {
    siri1: { unpaid: 3, partial: 6, overdueUnpaid: 3, overduePartial: 6 },
    siri2: { unpaid: 36, partial: 30, overdueUnpaid: 3, overduePartial: 4 },
    siri3: { unpaid: 67, partial: 24, overdueUnpaid: 0, overduePartial: 0 },
  }
  const HERO = ID.hero.studentNo
  const state = new Map<number, { kind: 'paid' | 'partial' | 'unpaid'; overdue: boolean }>()
  const partialOrder: number[] = []
  for (const key of ['siri1', 'siri2', 'siri3'] as CourseKey[]) {
    const p = plan[key]
    const pool = rng('ledger-' + key).shuffle(members[key].filter((n) => n !== HERO))
    const partialCount = key === 'siri3' ? p.partial - 1 : p.partial
    pool.slice(0, p.unpaid).forEach((n, i) => state.set(n, { kind: 'unpaid', overdue: i < p.overdueUnpaid }))
    pool.slice(p.unpaid, p.unpaid + partialCount).forEach((n, i) => {
      state.set(n, { kind: 'partial', overdue: i < p.overduePartial })
      partialOrder.push(n)
    })
  }
  state.set(HERO, { kind: 'partial', overdue: false })

  // What the 59 other part-payers have paid so far. With the hero's RM 900 it
  // comes to RM 50,500.00 — the figure that makes the tiles balance.
  const partialAmounts = rng('partial-amounts').shuffle([
    ...Array(14).fill(rm(500)),
    ...Array(30).fill(rm(900)),
    ...Array(12).fill(rm(1000)),
    ...Array(3).fill(rm(1200)),
  ] as number[])
  const paidSoFar = new Map<number, number>()
  partialOrder.forEach((n, i) => paidSoFar.set(n, partialAmounts[i]))
  paidSoFar.set(HERO, cast.money.heroInvoice.paid_sen)

  const issuedAt = (seq: number): string => {
    if (seq <= 284) return spread(seq - 1, 284, '2026-05-04', '2026-06-12', 9, 18)
    if (seq <= 634) return spread(seq - 285, 350, '2026-07-01', '2026-08-14', 9, 18)
    return spread(seq - 635, 162, '2026-09-07', '2026-10-02', 9, 18)
  }

  const cutoff = Date.parse(at(`${TODAY} 11:30`))
  const within = (r: ReturnType<typeof rng>, fromMs: number, toMs: number): number => {
    const lo = Math.min(fromMs, toMs)
    const hi = Math.max(fromMs, toMs)
    const dayIx = Math.floor((lo + r() * (hi - lo) + 8 * 3_600_000) / DAY_MS)
    // a waking hour on that Malaysian day
    const ms = dayIx * DAY_MS - 8 * 3_600_000 + (8 * 60 + r.int(0, 14 * 60)) * 60_000
    return Math.max(lo, Math.min(hi, ms))
  }

  type Pay = { invoiceSeq: number; student: number; amount: number; at: number; method: string; note: string | null }
  const pays: Pay[] = []
  const banks = ['Maybank2u', 'CIMB Clicks', 'Bank Islam', 'RHB Now', 'Public Bank', 'Bank Rakyat', 'AmOnline', 'Hong Leong Connect', 'BSN']

  for (let n = 1; n <= LAST_ENROLLED; n++) {
    const course = courseOfStudent(n)!
    const seq = invoiceSeqOfStudent(n)
    const st = state.get(n) ?? { kind: 'paid' as const, overdue: false }
    const issuedBase = Date.parse(issuedAt(seq))
    const issued = new Date(Math.max(issuedBase, Date.parse(studentCreated[n]) + 30 * 60_000)).toISOString()
    const paid = st.kind === 'paid' ? COURSE_FEE_SEN : st.kind === 'partial' ? paidSoFar.get(n)! : 0
    const c = COURSES.find((x) => x.key === course)!
    // Siri 2's open invoices are on an instalment plan to the end of October,
    // except the handful that slipped past their date.
    const due = course === 'siri2' && st.kind !== 'paid' && !st.overdue ? '2026-10-31' : c.dueFee
    const isHero = n === HERO
    db.add('invoices', {
      id: invoiceId(seq),
      invoice_no: isHero ? cast.money.heroInvoice.number : invoiceNo(seq),
      student_id: studentId(n),
      course_id: ID.course[course],
      enrollment_id: enrollmentId(n),
      status: st.kind === 'paid' ? 'paid' : st.kind === 'partial' ? 'partially_paid' : 'issued',
      subtotal_sen: COURSE_FEE_SEN,
      tax_sen: 0,
      total_sen: COURSE_FEE_SEN,
      amount_paid_sen: paid,
      balance_sen: COURSE_FEE_SEN - paid,
      issued_at: issued,
      due_at: at(due),
      pay_token: isHero ? 'hawary-demo-pay-0412' : null,
      pay_token_created_at: isHero ? issued : null,
      created_at: issued,
      created_by: seq % 3 === 0 ? directorId : adminId,
    })
    db.add('invoice_items', {
      id: uid('invoice-item', seq),
      invoice_id: invoiceId(seq),
      description: isHero ? cast.money.heroInvoice.description : `Yuran ${courseTitle[course]}`,
      quantity: 1,
      unit_price_sen: COURSE_FEE_SEN,
      amount_sen: COURSE_FEE_SEN,
      created_at: issued,
    })
    if (paid === 0) continue

    if (isHero) {
      const p = cast.money.heroInvoice.payments[0]
      pays.push({ invoiceSeq: seq, student: n, amount: p.amount_sen, at: Date.parse(p.at), method: 'fpx', note: p.bank })
      continue
    }

    const r = rng('pay' + n)
    const issuedMs = Date.parse(issued)
    let first: number
    if (course === 'siri3' && seq >= 635) {
      // The intake opened on 5 October: most fees arrive in its first week.
      first = r.chance(0.66)
        ? within(r, Math.max(issuedMs, Date.parse(at('2026-10-01 08:00'))), cutoff)
        : within(r, issuedMs, Date.parse(at('2026-09-30 22:00')))
    } else if (course === 'siri3') {
      first = within(r, issuedMs + 20 * DAY_MS, issuedMs + 70 * DAY_MS)
    } else {
      const roll = r()
      const lag = roll < 0.45 ? r.int(0, 3) : roll < 0.75 ? r.int(4, 14) : roll < 0.93 ? r.int(15, 35) : r.int(36, 55)
      first = within(r, issuedMs + lag * DAY_MS, issuedMs + (lag + 1) * DAY_MS)
    }
    first = Math.min(Math.max(first, issuedMs + 10 * 60_000), cutoff)

    const mroll = r()
    const method = mroll < 0.78 ? 'fpx' : mroll < 0.9 ? 'bank_transfer' : mroll < 0.95 ? 'cash' : mroll < 0.985 ? 'kwsp' : 'ewallet'
    const bank = r.pick(banks)
    const noteFor = (m: string) => (m === 'fpx' ? bank : m === 'bank_transfer' ? `Pindahan ${bank}` : m === 'kwsp' ? 'Pengeluaran KWSP (Pendidikan)' : null)

    const roomForTwo = first + 21 * DAY_MS < cutoff - DAY_MS
    const roomForThree = first + 56 * DAY_MS < cutoff - DAY_MS
    const split = r()
    if (st.kind === 'paid' && roomForThree && split < 0.06) {
      const part = COURSE_FEE_SEN / 3
      pays.push({ invoiceSeq: seq, student: n, amount: part, at: first, method, note: noteFor(method) })
      pays.push({ invoiceSeq: seq, student: n, amount: part, at: within(r, first + 26 * DAY_MS, first + 30 * DAY_MS), method, note: noteFor(method) })
      pays.push({ invoiceSeq: seq, student: n, amount: part, at: within(r, first + 54 * DAY_MS, first + 56 * DAY_MS), method, note: noteFor(method) })
    } else if (st.kind === 'paid' && roomForTwo && split < 0.3) {
      const half = COURSE_FEE_SEN / 2
      pays.push({ invoiceSeq: seq, student: n, amount: half, at: first, method, note: noteFor(method) })
      pays.push({ invoiceSeq: seq, student: n, amount: half, at: Math.min(within(r, first + 21 * DAY_MS, first + 35 * DAY_MS), cutoff - 3_600_000), method, note: noteFor(method) })
    } else {
      pays.push({ invoiceSeq: seq, student: n, amount: paid, at: first, method, note: noteFor(method) })
    }
  }

  pays.sort((a, b) => a.at - b.at || a.invoiceSeq - b.invoiceSeq)
  pays.forEach((p, i) => {
    const when = new Date(p.at).toISOString()
    const gateway = p.method === 'fpx' || p.method === 'ewallet'
    const d = new Date(p.at + 8 * 3_600_000)
    const stamp = `${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`
    db.add('payments', {
      id: uid('payment', i + 1),
      invoice_id: invoiceId(p.invoiceSeq),
      student_id: studentId(p.student),
      amount_sen: p.amount,
      method: p.method as Row['method'],
      provider: gateway ? 'toyyibpay' : 'manual',
      provider_ref: gateway ? `TP${stamp}${String(100000 + ((i * 7919) % 899999))}` : null,
      status: 'succeeded',
      paid_at: when,
      note: p.note,
      created_at: when,
      created_by: gateway ? null : i % 2 === 0 ? adminId : directorId,
    })
  })

  // The books must close. If an edit above breaks them, say so where an agent will see it.
  {
    const invoices = db.rows('invoices')
    const invoiced = invoices.reduce((s, r) => s + r.total_sen, 0)
    const collected = db.rows('payments').reduce((s, r) => s + r.amount_sen, 0)
    const paidCol = invoices.reduce((s, r) => s + r.amount_paid_sen, 0)
    const t = cast.money.tiles
    if (invoiced !== t.invoiced_sen || collected !== t.collected_sen || paidCol !== t.collected_sen || invoiced - collected !== t.outstanding_sen) {
      console.error(`[fake] base: the ledger does not match cast.money.tiles — invoiced ${invoiced}, payments ${collected}, amount_paid ${paidCol}`)
    }
  }

  db.add('academy_payment_settings', {
    provider: 'toyyibpay',
    allow_partial_payment: true,
    min_partial_sen: rm(100),
    toyyibpay_enabled: true,
    toyyibpay_has_secret: true,
    toyyibpay_secret_last4: '7c2e',
    toyyibpay_secret_set_at: at('2026-01-08 11:20'),
    toyyibpay_secret_set_by: directorId,
    toyyibpay_category_code: 'hw9x2k1a',
    toyyibpay_charge_to_payor: false,
    toyyibpay_is_sandbox: false,
    billplz_enabled: true,
    billplz_has_secret: true,
    billplz_secret_last4: 'a91f',
    billplz_secret_set_at: at('2026-02-02 15:05'),
    billplz_secret_set_by: directorId,
    billplz_is_sandbox: false,
    created_at: at('2026-01-08 11:20'),
  })

  // -------------------------------------------------------------------------
  // Invitations still open (the dashboard's "Invites" tile)
  // -------------------------------------------------------------------------
  const invites: { n: number; sent: string; expires: string }[] = [
    { n: 770, sent: at('2026-09-26 16:40'), expires: at('2026-10-10 16:40') },
    { n: 798, sent: day(-3, '16:10'), expires: day(11, '16:10') },
    { n: 800, sent: day(-2, '15:30'), expires: day(12, '15:30') },
  ]
  for (const i of invites) {
    const s = db.get('students', studentId(i.n))
    db.add('academy_invitations', {
      id: uid('invitation', i.n),
      email: s.email ?? '',
      role: 'student',
      status: 'pending',
      student_id: s.id,
      token: `demo-invite-${i.n}`,
      invited_by: adminId,
      expires_at: i.expires,
      created_at: i.sent,
    })
  }

  // -------------------------------------------------------------------------
  // Appointments: the diary around the cast's today (Wed 7 Oct), dense in the
  // week of 12 Oct. Sessions are an hour.
  // -------------------------------------------------------------------------
  db.add('academy_booking_settings', {
    is_open: true,
    slot_minutes: 60,
    horizon_days: 21,
    min_notice_hours: 12,
    assignment_mode: 'student_choice',
    max_open_per_student: 2,
    max_per_week_per_student: 1,
    created_at: at('2026-08-12 10:00'),
  })
  for (let weekday = 1; weekday <= 5; weekday++) {
    db.add('booking_hours', [
      { id: uid('booking-hours', `${weekday}/am`), weekday, start_time: '09:00:00', end_time: '12:00:00', created_at: at('2026-08-12 10:05') },
      { id: uid('booking-hours', `${weekday}/pm`), weekday, start_time: '14:00:00', end_time: '17:00:00', created_at: at('2026-08-12 10:05') },
    ])
  }

  type Appt = [offset: number, time: string, trainer: TrainerKey, student: number, status: 'booked' | 'completed' | 'cancelled' | 'no_show', note?: string]
  const hb = cast.appointments.heroBooking
  const diary: Appt[] = [
    [-8, '10:00', 'hajar', 318, 'completed', 'Semakan draf LPKC'],
    [-7, '14:00', 'farah', 319, 'completed', 'Soalan tentang portfolio'],
    [-6, '09:00', 'amirul', 322, 'completed', 'Bimbingan slaid pembentangan'],
    [-6, '11:00', 'izzah', 324, 'completed'],
    [-5, '10:00', 'hajar', 326, 'completed', 'Rancangan aktiviti harian'],
    [-5, '15:00', 'farah', 320, 'no_show'],
    [-2, '09:00', 'hajar', 321, 'completed', 'Format rujukan APA'],
    [-2, '14:00', 'amirul', 323, 'completed'],
    [-1, '10:00', 'izzah', 329, 'cancelled', 'Konsultasi praktikal di TASKA'],
    [-1, '11:00', 'farah', 330, 'completed'],
    [-1, '15:00', 'hajar', 327, 'completed', 'Semakan draf LPKC'],
    [0, '09:00', 'hajar', 328, 'completed', 'Soalan tentang Tugasan 1'],
    [0, '10:00', 'farah', 331, 'completed'],
    [0, '14:00', 'hajar', 321, 'booked', 'Semakan pembetulan LPKC'],
    [0, '15:00', 'farah', 640, 'booked', 'Soalan tentang Tugasan 1'],
    [0, '16:00', 'amirul', 323, 'booked', 'Bimbingan portfolio'],
    [1, '09:00', 'izzah', 652, 'booked'],
    [1, '10:00', 'hajar', 319, 'booked', 'Bincang maklum balas LPKC'],
    [1, '14:00', 'farah', 320, 'booked', 'Semakan LPKC versi 3'],
    [2, '10:00', 'amirul', 667, 'booked', 'Persediaan praktikal'],
    [2, '11:00', 'izzah', 324, 'booked'],
    [5, '09:00', 'hajar', 326, 'booked', 'Semakan LPKC versi 2'],
    [5, '11:00', 'farah', 701, 'booked', 'Rancangan aktiviti harian'],
    [5, '14:00', 'izzah', 329, 'booked', 'Konsultasi praktikal di TASKA'],
    [6, '10:00', 'hajar', 318, 'booked', hb.note],
    [6, '11:00', 'amirul', 322, 'booked', 'Latihan pembentangan'],
    [6, '15:00', 'farah', 330, 'booked'],
    [7, '09:00', 'izzah', 715, 'booked', 'Soalan tentang Kuiz 2'],
    [7, '10:00', 'hajar', 327, 'booked', 'Bimbingan portfolio'],
    [7, '14:00', 'amirul', 331, 'booked'],
    [8, '10:00', 'farah', 328, 'booked', 'Pemerhatian kanak-kanak'],
    [8, '11:00', 'hajar', 688, 'booked', 'Soalan tentang Tugasan 1'],
    [8, '15:00', 'izzah', 332, 'booked'],
    [9, '09:00', 'amirul', 325, 'booked', 'Semakan draf LPKC'],
    [9, '10:00', 'hajar', 333, 'booked', 'Persediaan pembentangan'],
  ]
  diary.forEach(([offset, time, trainer, student, status, note], i) => {
    const starts = offset === 6 && student === 318 ? at(hb.at) : day(offset, time)
    const booked = plusMinutes(plusDays(starts, -r3(i)), -137 - i * 11)
    db.add('appointments', {
      id: uid('appointment', `${offset}/${time}/${trainer}`),
      instructor_id: ID.instructor[trainer],
      student_id: studentId(student),
      starts_at: starts,
      ends_at: plusMinutes(starts, 60),
      status,
      note: note ?? null,
      auto_assigned: i % 5 === 3,
      cancel_reason: status === 'cancelled' ? 'Pelajar memohon tarikh lain' : null,
      cancelled_at: status === 'cancelled' ? plusMinutes(starts, -19 * 60) : null,
      cancelled_by: status === 'cancelled' ? studentUserId(student) : null,
      created_at: booked,
      created_by: studentUserId(student),
    })
  })

  // -------------------------------------------------------------------------
  // LPKC reports: the eight threads of cast.lpkc.queue, each with its whole
  // timeline (uploads, the AI's checks, the trainer's verdict), plus get_report
  // / my_reports and the write RPCs. The film's clock decides how far each
  // thread has got — see base.reports.ts.
  // -------------------------------------------------------------------------
  seedReports(db, TRAINERS)

  // -------------------------------------------------------------------------
  // The bell. A row is an event; the app writes the sentence.
  // -------------------------------------------------------------------------
  const siri3 = courseTitle.siri3
  const report = (id: string, role: 'student' | 'instructor', withName: string, status: string) => ({
    report_id: id, role, with_name: withName, course: siri3, title: cast.lpkc.title, status,
  })
  const tz = 'Asia/Kuala_Lumpur'
  const heroAppt = { appointment_id: uid('appointment', '6/10:00/hajar'), starts_at: at(hb.at), ends_at: plusMinutes(at(hb.at), 60), tz }
  const tugasan1 = db.get('assignments', ID.content.siri3.week1.assignment)
  const kuiz1 = db.get('assessments', ID.content.siri3.week1.assessment)

  // Rows dated after the film's clock are dropped at load (base.reports.ts), so
  // the bell tells the same story as the thread: at 11:55 the approval has not
  // happened yet; at ?now=…T12:06 it has, and the student has been told.

  // Siti Hajar Ismail (trainer)
  db.add('notifications', [
    { id: uid('notif', 'hajar/1'), user_id: ID.user.hajar, kind: 'report_submitted', data: report(ID.hero.report, 'instructor', 'Nur Aisyah Razak', 'submitted'), created_at: HERO_MOMENTS.v2, read_at: null },
    { id: uid('notif', 'hajar/2'), user_id: ID.user.hajar, kind: 'report_submitted', data: report(ID.hero.report, 'instructor', 'Nur Aisyah Razak', 'submitted'), created_at: HERO_MOMENTS.v1, read_at: null },
    { id: uid('notif', 'hajar/3'), user_id: ID.user.hajar, kind: 'appointment_booked', data: { ...heroAppt, role: 'instructor', with_name: 'Nur Aisyah Razak' }, created_at: day(-1, '20:15'), read_at: null },
    { id: uid('notif', 'hajar/4'), user_id: ID.user.hajar, kind: 'report_submitted', data: report(reportId(326), 'instructor', 'Hannah Maisarah Jalil', 'submitted'), created_at: day(-1, '10:05'), read_at: day(-1, '10:40') },
    { id: uid('notif', 'hajar/5'), user_id: ID.user.hajar, kind: 'report_submitted', data: report(reportId(319), 'instructor', 'Aina Sofea Rosli', 'submitted'), created_at: day(-1, '14:30'), read_at: day(-1, '15:02') },
    { id: uid('notif', 'hajar/6'), user_id: ID.user.hajar, kind: 'appointment_booked', data: { appointment_id: uid('appointment', '1/10:00/hajar'), starts_at: day(1, '10:00'), ends_at: day(1, '11:00'), tz, role: 'instructor', with_name: 'Aina Sofea Rosli' }, created_at: day(-1, '15:20'), read_at: day(-1, '16:00') },
  ])

  // Nur Aisyah Razak (student)
  db.add('notifications', [
    { id: uid('notif', 'aisyah/0'), user_id: ID.user.aisyah, kind: 'report_status', data: report(ID.hero.report, 'student', hb.trainer, 'approved'), created_at: HERO_MOMENTS.approved, read_at: null },
    { id: uid('notif', 'aisyah/1'), user_id: ID.user.aisyah, kind: 'report_status', data: report(ID.hero.report, 'student', AI_NAME, 'in_review'), created_at: HERO_MOMENTS.aiPass, read_at: null },
    { id: uid('notif', 'aisyah/2'), user_id: ID.user.aisyah, kind: 'report_status', data: report(ID.hero.report, 'student', AI_NAME, 'changes_requested'), created_at: HERO_MOMENTS.aiFix, read_at: HERO_MOMENTS.after(HERO_MOMENTS.aiFix, 8) },
    { id: uid('notif', 'aisyah/3'), user_id: ID.user.aisyah, kind: 'work_due', data: { work: 'assignment', work_id: tugasan1.id, title: tugasan1.title, course: siri3, due_at: tugasan1.due_at }, created_at: day(0, '08:00'), read_at: null },
    { id: uid('notif', 'aisyah/4'), user_id: ID.user.aisyah, kind: 'appointment_booked', data: { ...heroAppt, role: 'student', with_name: hb.trainer }, created_at: day(-1, '20:15'), read_at: day(-1, '20:16') },
    { id: uid('notif', 'aisyah/5'), user_id: ID.user.aisyah, kind: 'work_marked', data: { work: 'assessment', work_id: kuiz1.id, title: kuiz1.title, course: siri3, score: 18, out_of: 20 }, created_at: day(-1, '16:32'), read_at: null },
    { id: uid('notif', 'aisyah/6'), user_id: ID.user.aisyah, kind: 'payment_received', data: { invoice_id: ID.hero.invoice, invoice_no: cast.money.heroInvoice.number, amount_sen: cast.money.heroInvoice.paid_sen }, created_at: at(cast.money.heroInvoice.payments[0].at), read_at: at('2026-09-18 10:30') },
  ])

  // -------------------------------------------------------------------------
  // Views
  // -------------------------------------------------------------------------
  db.view('course_enrollment_stats', () => {
    const counts = new Map<string, number>()
    for (const e of db.rows('enrollments')) {
      if (e.status !== 'active') continue
      const s = db.byId('students', e.student_id)
      if (!s || s.archived_at) continue
      counts.set(e.course_id, (counts.get(e.course_id) ?? 0) + 1)
    }
    return [...counts].map(([course_id, active_students]) => ({ academy_id: ACADEMY_ID, course_id, active_students }))
  })

  // -------------------------------------------------------------------------
  // Policies: the shape of the real RLS, enough for each persona to see what
  // they would see. Handlers (`db.from`, `db.rows`) are not subject to them.
  // -------------------------------------------------------------------------
  const enrolled = (ctx: Ctx, courseId: string) =>
    !!ctx.studentId &&
    db.lookup('enrollments', 'student_id', ctx.studentId).some((e) => e.course_id === courseId && (e.status === 'active' || e.status === 'completed'))
  const staff = (_r: Row, c: Ctx) => c.isStaff
  const admin = (_r: Row, c: Ctx) => c.isAdmin
  const ownStudent = (col = 'student_id') => (r: Row, c: Ctx) => c.isStaff || (!!c.studentId && r[col] === c.studentId)
  const adminOrOwn = (r: Row, c: Ctx) => c.isAdmin || (!!c.studentId && r.student_id === c.studentId)
  const liveContent = (r: Row, c: Ctx) => {
    if (c.isStaff) return true
    if (!r.is_published || !enrolled(c, r.course_id)) return false
    const m = db.byId('course_modules', r.module_id)
    return !!m && m.is_published === true
  }

  db.policy('academies', (_r, c) => !!c.member)
  db.policy('academy_members', (r, c) => c.isAdmin || r.user_id === c.userId)
  db.policy('profiles', (r, c) => c.isStaff || r.id === c.userId)
  db.policy('academy_invitations', staff)
  db.policy('academy_payment_settings', admin)
  db.policy('academy_booking_settings', staff)
  db.policy('academy_enrollment_settings', staff)
  db.policy('course_enrollment_settings', staff)
  db.policy('booking_hours', staff)
  db.policy('booking_time_off', staff)
  db.policy('students', (r, c) => c.isStaff || r.user_id === c.userId)
  db.policy('instructors', staff)
  db.policy('course_instructors', staff)
  db.policy('enrollments', ownStudent())
  db.policy('courses', (r, c) => c.isStaff || (r.status === 'published' && enrolled(c, r.id)))
  db.policy('course_modules', (r, c) => c.isStaff || (r.is_published === true && enrolled(c, r.course_id)))
  db.policy('notes', liveContent)
  db.policy('course_materials', liveContent)
  db.policy('assessments', liveContent)
  db.policy('assignments', liveContent)
  db.policy('assessment_questions', staff)
  db.policy('assessment_attempts', ownStudent())
  db.policy('assignment_submissions', ownStudent())
  db.policy('assignment_submission_files', (r, c) => c.isStaff || db.byId('assignment_submissions', r.submission_id)?.student_id === c.studentId)
  db.policy('invoices', adminOrOwn)
  db.policy('payments', adminOrOwn)
  db.policy('invoice_items', (r, c) => c.isAdmin || db.byId('invoices', r.invoice_id)?.student_id === c.studentId)
  db.policy('payment_intents', admin)
  db.policy('incentive_batches', admin)
  db.policy('incentive_payouts', adminOrOwn)
  db.policy('student_bank_accounts', adminOrOwn)
  // A trainer's diary and checking queue are her own; an admin sees the academy's.
  db.policy('appointments', (r, c) => c.isAdmin || (!!c.instructorId && r.instructor_id === c.instructorId) || (!!c.studentId && r.student_id === c.studentId))
  const reportVisible = (r: Row, c: Ctx) => c.isAdmin || (!!c.instructorId && r.instructor_id === c.instructorId) || (!!c.studentId && r.student_id === c.studentId)
  db.policy('report_submissions', reportVisible)
  db.policy('report_events', (r, c) => { const rep = db.byId('report_submissions', r.report_id); return !!rep && reportVisible(rep, c) })
  db.policy('report_files', (r, c) => { const rep = db.byId('report_submissions', r.report_id); return !!rep && reportVisible(rep, c) })
  db.policy('notifications', (r, c) => r.user_id === c.userId)
  db.policy('announcements', (r, c) => c.isStaff || r.course_id === null || enrolled(c, r.course_id))
  db.policy('login_events', () => false)
  db.policy('push_devices', () => false)

  // -------------------------------------------------------------------------
  // RPCs and Edge Functions the shell needs on every page
  // -------------------------------------------------------------------------
  db.rpc('report_counts', (_args, ctx) => {
    const tally = new Map<string, number>()
    for (const r of db.rows('report_submissions')) {
      if (!reportVisible(r, ctx)) continue
      tally.set(r.status, (tally.get(r.status) ?? 0) + 1)
    }
    return [...tally].map(([status, n]) => ({ status, n }))
  })
  db.rpc('can_view_analytics', (_args, ctx) => ctx.isDirector)
  db.rpc('my_pending_invitations', () => [])
  db.rpc('mark_notifications_read', (args, ctx) => {
    const ids = new Set<string>(args._ids ?? [])
    const mine = db.rows('notifications').filter((n) => n.user_id === ctx.userId && ids.has(n.id) && !n.read_at)
    if (db.applyWrites) {
      for (const n of mine) n.read_at = ctx.now.toISOString()
      db.touch()
    }
    return mine.length
  })
  db.rpc('mark_all_notifications_read', (_args, ctx) => {
    const mine = db.rows('notifications').filter((n) => n.user_id === ctx.userId && !n.read_at)
    if (db.applyWrites) {
      for (const n of mine) n.read_at = ctx.now.toISOString()
      db.touch()
    }
    return mine.length
  })

  // Mail and push never leave the building.
  for (const name of ['send-invitation', 'send-report-notice', 'send-appointment-notice', 'send-pay-link', 'send-course-access']) {
    db.fn(name, () => ({ ok: true, id: null }))
  }
  // Private files open as a blank tab rather than a broken one.
  for (const name of ['material-url', 'report-url', 'submission-url']) {
    db.fn(name, (body) => ({ url: `about:blank#${name}/${body?.material_id ?? body?.file_id ?? ''}` }))
  }
  db.fn('upload-media', (body) => {
    const file = typeof FormData !== 'undefined' && body instanceof FormData ? (body.get('file') as File | null) : null
    const bucket = typeof FormData !== 'undefined' && body instanceof FormData ? String(body.get('bucket') ?? 'media') : 'media'
    const name = file?.name ?? 'upload.bin'
    const url = file && typeof URL !== 'undefined' && URL.createObjectURL ? URL.createObjectURL(file) : ''
    return { ok: true, url, path: `${ACADEMY_ID}/${bucket}/${name}`, file_name: name, mime_type: file?.type ?? 'application/octet-stream', size_bytes: file?.size ?? 0 }
  })
}

/** 1, 2 or 3 — how many days ahead a session was booked. */
function r3(i: number): number {
  return 1 + ((i * 7) % 3)
}

// ---------------------------------------------------------------------------
// WHAT THE SIDEBAR AND THE DASHBOARD COUNT (keep these stable across shots)
//
//   Enrolments badge   enrollments.status = 'pending'                     -> 5
//   LPKC badge         report_submissions submitted + in_review           -> 4 (director), 2 (Siti Hajar)
//   Appointments badge appointments booked and starting after "now"       -> 22 (director), 7 (Siti Hajar)
//   Bell               notifications unread, per user                     -> 3 (Siti Hajar), 3 (Nur Aisyah), none (director)
//   Dashboard          students 805 · enrolments 796 (178 / 334 / 284) · overdue 16 invoices ·
//                      no course 4 · invites 3 · not live 1 · the ledger of cast.money.tiles
//
// A partition that inserts into these tables moves those numbers on its own
// shots only, and the film will show two different counts. Patch a base row
// instead, or accept the difference knowingly.
// ---------------------------------------------------------------------------
