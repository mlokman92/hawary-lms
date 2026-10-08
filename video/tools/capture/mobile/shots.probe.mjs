// Low-stakes probing shots: every route of both apps, to see what each screen
// asks the backend for. Output goes to video/.cache/mobile-probe.
//
//   node tools/capture/mobile/run.mjs student --shots tools/capture/mobile/shots.probe.mjs --serve --trace --out .cache/mobile-probe/student

import { ID } from '../fake/ids.js'

const C = ID.content.siri3

export const student = [
  { id: 'sign-in', url: '/', as: 'anon' },
  { id: 'home', url: '/' },
  { id: 'courses', url: '/courses' },
  { id: 'course', url: `/courses/${ID.course.siri3}` },
  { id: 'note', url: `/notes/${C.week1.notes[0]}` },
  { id: 'assessment', url: `/assessments/${C.week1.assessment}` },
  { id: 'assignment', url: `/assignments/${C.week1.assignment}` },
  { id: 'work', url: '/work' },
  { id: 'reports', url: '/reports' },
  { id: 'report', url: `/reports/${ID.hero.report}` },
  { id: 'appointments', url: '/appointments' },
  { id: 'billing', url: '/billing' },
  { id: 'invoice', url: `/billing/${ID.hero.invoice}` },
  { id: 'announcements', url: '/announcements' },
  { id: 'notifications', url: '/notifications' },
  { id: 'more', url: '/more' },
  { id: 'profile', url: '/profile' },
]

export const academy = [
  { id: 'sign-in', url: '/', as: 'anon' },
  { id: 'home', url: '/' },
  { id: 'home-director', url: '/', as: 'director' },
  { id: 'marking', url: '/marking' },
  { id: 'lpkc', url: '/lpkc' },
  { id: 'lpkc-thread', url: `/lpkc/${ID.hero.report}` },
  { id: 'students', url: '/students' },
  { id: 'student', url: `/students/${ID.hero.student}` },
  { id: 'more', url: '/more' },
  { id: 'more-director', url: '/more', as: 'director' },
  { id: 'appointments', url: '/appointments' },
  { id: 'appointments-list', url: '/appointments/list' },
  { id: 'appointments-book', url: '/appointments/book' },
  { id: 'appointments-blocked', url: '/appointments/blocked' },
  { id: 'courses', url: '/courses' },
  { id: 'course', url: `/courses/${ID.course.siri3}` },
  { id: 'enrollments', url: '/enrollments', as: 'director' },
  { id: 'payments', url: '/payments', as: 'director' },
  { id: 'payment', url: `/payments/${ID.hero.invoice}`, as: 'director' },
  { id: 'payments-log', url: '/payments/log', as: 'director' },
  { id: 'incentives', url: '/incentives', as: 'director' },
  { id: 'instructors', url: '/instructors', as: 'director' },
  { id: 'instructor', url: `/instructors/${ID.instructor.hajar}`, as: 'director' },
  { id: 'announcements', url: '/announcements' },
  { id: 'notifications', url: '/notifications' },
  { id: 'profile', url: '/profile' },
]
