/**
 * Report checks — a document sent in, looked at, and talked about.
 *
 * The timeline entries are assembled from an event (`kind` + who + what
 * changed), never stored as sentences, so a thread an English-speaking checker
 * worked through reads Malay for a Malay student. Same discipline as the
 * notification centre, and the same reason.
 */
export const reports = {
  // --- status ---------------------------------------------------------------
  // Two of these wait on the checker, one waits on the student, one is done.
  // The labels say which way the ball is facing, because that is the only thing
  // anybody looks at a status for.
  'report.status.submitted': 'Waiting',
  'report.status.in_review': 'Being checked',
  'report.status.changes_requested': 'Changes needed',
  'report.status.approved': 'Approved',

  // --- the staff queue ------------------------------------------------------
  'report.queue.desc': 'Reports sent in for checking, longest wait first.',
  'report.queue.search': 'Search by student name',
  'report.queue.empty': 'Nothing waiting.',
  'report.queue.empty_hint':
    'Students send reports from their own page. Set who checks them from the menu above.',
  'report.queue.empty_filtered': 'Nothing matches that.',

  // --- the thread -----------------------------------------------------------
  'report.version': 'Version {version}',
  'report.unassigned': 'Nobody yet',
  'report.checked_by': 'Checked by {name}',
  'report.submitted_at': 'Sent {when}',
  'report.assigned_to': 'This report is with {name}.',
  'report.resubmit': 'Send a new version',
  'report.hand_on': 'Pass to someone else',
  'report.open_student': 'Open student',
  'report.reply.student': 'Ask a question, or say what you have changed…',
  'report.reply.staff': 'What needs fixing?',
  'report.send': 'Send',
  'report.someone': 'Someone',
  'report.no_url': 'That file could not be opened.',

  // --- timeline entries -----------------------------------------------------
  'report.event.submitted': '{who} sent this for checking',
  'report.event.resubmitted': '{who} sent version {version}',
  'report.event.commented': '{who} commented',
  'report.event.decided': '{who} updated the status',
  'report.event.assigned': '{who} passed this to {to}',
  'report.event.you': '(you)',

  // --- files ----------------------------------------------------------------
  'report.file.attach': 'Attach files',
  'report.file.uploading': 'Uploading…',
  'report.file.remove': 'Remove {name}',
  'report.file.download': 'Download {name}',

  // --- sending --------------------------------------------------------------
  'report.submit.title': 'Send a report for checking',
  'report.submit.title_again': 'Send a new version',
  'report.submit.desc': 'For {course}. Your academy assigns a checker for you.',
  'report.submit.desc_again':
    'This becomes version {version}. The same person keeps checking it.',
  'report.submit.what': 'What are you sending?',
  'report.submit.what_hint': 'e.g. LPKC, slide and portfolio',
  'report.submit.files': 'Documents',
  'report.submit.send': 'Send for checking',
  'report.submit.sending': 'Sending…',

  // --- the rota -------------------------------------------------------------
  'report.pool.title': 'Who checks reports',
  'report.pool.desc':
    'Reports are shared out between these people, fewest open first. With nobody here, students cannot send anything.',
  'report.pool.none': 'No instructors in this academy yet.',
  'report.pool.not_active': 'Not active — left out of the rota',
  'report.pool.toggle_aria': 'Let {name} check reports',

  // --- the learner's list ---------------------------------------------------
  'report.learn.desc': 'Send your documents in and see what your checker says.',
  'report.learn.closed': 'Your academy is not checking reports here yet.',
  'report.learn.closed_hint': 'Ask the office how to send yours in.',
  'report.learn.no_courses': 'You are not on a course yet.',
  'report.learn.nothing_sent': 'Nothing sent yet',

  // --- dashboards -----------------------------------------------------------
  'report.dash.staff.title': 'Reports to check',
  'report.dash.staff.empty': 'Nothing waiting to be checked.',
  'report.dash.learn.title': 'Your reports',
  'report.dash.learn.empty': 'Nothing sent for checking.',
} as const

export type ReportsDict = Record<keyof typeof reports, string>
