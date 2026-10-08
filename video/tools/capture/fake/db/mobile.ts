// PARTITION: mobile — what only the two phone apps show.
//
// Always the LAST partition in the mobile harness (video/tools/capture/mobile):
//
//   base                the academy, the ledger, the diary, the eight LPKC threads
//   money | teaching    whatever a shot lays underneath with ?db= — the learner's
//                       quiz attempt, draft and booking RPCs, the money screens and
//                       incentives (money); the marking queues (teaching). They are
//                       the web agents' files; nothing here repeats them, so the
//                       phone and the browser tell the same story.
//   mobile              this file: the features that exist on a phone only
//
//   1. Announcements — mobile only (docs/mobile-apps.md). The cast's two, and
//      three more in the same voice. post_announcement / delete_announcement.
//   2. Attachments on an assignment hand-in — attached in the Student app only.
//      Nur Aisyah's draft of Tugasan 1 carries a PDF and a photo.
//   3. A fuller bell for Nur Aisyah: the announcements, her invoice, her earlier
//      session, "your report was sent". Every row added here is already READ,
//      so the unread badge stays what base makes it (3) on every surface.
//
// Nothing here inserts into enrollments, report_submissions or appointments.
// Everything dated follows the film's clock: base drops announcements and
// notifications that have not happened yet, and the attachments below are
// dropped the same way.

import type { FakeDb, Row } from '..'
import { ACADEMY_ID, ID, at, cast, day, plusMinutes, uid } from '..'

/** Nur Aisyah's draft of Tugasan 1 — the same row the `money` partition seeds for the web. */
export const HERO_DRAFT = uid('submission', 'aisyah/tugasan1')

const HAJAR = cast.people.trainers[0].name
const DIRECTOR = cast.people.director.name

type Ann = { key: string; title: string; body: string; by: 'hajar' | 'director' | 'farah'; course: 'siri3' | 'siri2' | null; at: string }

export default function mobile(db: FakeDb): void {
  const siri3 = db.get('courses', ID.course.siri3).title
  const author = { hajar: HAJAR, director: DIRECTOR, farah: cast.people.trainers[1].name }
  const authorId = { hajar: ID.user.hajar, director: ID.user.director, farah: ID.user.farah }

  // ---------------------------------------------------------------------------
  // 1. Announcements
  // ---------------------------------------------------------------------------
  const [ganti, lpkc] = cast.announcements
  const announcements: Ann[] = [
    { key: 'kelas-ganti', title: ganti.title, body: ganti.body, by: 'hajar', course: 'siri3', at: day(-1, '17:05') },
    { key: 'tarikh-lpkc', title: lpkc.title, body: lpkc.body, by: 'director', course: null, at: day(-1, '09:30') },
    {
      key: 'slaid-week1',
      title: 'Slaid Kuliah Week 1 sudah dimuat naik',
      body: 'Slaid kuliah Week 1 boleh dimuat turun di bawah modul Week 1. Sila baca sebelum menjawab Kuiz 1.',
      by: 'hajar',
      course: 'siri3',
      at: day(-2, '14:20'),
    },
    {
      key: 'selamat-datang',
      title: 'Selamat datang ke Siri 3/2026',
      body: 'Kelas pertama bermula Isnin, 5 Oktober, 9.00 pagi. Nota dan kuiz Week 1 sudah dibuka dalam aplikasi ini.',
      by: 'director',
      course: 'siri3',
      at: at('2026-10-04 10:00'),
    },
    {
      key: 'praktikal-siri2',
      title: 'Jadual praktikal di TASKA',
      body: 'Jadual praktikal bagi bulan Oktober telah dikemas kini. Sila semak tarikh kumpulan anda dan hubungi jurulatih jika ada pertindihan.',
      by: 'farah',
      course: 'siri2',
      at: at('2026-10-02 11:15'),
    },
  ]
  const annId = (key: string) => uid('announcement', key)
  db.add(
    'announcements',
    announcements.map((a) => ({
      id: annId(a.key),
      title: a.title,
      body: a.body,
      course_id: a.course ? ID.course[a.course] : null,
      author_name: author[a.by],
      created_by: authorId[a.by],
      created_at: a.at,
    })),
  )

  // Posting notifies every recipient in the same statement; the screen sends nothing itself.
  db.rpc('post_announcement', (args, ctx) => {
    if (!ctx.isStaff) throw db.fail('Only staff can post an announcement', { code: '42501' })
    const id = uid('announcement', `live/${db.rows('announcements').length + 1}`)
    if (db.applyWrites) {
      db.add('announcements', {
        id,
        title: String(args._title ?? '').trim(),
        body: String(args._body ?? '').trim(),
        course_id: args._course_id ?? null,
        author_name: ctx.persona?.fullName ?? null,
        created_by: ctx.userId,
        created_at: ctx.now.toISOString(),
      })
    }
    return id
  })
  db.rpc('delete_announcement', (args) => {
    if (db.applyWrites) db.remove('announcements', args._id)
    return null
  })

  // ---------------------------------------------------------------------------
  // 2. Attachments on Nur Aisyah's Tugasan 1
  // ---------------------------------------------------------------------------
  const draftAt = day(0, '08:24')
  db.add('assignment_submission_files', [
    {
      id: uid('submission-file', 'aisyah/1'),
      submission_id: HERO_DRAFT,
      file_name: 'Rancangan_Aktiviti_Harian.pdf',
      file_path: `${ACADEMY_ID}/submissions/${HERO_DRAFT}/rancangan-aktiviti-harian.pdf`,
      mime_type: 'application/pdf',
      size_bytes: 438_272,
      created_at: plusMinutes(draftAt, 7),
    },
    {
      id: uid('submission-file', 'aisyah/2'),
      submission_id: HERO_DRAFT,
      file_name: 'Jadual_kumpulan_3-4_tahun.jpg',
      file_path: `${ACADEMY_ID}/submissions/${HERO_DRAFT}/jadual-kumpulan.jpg`,
      mime_type: 'image/jpeg',
      size_bytes: 1_782_579,
      created_at: plusMinutes(draftAt, 9),
    },
  ])
  db.rpc('attach_submission_file', (args, ctx) => {
    const f = (args._file ?? {}) as Row
    const id = uid('submission-file', `live/${db.rows('assignment_submission_files').length + 1}`)
    if (db.applyWrites) {
      db.add('assignment_submission_files', {
        id,
        submission_id: args._submission_id,
        file_name: f.name ?? 'lampiran',
        file_path: f.path ?? '',
        mime_type: f.mime ?? null,
        size_bytes: f.size ?? null,
        created_at: ctx.now.toISOString(),
      })
    }
    return id
  })
  db.rpc('remove_submission_file', (args) => {
    if (db.applyWrites) db.remove('assignment_submission_files', args._file_id)
    return null
  })

  // ---------------------------------------------------------------------------
  // 3. Nur Aisyah's bell — all of it already read
  // ---------------------------------------------------------------------------
  const tz = 'Asia/Kuala_Lumpur'
  const invoice = db.get('invoices', ID.hero.invoice)
  const report = (status: string) => ({ report_id: ID.hero.report, role: 'student', with_name: HAJAR, course: siri3, title: cast.lpkc.title, status })
  const earlier = { appointment_id: uid('appointment', '-8/10:00/hajar'), starts_at: day(-8, '10:00'), ends_at: day(-8, '11:00'), tz, role: 'student', with_name: HAJAR }
  const read = (iso: string, minutes: number) => plusMinutes(iso, minutes)

  db.add('notifications', [
    // "Your report was sent" — once per upload of the hero thread.
    { id: uid('notif', 'aisyah/sent-v2'), user_id: ID.user.aisyah, kind: 'report_submitted', data: report('submitted'), created_at: at(cast.lpkc.timeline[2].at), read_at: read(at(cast.lpkc.timeline[2].at), 1) },
    { id: uid('notif', 'aisyah/sent-v1'), user_id: ID.user.aisyah, kind: 'report_submitted', data: report('submitted'), created_at: at(cast.lpkc.timeline[0].at), read_at: read(at(cast.lpkc.timeline[0].at), 1) },
    // The announcements addressed to her: the academy's, and her course's.
    ...announcements
      .filter((a) => a.course === null || a.course === 'siri3')
      .map((a) => ({
        id: uid('notif', `aisyah/ann/${a.key}`),
        user_id: ID.user.aisyah,
        kind: 'announcement' as const,
        data: { announcement_id: annId(a.key), title: a.title, preview: a.body, course: a.course ? siri3 : null, author: author[a.by] },
        created_at: a.at,
        read_at: read(a.at, 22),
      })),
    { id: uid('notif', 'aisyah/appt-0929'), user_id: ID.user.aisyah, kind: 'appointment_booked', data: earlier, created_at: at('2026-09-27 21:08'), read_at: at('2026-09-27 21:09') },
    {
      id: uid('notif', 'aisyah/invoice'),
      user_id: ID.user.aisyah,
      kind: 'invoice_issued',
      data: { invoice_id: invoice.id, invoice_no: invoice.invoice_no, total_sen: invoice.total_sen, due_at: invoice.due_at },
      created_at: invoice.issued_at ?? invoice.created_at,
      read_at: read(invoice.issued_at ?? invoice.created_at, 95),
    },
  ])

  // ---------------------------------------------------------------------------
  // After every partition is in
  // ---------------------------------------------------------------------------
  db.afterLoad(() => {
    const now = db.now().getTime()
    // The draft is `money`'s row when that partition is underneath. Without it,
    // the same draft is put here so the attachments have something to hang on.
    if (!db.byId('assignment_submissions', HERO_DRAFT) && now >= Date.parse(draftAt)) {
      db.add('assignment_submissions', {
        id: HERO_DRAFT,
        assignment_id: ID.content.siri3.week1.assignment,
        student_id: ID.hero.student,
        status: 'draft',
        content:
          'Rancangan aktiviti harian — kumpulan 3–4 tahun, TASKA Permata Kasih.\n\nSlot 1 (8.30 pagi): Senaman pagi dan lagu pergerakan. Objektif: kemahiran motor kasar dan mengikut arahan dua langkah.',
        created_at: draftAt,
      })
    }
    // An attachment cannot be older than its hand-in, or newer than the clock.
    db.remove('assignment_submission_files', (f) => !db.byId('assignment_submissions', f.submission_id) || Date.parse(f.created_at) > now)

    // An admin's Today tab asks for the two money tiles on every screen of the
    // Academy app, also when the shot is about teaching and `money` is not
    // underneath. Same sums over base's invoice book, so the figures are the ones
    // `money` gives; when `money` is loaded its own handler is left alone.
    if (!db.rpcHandler('invoice_totals')) {
      db.rpc('invoice_totals', (args, ctx) => {
        const t = ctx.now.getTime()
        const rows = (db.rows('invoices') as Row[]).filter(
          (i) =>
            (ctx.isAdmin || (!!ctx.studentId && i.student_id === ctx.studentId)) &&
            !['void', 'cancelled', 'draft'].includes(i.status) &&
            (args._no_course ? i.course_id == null : args._course ? i.course_id === args._course : true) &&
            (!args._student || i.student_id === args._student),
        )
        let invoiced = 0
        let collected = 0
        let outstanding = 0
        let overdue = 0
        for (const i of rows) {
          const balance = Math.max(0, i.total_sen - i.amount_paid_sen)
          invoiced += i.total_sen
          collected += i.amount_paid_sen
          outstanding += balance
          if (balance > 0 && (i.status === 'overdue' || (i.due_at && Date.parse(i.due_at) < t))) overdue += balance
        }
        return [{ invoice_count: rows.length, invoiced_sen: invoiced, collected_sen: collected, outstanding_sen: outstanding, overdue_sen: overdue }]
      })
    }
  })
}
