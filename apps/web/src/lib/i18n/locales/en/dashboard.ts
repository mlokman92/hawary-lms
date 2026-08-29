/** The staff dashboard: setup checklist, exception tiles, revenue, work queues. */
export const dashboard = {
  // Header
  'dash.header.desc': '{date} · {status}',
  'dash.header.checking': 'Checking your academy…',
  'dash.header.all_clear': 'Nothing needs you right now.',
  'dash.header.attention_one': '{count} item needs your attention.',
  'dash.header.attention_other': '{count} items need your attention.',
  'dash.loading': 'Loading your academy…',
  'dash.action.add_student': 'Add student',
  'dash.action.new_invoice': 'New invoice',
  'dash.view_all': 'View all',

  // Setup checklist — the empty state for a brand-new academy
  'dash.setup.title': 'Get your academy running',
  'dash.setup.subtitle': 'A few steps and students can start learning.',
  'dash.setup.hide': 'Hide',
  'dash.setup.step.course': 'Create your first course',
  'dash.setup.step.module': 'Add a module to a course',
  'dash.setup.step.student': 'Add your first student',
  'dash.setup.step.enroll': 'Enroll a student in a course',
  'dash.setup.step.publish': 'Publish a course so students can see it',
  'dash.setup.step.gateway': 'Connect ToyyibPay for online payments',

  // Exception tiles
  'dash.tile.overdue.none': 'Nothing overdue',
  'dash.tile.overdue.hint_one': '{count} invoice · oldest {days}',
  'dash.tile.overdue.hint_other': '{count} invoices · oldest {days}',
  'dash.tile.no_course.label': 'No course yet',
  'dash.tile.no_course.none': 'Everyone is in a course',
  'dash.tile.no_course.hint': 'students not enrolled',
  'dash.tile.invites.label': 'Invites pending',
  'dash.tile.invites.none': 'No invites waiting',
  'dash.tile.invites.far': 'all expire in 7+ days',
  'dash.tile.invites.today': 'one expires today',
  'dash.tile.invites.soonest': 'soonest expires in {days}',
  'dash.tile.not_live.label': 'Not live yet',
  'dash.tile.not_live.none': 'Everything is published',
  'dash.tile.not_live.hint': 'marked draft in published courses',

  // Admin-only alerts
  'dash.alert.recon.title_one': '{count} payment needs reconciling',
  'dash.alert.recon.title_other': '{count} payments need reconciling',
  'dash.alert.recon.body':
    'Money arrived with an amount mismatch, or landed on a voided invoice.',
  'dash.alert.recon.cta': 'Review',
  'dash.alert.gateway.title': 'Online payments are off',
  'dash.alert.gateway.body':
    'Students can’t pay by FPX yet — every invoice has to be settled by hand.',
  'dash.alert.gateway.cta': 'Connect ToyyibPay',

  // Health totals
  'dash.stat.students.sub': '{active} active · {trial} trial',
  'dash.stat.enrollments.label': 'Active enrollments',
  'dash.stat.enrollments.sub_one': 'across {count} course',
  'dash.stat.enrollments.sub_other': 'across {count} courses',
  'dash.stat.published.label': 'Published courses',
  'dash.stat.published.sub': '{drafts} draft · {live}/{total} modules live',
  'dash.stat.collected.label': 'Collected this month',
  'dash.stat.collected.same': 'Same as last month',
  'dash.stat.collected.delta': '{delta} vs last month',

  // Revenue overview
  'dash.revenue.title': 'Revenue overview',
  'dash.revenue.description':
    'Billed vs banked over the last {months} months. Collected is the payments ledger; invoiced excludes draft, void and cancelled.',
  'dash.revenue.collected_window': 'Collected · {months} months',
  'dash.revenue.invoiced_window': 'Invoiced · {months} months',
  'dash.revenue.loading': 'Loading revenue…',
  'dash.revenue.chart_loading': 'Loading chart…',
  'dash.revenue.empty.title': 'No revenue yet',
  'dash.revenue.empty.body':
    'Nothing invoiced or collected in the last {months} months.',
  'dash.revenue.empty.cta': 'Create your first invoice',
  'dash.chart.collected': 'Collected',

  // People to follow up
  'dash.people.title': 'People to follow up',
  'dash.people.no_students': 'No students yet.',
  'dash.people.add_first': 'Add your first student',
  'dash.people.all_enrolled': 'Every student is enrolled in a course.',
  'dash.people.joined': '{no} · joined {date}',

  // Pending invitations
  'dash.invites.title': 'Pending invitations',
  'dash.invites.loading': 'Loading invitations…',
  'dash.invites.empty': 'No invitations waiting.',
  'dash.invites.cta': 'Add a student',
  'dash.invites.expires_today': 'Expires today',
  'dash.invites.expires_in': 'Expires in {days}',

  // Course readiness
  'dash.courses.title': 'Course readiness',
  'dash.courses.all': 'All courses',
  'dash.courses.empty.title': 'No courses yet',
  'dash.courses.empty.body':
    'Create a course, add a module, then put notes and assessments inside it.',
  'dash.courses.empty.cta': 'Create your first course',
  'dash.course.archived': 'Archived',
  'dash.course.modules_live': '{live}/{total} modules live',
  'dash.course.no_modules': 'No modules yet — nothing for students to open.',
  'dash.course.drafts_one': '{count} draft',
  'dash.course.drafts_other': '{count} drafts',
  // Screen-reader names for the icon-only counters on each course row.
  'dash.course.sr.students': 'active students',
  'dash.course.sr.notes': 'notes',
  'dash.course.sr.assessments': 'assessments',
  'dash.course.sr.assignments': 'assignments',

  // Recent payments
  'dash.payments.title': 'Recent payments',
  'dash.payments.subtitle':
    'Settled payments from the last two months — the ledger, not invoice balances.',
  'dash.payments.loading': 'Loading payments…',
  'dash.payments.empty': 'No payments in the last two months.',
  // Trainer dashboard — the other half of `/`. A trainer sees this instead of
  // everything above; see pages/TrainerDashboard.tsx.
  //
  // The header line names the next TEACHING DAY, not today's count: bookings
  // cluster onto the two or three days an academy runs, so "no sessions today"
  // would be the answer most mornings and the line would stop being read.
  'dash.trainer.next_day_one': 'Next: {day}, {count} session.',
  'dash.trainer.next_day_other': 'Next: {day}, {count} sessions.',
  'dash.trainer.none_ahead': 'Nothing booked ahead.',
  'dash.week.title': 'Your week',
  'dash.week.today': 'Today',
  'dash.week.empty': 'Nothing booked in the next seven days.',
  'dash.trainer.unclosed.title': 'Needs closing',
  'dash.trainer.marking.assessments': 'Assessments to mark',
  'dash.trainer.marking.assignments': 'Assignments to mark',
  'dash.trainer.no_courses':
    'You are not assigned to any course yet, so there is nothing to mark.',
} as const

export type DashboardDict = Record<keyof typeof dashboard, string>
