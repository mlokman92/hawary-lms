// Every id in the fake world, derived — never random — so a partition, a shot
// file and a handler written by three different people all name the same row.
//
// Plain JavaScript on purpose: the browser bundle (Vite), the Expo bundle
// (Metro) and the Node shot files all import this same file.
//
//   import { ID, uid, studentId } from '../fake/ids.js'
//   url: `/courses/${ID.course.siri3}`
//   db.add('assignment_submissions', [{ id: uid('submission', 1), student_id: studentId(318), ... }])

/** The one real id in the film: Hawary Academy's row (it is in cast.json). */
export const ACADEMY_ID = '9c5fd727-65cd-4657-ab4d-fe52fa93d8b7'

function fnv(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

const hex8 = (n) => n.toString(16).padStart(8, '0')

/**
 * A stable, well-formed uuid for (kind, n).
 * A number stays readable in the last group: uid('student', 318) ends in …000000000318.
 * A string is hashed: uid('note', 'siri3/week1/0').
 * @param {string} kind
 * @param {number | string} n
 * @returns {string}
 */
export function uid(kind, n) {
  const head = hex8(fnv('hawary:' + kind))
  const tail =
    typeof n === 'number'
      ? String(n).padStart(12, '0')
      : (hex8(fnv(String(n))) + hex8(fnv(String(n) + '#'))).slice(0, 12)
  return `${head}-0000-4000-8000-${tail}`
}

/** Student by the number in their student_no: HA-2026-0318 -> studentId(318). */
export const studentId = (no) => uid('student', no)
/** The auth user behind a student record (when the account is claimed). */
export const studentUserId = (no) => uid('user', 'student-' + no)
/** A student's one enrolment. */
export const enrollmentId = (no) => uid('enrollment', no)
/** Invoice by the number in its invoice_no: INV-2026-0412 -> invoiceId(412). */
export const invoiceId = (seq) => uid('invoice', seq)

export const COURSE_KEYS = /** @type {const} */ (['siri1', 'siri2', 'siri3'])
export const WEEK_KEYS = /** @type {const} */ (['week1', 'week2'])

/** The content of one module, in the cast's order. */
function weekIds(course, week) {
  const k = `${course}/${week}`
  return {
    module: uid('module', k),
    /** [first note, second note] */
    notes: [uid('note', k + '/0'), uid('note', k + '/1')],
    material: uid('material', k),
    /** the week's quiz */
    assessment: uid('assessment', k),
    /** the week's tugasan */
    assignment: uid('assignment', k),
  }
}

function courseContent(course) {
  return { week1: weekIds(course, 'week1'), week2: weekIds(course, 'week2') }
}

export const ID = {
  academy: ACADEMY_ID,
  /** auth users (= profiles.id = academy_members.user_id) */
  user: {
    director: uid('user', 'hakim'),
    admin: uid('user', 'admin'),
    hajar: uid('user', 'hajar'),
    farah: uid('user', 'farah'),
    amirul: uid('user', 'amirul'),
    izzah: uid('user', 'izzah'),
    /** Nur Aisyah Razak, the hero student (HA-2026-0318) */
    aisyah: studentUserId(318),
  },
  /** instructors.id — the CRM record, not the user */
  instructor: {
    hajar: uid('instructor', 'hajar'),
    farah: uid('instructor', 'farah'),
    amirul: uid('instructor', 'amirul'),
    izzah: uid('instructor', 'izzah'),
  },
  course: {
    siri1: uid('course', 'siri1'),
    siri2: uid('course', 'siri2'),
    siri3: uid('course', 'siri3'),
  },
  /** ID.content.siri3.week1.{module,notes[0..1],material,assessment,assignment} */
  content: {
    siri1: courseContent('siri1'),
    siri2: courseContent('siri2'),
    siri3: courseContent('siri3'),
  },
  /** the hero: Nur Aisyah Razak */
  hero: {
    studentNo: 318,
    student: studentId(318),
    user: studentUserId(318),
    enrollment: enrollmentId(318),
    invoiceSeq: 412,
    invoice: invoiceId(412),
    /** her LPKC thread (report_submissions.id) */
    report: uid('report', 318),
  },
}

/** report_submissions.id for a student — one report per (student, course). */
export const reportId = (studentNo) => uid('report', studentNo)
