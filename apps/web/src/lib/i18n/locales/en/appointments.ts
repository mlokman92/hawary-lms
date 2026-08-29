/**
 * One-to-one appointments: the staff diary and its setup, and the learner's
 * booking page.
 */
export const appointments = {
  'appt.title': 'Appointments',
  'appt.subtitle': 'One-to-one sessions between students and instructors.',
  'appt.book': 'Book',
  'appt.booking': 'Booking…',
  'appt.auto_assigned': 'assigned automatically',
  'appt.open_student': 'Open student',

  // --- Status ---------------------------------------------------------------
  'appt.status.booked': 'Booked',
  'appt.status.completed': 'Done',
  'appt.status.cancelled': 'Cancelled',
  'appt.status.no_show': 'Did not attend',

  // --- One session ----------------------------------------------------------
  'appt.field.instructor': 'Instructor',
  'appt.field.status': 'Status',
  'appt.field.note': 'Note',
  'appt.field.cancel_reason': 'Reason',
  'appt.action.cancel': 'Cancel session',
  'appt.action.complete': 'Mark done',
  'appt.action.no_show': 'Did not attend',
  'appt.cancel.reason': 'Reason',
  'appt.cancel.reason_placeholder':
    'Used only if nobody can cover. Optional.',

  // --- Calendar -------------------------------------------------------------
  'appt.calendar.title': 'Diary',
  'appt.calendar.prev': 'Previous week',
  'appt.calendar.next': 'Next week',
  'appt.calendar.this_week': 'This week',
  'appt.calendar.all_instructors': 'All instructors',

  // --- Setup (its own page: /appointments/settings) -------------------------
  'appt.setup.title': 'Booking settings',
  'appt.setup.subtitle':
    'Who can be booked, when, and on what terms. Set up once.',

  // --- Policy ---------------------------------------------------------------
  'appt.settings.title': 'Booking',
  'appt.settings.description':
    'Off until you switch it on. Students see nothing to book until then.',
  'appt.settings.open': 'Open for booking',
  'appt.settings.slot': 'Session length',
  'appt.settings.minutes': '{count} minutes',
  'appt.settings.mode': 'Who picks the instructor',
  'appt.settings.mode.round_robin': 'Assign automatically',
  'appt.settings.mode.student_choice': 'The student chooses',
  'appt.settings.mode.round_robin_hint':
    'Sessions are shared out evenly. The student books a time, not a person, and is not shown who is free.',
  'appt.settings.mode.student_choice_hint':
    'The student sees which instructors are free at each time and picks one.',
  'appt.settings.notice': 'Least notice (hours)',
  'appt.settings.notice_hint':
    'How far ahead a student must book. Also how late they may still cancel.',
  'appt.settings.horizon': 'Book up to (days ahead)',
  'appt.settings.max_open': 'Open sessions per student',
  'appt.settings.max_open_hint':
    'How many upcoming sessions one student may hold. Leave blank for no limit.',
  'appt.settings.max_week': 'Sessions per student per week',
  'appt.settings.max_week_hint':
    'How many sessions one student may have in a week. Leave blank for no limit.',

  // --- Weekly hours and closures --------------------------------------------
  'appt.hours.title': 'Hours',
  'appt.hours.description':
    'When sessions can be booked, in the academy’s own time. Add a second range for a lunch break.',
  'appt.hours.closed': 'Closed',
  'appt.hours.none_yet':
    'Booking is on, but no hours are set — so there is nothing for students to book. Add hours below.',
  'appt.hours.from': 'From',
  'appt.hours.to': 'To',
  'appt.hours.add': 'Add hours',
  'appt.hours.remove': 'Remove',
  'appt.hours.range_invalid': 'The end time must be after the start time.',
  'appt.timeoff.title': 'Closed dates',
  'appt.timeoff.description':
    'A holiday, or an instructor away. Nothing can be booked in these days.',
  'appt.timeoff.add': 'Close dates',
  'appt.timeoff.who': 'Who',
  'appt.timeoff.whole_academy': 'The whole academy',
  'appt.timeoff.from': 'First day',
  'appt.timeoff.to': 'Last day',
  'appt.timeoff.reason': 'Reason',
  'appt.timeoff.reason_placeholder': 'Public holiday. Optional.',
  'appt.timeoff.none': 'No closed dates ahead.',
  'appt.timeoff.range_invalid': 'The last day cannot be before the first.',

  // --- The pool -------------------------------------------------------------
  'appt.pool.title': 'Who can be booked',
  'appt.pool.description':
    'Only these instructors are offered. Nobody is bookable until you say so.',
  'appt.pool.none': 'No instructors yet',
  'appt.pool.none_hint': 'Add an instructor before opening booking.',
  'appt.pool.not_active': 'Not active — left out until their status changes.',
  'appt.pool.toggle_aria': 'Bookable — {name}',

  // --- Staff booking on a student's behalf ----------------------------------
  'appt.book_for.action': 'Book a session',
  'appt.book_for.title': 'Book a session',
  'appt.book_for.description':
    'Books it straight away, and takes the slot from the student’s side too.',
  'appt.book_for.student': 'Student',
  'appt.book_for.student_search': 'Search by name, email or number',
  'appt.book_for.no_students': 'No student matches.',
  'appt.book_for.change': 'Change',
  'appt.book_for.day': 'Day',
  'appt.book_for.time': 'Time',
  'appt.book_for.no_slots': 'Nothing free on this day.',
  'appt.book_for.instructor': 'Instructor',
  'appt.book_for.auto_round_robin': 'Assign automatically',
  'appt.book_for.auto_any': 'Anyone free',
  'appt.book_for.note': 'Note',
  'appt.book_for.note_placeholder': 'What the session is for. Optional.',

  // --- Learner --------------------------------------------------------------
  'appt.learn.subtitle': 'Book time with an instructor, one to one.',
  'appt.learn.closed': 'Booking is closed',
  'appt.learn.closed_hint':
    'Your academy is not taking bookings at the moment.',
  'appt.learn.book_title': 'Book a session',
  'appt.learn.book_description': 'Pick a day, then a time.',
  'appt.learn.at_cap':
    'You already have as many sessions booked as your academy allows. Cancel one to book another.',
  'appt.learn.nothing_free': 'Nothing is free to book right now.',
  'appt.learn.pick_day': 'Pick a day above.',
  // On the day chips. The count is the reason the strip exists: it turns
  // "which day should I look at" into something you can see without tapping.
  'appt.learn.day_slots_one': '{count} slot',
  'appt.learn.day_slots_other': '{count} slots',
  // Above the times, because on a phone the chosen day chip may be scrolled
  // out of view by the time you are looking at the grid.
  'appt.learn.times_available_one': '{count} time available',
  'appt.learn.times_available_other': '{count} times available',
  'appt.learn.instructor': 'Instructor',
  'appt.learn.instructor_placeholder': 'Choose an instructor',
  'appt.learn.note': 'What would you like to cover?',
  'appt.learn.note_placeholder': 'Optional.',
  'appt.learn.mine': 'My sessions',
  'appt.learn.none': 'No sessions yet',
  'appt.learn.none_hint': 'Book one above and it will show here.',
  // The register — every session, not just this week
  'appt.register.title': 'All sessions',
  'appt.register.subtitle':
    'Every session the academy has held, including cancelled ones.',
  'appt.register.search': 'Search student name or number',
  'appt.register.any_status': 'Any status',
  'appt.register.mine': 'My sessions',
  'appt.register.empty': 'No sessions match.',
  'appt.register.count': '{count} sessions',
  'appt.register.page': 'Page {page} of {of}',

  // Handing a session on. "Cancel" is what the instructor presses; what
  // actually happens is that somebody else takes it.
  'appt.handover.done':
    '{name} is taking this session. Same student, same time.',
  'appt.handover.none':
    'Nobody else was free at that time, so the session has been cancelled.',

} as const

export type AppointmentsDict = Record<keyof typeof appointments, string>
