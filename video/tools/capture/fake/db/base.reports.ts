// LPKC report checks — the feature the film changes: the student uploads, an
// AI check answers on the thread at once, the trainer monitors and approves.
//
// Part of base (not a partition of its own) because three surfaces show the
// same threads — the trainer's queue on the web, the learner's page on the
// web, the Student app — and they must agree.
//
// THE CLOCK DRIVES THE STORY. Every thread is seeded as its full timeline;
// after all partitions have loaded, entries later than the film's "now" are
// removed and each report's status / version / dates are recomputed from what
// is left. So one URL param walks the hero thread through its beats:
//
//   ?now=2026-10-07T09:10   Nur Aisyah has not submitted yet (no report)
//   ?now=2026-10-07T09:12:20  v1 uploaded, AI still checking        -> submitted
//   ?now=2026-10-07T09:30   AI: 3 points to fix                      -> changes_requested
//   ?now=2026-10-07T11:47:15  v2 uploaded, AI checking              -> submitted (v2)
//   (default 11:55)         AI: all 12 met, waiting for the trainer  -> in_review   == cast.lpkc.queue
//   ?now=2026-10-07T12:06   Siti Hajar approved                      -> approved
//
// The AI is an actor on the timeline: actor_name 'Hawary AI', actor_role
// 'system', no actor_id. The real ReportTimeline renders that as it stands.

import type { Ctx, FakeDb, Row } from '../db'
import { ID, reportId, studentUserId, uid } from '../ids.js'
import { at, cast, day, plusMinutes } from '../kit'

export const AI_NAME: string = cast.lpkc.aiActorName

type Trainer = { key: string; name: string }

const POINTS = [
  'Section 2.1, Latar Belakang TASKA: the enrolment figures are missing.',
  'Section 3.2, Rancangan Aktiviti: the learning objectives for Day 2 are missing.',
  'Section 4, Pemerhatian: the anecdotal record is not dated.',
  'Rujukan: 1 source is not in APA format (item 3).',
  'Portfolio, Unit 3: the photo evidence has no captions.',
  'Slide 7: the chart has no title or source.',
  'Lampiran B: the consent form is not signed.',
]

/** The AI's note when something is missing — the cast's wording, generalised. */
export function aiFixBody(points: string[]): string {
  const n = points.length
  return (
    `AI check complete. ${n} point${n === 1 ? '' : 's'} to fix before approval:\n\n` +
    points.map((p, i) => `${i + 1}. ${p}`).join('\n') +
    `\n\nEverything else meets the LPKC checklist (${12 - n} of 12 items). Upload a new version when you are ready.`
  )
}

/** The AI's note when the checklist is met. */
export function aiPassBody(fixedFromVersion: number | null, fixedCount = 0): string {
  return (
    'AI check complete. All 12 checklist items are met.\n\n' +
    (fixedFromVersion ? `The ${fixedCount} point${fixedCount === 1 ? '' : 's'} from version ${fixedFromVersion} ${fixedCount === 1 ? 'is' : 'are'} fixed. ` : '') +
    "Ready for the trainer's approval."
  )
}

type Step =
  | { kind: 'upload'; at: string; files: { name: string; size: number }[] }
  | { kind: 'ai-fix'; at: string; points: string[] }
  | { kind: 'ai-pass'; at: string }
  | { kind: 'approve'; at: string; body: string }

const mimeOf = (name: string) =>
  name.endsWith('.pdf')
    ? 'application/pdf'
    : name.endsWith('.pptx')
      ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      : name.endsWith('.docx')
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : 'application/octet-stream'

export function seedReports(db: FakeDb, trainers: readonly Trainer[]): void {
  const trainerKey = new Map(trainers.map((t) => [t.name, t.key]))
  const lpkc = (name: string, v: number) => `LPKC_${name.split(' ').slice(0, 2).join('_')}_v${v}.pdf`
  const secs = (iso: string, s: number) => new Date(Date.parse(iso) + s * 1000).toISOString()

  /** Scripts for the seven other threads of cast.lpkc.queue, ending in the state the queue gives them. */
  const scripts: Record<string, Step[]> = {
    'Aina Sofea Rosli': [
      { kind: 'upload', at: day(-1, '14:30'), files: [{ name: lpkc('Aina Sofea Rosli', 1), size: 2_254_438 }, { name: 'Slide_Pembentangan.pptx', size: 4_928_307 }] },
      { kind: 'ai-fix', at: secs(day(-1, '14:30'), 38), points: [POINTS[0], POINTS[3], POINTS[5]] },
    ],
    'Nurul Huda Mansor': [
      { kind: 'upload', at: day(-5, '10:02'), files: [{ name: lpkc('Nurul Huda Mansor', 1), size: 2_044_723 }, { name: 'Slide_Pembentangan.pptx', size: 6_134_169 }] },
      { kind: 'ai-fix', at: secs(day(-5, '10:02'), 41), points: [POINTS[1], POINTS[2], POINTS[4], POINTS[6]] },
      { kind: 'upload', at: day(-3, '15:40'), files: [{ name: lpkc('Nurul Huda Mansor', 2), size: 2_306_867 }] },
      { kind: 'ai-fix', at: secs(day(-3, '15:40'), 36), points: [POINTS[4]] },
      { kind: 'upload', at: day(-2, '16:20'), files: [{ name: lpkc('Nurul Huda Mansor', 3), size: 2_411_724 }, { name: 'Portfolio_Unit_3.pdf', size: 3_670_016 }] },
      { kind: 'ai-pass', at: secs(day(-2, '16:20'), 34) },
    ],
    'Farhana Yusof': [
      { kind: 'upload', at: day(-3, '11:15'), files: [{ name: lpkc('Farhana Yusof', 1), size: 1_887_436 }, { name: 'Slide_Pembentangan.pptx', size: 5_347_737 }] },
      { kind: 'ai-fix', at: secs(day(-3, '11:15'), 39), points: [POINTS[2], POINTS[3]] },
      { kind: 'upload', at: day(-1, '20:45'), files: [{ name: lpkc('Farhana Yusof', 2), size: 1_992_294 }] },
      { kind: 'ai-fix', at: secs(day(-1, '20:45'), 37), points: [POINTS[3]] },
    ],
    'Intan Syazwani Halim': [
      { kind: 'upload', at: day(-4, '15:30'), files: [{ name: lpkc('Intan Syazwani Halim', 1), size: 2_621_440 }, { name: 'Slide_Pembentangan.pptx', size: 5_662_310 }] },
      { kind: 'ai-fix', at: secs(day(-4, '15:30'), 40), points: [POINTS[5], POINTS[6]] },
      { kind: 'upload', at: day(-2, '09:40'), files: [{ name: lpkc('Intan Syazwani Halim', 2), size: 2_726_297 }] },
      { kind: 'ai-pass', at: secs(day(-2, '09:40'), 33) },
      { kind: 'approve', at: day(-1, '09:15'), body: 'Approved. Clear objectives and a tidy portfolio.' },
    ],
    'Puteri Balqis Azman': [
      { kind: 'upload', at: day(0, '11:54'), files: [{ name: lpkc('Puteri Balqis Azman', 1), size: 2_359_296 }, { name: 'Slide_Pembentangan.pptx', size: 4_509_081 }] },
      // The AI answers 38 seconds later — after the default clock, so at 11:55 it is still "checking".
      { kind: 'ai-fix', at: secs(day(0, '11:54'), 78), points: [POINTS[1], POINTS[4]] },
    ],
    'Zulaikha Hamdan': [
      { kind: 'upload', at: day(-3, '21:10'), files: [{ name: lpkc('Zulaikha Hamdan', 1), size: 2_883_584 }, { name: 'Slide_Pembentangan.pptx', size: 6_815_744 }] },
      { kind: 'ai-pass', at: secs(day(-3, '21:10'), 35) },
      { kind: 'approve', at: day(-2, '10:30'), body: 'Approved. Excellent work, Zulaikha.' },
    ],
    'Hannah Maisarah Jalil': [
      { kind: 'upload', at: day(-4, '19:44'), files: [{ name: lpkc('Hannah Maisarah Jalil', 1), size: 2_149_580 }, { name: 'Slide_Pembentangan.pptx', size: 5_033_164 }] },
      { kind: 'ai-fix', at: secs(day(-4, '19:44'), 42), points: [POINTS[0], POINTS[2], POINTS[6]] },
      { kind: 'upload', at: day(-1, '10:05'), files: [{ name: lpkc('Hannah Maisarah Jalil', 2), size: 2_254_438 }] },
      { kind: 'ai-pass', at: secs(day(-1, '10:05'), 36) },
    ],
  }

  for (const q of cast.lpkc.queue) {
    const s = db.get('students', { full_name: q.student })
    const n = Number(String(s.student_no).slice(-4))
    const id = reportId(n)
    const holderKey = trainerKey.get(q.holder)!
    const holderUser = (ID.user as Record<string, string>)[holderKey]
    const studentUser = s.user_id ?? studentUserId(n)

    const events: Row[] = []
    const files: Row[] = []
    let version = 0
    let lastFix = 0
    const push = (e: Row, attach: { name: string; size: number }[] = []) => {
      const eventId = uid('report-event', `${n}/${events.length}`)
      events.push({ id: eventId, report_id: id, ...e })
      attach.forEach((f, i) =>
        files.push({
          id: uid('report-file', `${n}/${events.length}/${i}`),
          report_id: id,
          event_id: eventId,
          file_name: f.name,
          file_path: `${db.academyId}/reports/${studentUser}/${id}/v${version}/${f.name}`,
          mime_type: mimeOf(f.name),
          size_bytes: f.size,
          version,
          created_at: e.created_at,
        }),
      )
    }

    if (q.student === cast.people.heroStudent.name) {
      // The hero thread is the cast's, word for word.
      for (const t of cast.lpkc.timeline) {
        const when = at(t.at)
        if (t.kind === 'submitted') {
          version = t.version ?? version + 1
          push({ kind: 'submitted', version, actor_id: studentUser, actor_name: t.actor, actor_role: 'student', body: null, to_status: null, created_at: when }, t.files ?? [])
        } else if (t.actor === AI_NAME) {
          push({ kind: 'comment', version, actor_id: null, actor_name: AI_NAME, actor_role: 'system', body: t.body ?? null, to_status: t.to_status ?? null, created_at: when })
        } else {
          push({ kind: t.kind, version, actor_id: holderUser, actor_name: t.actor, actor_role: 'instructor', body: t.body ?? null, to_status: t.to_status ?? null, created_at: when })
        }
      }
    } else {
      for (const step of scripts[q.student] ?? []) {
        if (step.kind === 'upload') {
          version++
          push({ kind: 'submitted', version, actor_id: studentUser, actor_name: q.student, actor_role: 'student', body: null, to_status: null, created_at: step.at }, step.files)
        } else if (step.kind === 'ai-fix') {
          lastFix = step.points.length
          push({ kind: 'comment', version, actor_id: null, actor_name: AI_NAME, actor_role: 'system', body: aiFixBody(step.points), to_status: 'changes_requested', created_at: step.at })
        } else if (step.kind === 'ai-pass') {
          push({ kind: 'comment', version, actor_id: null, actor_name: AI_NAME, actor_role: 'system', body: aiPassBody(version > 1 ? version - 1 : null, lastFix), to_status: 'in_review', created_at: step.at })
        } else {
          push({ kind: 'status', version, actor_id: holderUser, actor_name: q.holder, actor_role: 'instructor', body: step.body, to_status: 'approved', created_at: step.at })
        }
      }
    }

    db.add('report_submissions', {
      id,
      student_id: s.id,
      course_id: ID.course.siri3,
      instructor_id: (ID.instructor as Record<string, string>)[holderKey],
      title: cast.lpkc.title,
      auto_assigned: true,
      created_by: studentUser,
      // status / version / dates are derived from the timeline by settleReports().
      status: 'submitted',
      version: 1,
      submitted_at: events[0]?.created_at ?? day(0, '09:00'),
      created_at: events[0]?.created_at ?? day(0, '09:00'),
    })
    db.add('report_events', events)
    db.add('report_files', files)
  }

  db.afterLoad(() => settleReports(db))
  registerReportHandlers(db)
}

/**
 * Drop what has not happened yet at the film's clock, then make every report
 * row say what its timeline says. Reports with no timeline at all (rows a
 * partition added only to fill the queue) are left exactly as seeded.
 */
export function settleReports(db: FakeDb): void {
  const now = db.now().getTime()
  const scripted = new Set(db.rows('report_events').map((e) => e.report_id))
  for (const table of ['report_events', 'report_files', 'notifications', 'announcements'] as const) {
    db.remove(table, (r: Row) => !!r.created_at && Date.parse(r.created_at) > now)
  }
  for (const id of scripted) {
    const report = db.byId('report_submissions', id) as Row | null
    if (!report) continue
    const events = db.where('report_events', { report_id: id }).sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
    if (events.length === 0) {
      // Not submitted yet at this clock.
      db.remove('report_submissions', id)
      continue
    }
    let status = 'submitted'
    let version = 1
    let submitted = events[0].created_at
    let reviewed: string | null = null
    let approved: string | null = null
    for (const e of events) {
      if (e.kind === 'submitted') {
        status = 'submitted'
        version = e.version ?? version
        submitted = e.created_at
        approved = null
      } else if (e.to_status) {
        status = e.to_status
        reviewed = e.created_at
        approved = e.to_status === 'approved' ? e.created_at : null
      }
    }
    Object.assign(report, {
      status,
      version,
      submitted_at: submitted,
      reviewed_at: reviewed,
      approved_at: approved,
      created_at: events[0].created_at,
      updated_at: events[events.length - 1].created_at,
    })
  }
  db.touch()
}

function registerReportHandlers(db: FakeDb): void {
  const canSee = (r: Row, c: Ctx) =>
    c.isAdmin || (!!c.instructorId && r.instructor_id === c.instructorId) || (!!c.studentId && r.student_id === c.studentId)

  const eventsOf = (id: string) =>
    db
      .where('report_events', { report_id: id })
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
      .map((e) => ({
        id: e.id,
        kind: e.kind,
        body: e.body,
        to_status: e.to_status,
        version: e.version,
        actor_id: e.actor_id,
        actor_name: e.actor_name,
        actor_role: e.actor_role,
        created_at: e.created_at,
        files: db
          .where('report_files', { event_id: e.id })
          .map((f) => ({ id: f.id, file_name: f.file_name, mime_type: f.mime_type, size_bytes: f.size_bytes })),
      }))

  // The whole thread, as the real `get_report` projects it.
  db.rpc('get_report', (args, ctx) => {
    const r = db.byId('report_submissions', args._report_id) as Row | null
    if (!r || !canSee(r, ctx)) throw db.fail('Report not found', { code: 'P0002', status: 404 })
    const s = db.byId('students', r.student_id) as Row
    const c = db.byId('courses', r.course_id) as Row
    const i = db.byId('instructors', r.instructor_id) as Row | null
    return {
      id: r.id,
      academy_id: r.academy_id,
      title: r.title,
      status: r.status,
      version: r.version,
      auto_assigned: r.auto_assigned,
      submitted_at: r.submitted_at,
      reviewed_at: r.reviewed_at,
      approved_at: r.approved_at,
      my_role: ctx.studentId === r.student_id ? 'student' : ctx.isAdmin ? 'admin' : 'instructor',
      student: { id: s.id, full_name: s.full_name, student_no: s.student_no, email: s.email, phone: s.phone },
      course: { id: c.id, title: c.title, code: c.code },
      instructor: i ? { id: i.id, full_name: i.full_name, avatar_url: i.avatar_url, email: i.email } : null,
      events: eventsOf(r.id),
    }
  })

  // The learner's list: one row per course they are on, with its report if any.
  db.rpc('my_reports', (_args, ctx) => {
    const open = db.rows('instructors').some((i) => i.is_report_checker && i.status === 'active' && !i.archived_at)
    if (!ctx.studentId) return { is_open: open, courses: [] }
    const courses = db
      .where('enrollments', (e) => e.student_id === ctx.studentId && (e.status === 'active' || e.status === 'completed'))
      .map((e) => {
        const c = db.byId('courses', e.course_id) as Row
        const r = db.find('report_submissions', { student_id: ctx.studentId!, course_id: e.course_id }) as Row | undefined
        const events = r ? db.where('report_events', { report_id: r.id }) : []
        const last = events.reduce((m, ev) => (ev.created_at > m ? ev.created_at : m), r?.submitted_at ?? '')
        return {
          course_id: c.id,
          course_title: c.title,
          course_code: c.code,
          report: r
            ? {
                id: r.id,
                title: r.title,
                status: r.status,
                version: r.version,
                submitted_at: r.submitted_at,
                reviewed_at: r.reviewed_at,
                instructor_name: (db.byId('instructors', r.instructor_id) as Row | null)?.full_name ?? null,
                last_at: last,
              }
            : null,
        }
      })
    return { is_open: open, courses }
  })

  // --- writes. They answer like the real RPCs; with ?writes=apply they also
  // --- change the thread, so a click in a shot is followed by its result.
  const append = (reportIdValue: string, e: Row, files: Row[] = []): string => {
    const eventId = uid('report-event', `live/${db.rows('report_events').length + 1}`)
    if (db.applyWrites) {
      db.add('report_events', { id: eventId, report_id: reportIdValue, ...e })
      db.add(
        'report_files',
        files.map((f, i) => ({
          id: uid('report-file', `live/${eventId}/${i}`),
          report_id: reportIdValue,
          event_id: eventId,
          file_name: f.name,
          file_path: f.path,
          mime_type: f.mime,
          size_bytes: f.size,
          version: e.version ?? 1,
          created_at: e.created_at,
        })),
      )
    }
    return eventId
  }
  const actor = (ctx: Ctx) => ({
    actor_id: ctx.userId,
    actor_name: ctx.persona?.fullName ?? null,
    actor_role: ctx.role === 'student' ? 'student' : ctx.isAdmin ? 'admin' : 'instructor',
  })

  db.rpc('submit_report', (args, ctx) => {
    if (!ctx.studentId) throw db.fail('Only a student can submit a report', { code: '42501' })
    const existing = db.find('report_submissions', { student_id: ctx.studentId, course_id: args._course_id }) as Row | undefined
    const nowIso = ctx.now.toISOString()
    const version = existing ? existing.version + 1 : 1
    let id = existing?.id as string | undefined
    if (!existing) {
      id = uid('report', `live/${ctx.studentId}/${args._course_id}`)
      if (db.applyWrites) {
        const pool = db.where('instructors', (i) => i.is_report_checker && i.status === 'active')
        db.add('report_submissions', {
          id, student_id: ctx.studentId, course_id: args._course_id, instructor_id: pool[0]?.id ?? null,
          title: args._title, status: 'submitted', version: 1, auto_assigned: true, submitted_at: nowIso, created_at: nowIso, created_by: ctx.userId,
        })
      }
    } else if (db.applyWrites) {
      Object.assign(existing, { status: 'submitted', version, submitted_at: nowIso, approved_at: null, updated_at: nowIso })
      db.touch()
    }
    append(id!, { kind: 'submitted', version, body: null, to_status: null, created_at: nowIso, ...actor(ctx) }, args._files ?? [])
    return { id, version, is_new: !existing }
  })

  db.rpc('comment_on_report', (args, ctx) => {
    const r = db.byId('report_submissions', args._report_id) as Row | null
    if (!r || !canSee(r, ctx)) throw db.fail('Report not found', { code: 'P0002', status: 404 })
    const nowIso = ctx.now.toISOString()
    // A student's verdict is dropped by the server, exactly as in production.
    const to = ctx.role === 'student' ? null : (args._to_status ?? null)
    const eventId = append(r.id, { kind: to && !args._body ? 'status' : 'comment', version: r.version, body: args._body ?? null, to_status: to, created_at: nowIso, ...actor(ctx) }, args._files ?? [])
    if (db.applyWrites && to) {
      Object.assign(r, { status: to, reviewed_at: nowIso, approved_at: to === 'approved' ? nowIso : null, updated_at: nowIso })
      db.touch()
    }
    return { id: eventId, status: to ?? r.status }
  })

  db.rpc('reassign_report', (args, ctx) => {
    const r = db.byId('report_submissions', args._report_id) as Row | null
    if (!r || !ctx.isAdmin) throw db.fail('Only an admin can reassign a report', { code: '42501' })
    const pool = db.where('instructors', (i) => i.is_report_checker && i.status === 'active' && i.id !== r.instructor_id)
    const next = (args._instructor_id ? db.byId('instructors', args._instructor_id) : pool[0]) as Row | null
    if (!next) throw db.fail('Nobody else is in the checking rota')
    const nowIso = ctx.now.toISOString()
    append(r.id, { kind: 'assigned', version: r.version, body: next.full_name, to_status: null, created_at: nowIso, ...actor(ctx) })
    if (db.applyWrites) {
      Object.assign(r, { instructor_id: next.id, auto_assigned: !args._instructor_id, updated_at: nowIso })
      db.touch()
    }
    return { id: r.id, instructor_id: next.id }
  })
}

/** Used by base for the bell: when each scripted moment of the hero thread happens. */
export const HERO_MOMENTS = {
  v1: at(cast.lpkc.timeline[0].at),
  aiFix: at(cast.lpkc.timeline[1].at),
  v2: at(cast.lpkc.timeline[2].at),
  aiPass: at(cast.lpkc.timeline[3].at),
  approved: at(cast.lpkc.timeline[4].at),
  /** a minute after, for "read" stamps */
  after: (iso: string, minutes: number) => plusMinutes(iso, minutes),
}
