import { IS_STUDENT_APP } from '@/lib/env'
import type { Notification } from '@/features/notifications/api'
import {
  announcementData,
  apptData,
  isAppointmentKind,
  isReportKind,
  moneyData,
  reportData,
  workData,
} from '@/features/notifications/render'

/**
 * Where things lead, in this app's own routes.
 *
 * Two inputs arrive speaking another surface's language: a notification (which
 * the web bell turns into a web path) and a link from an email (which IS a web
 * path). Both are translated here, once, so a push, a bell row and an emailed
 * link about the same thing open the same screen.
 */

/** The screen a notification row opens, or null when it has nowhere to go. */
export function linkOf(row: Pick<Notification, 'kind' | 'data'>): string | null {
  const n = row as Notification
  if (IS_STUDENT_APP) {
    if (isReportKind(n)) {
      const d = reportData(n)
      return d ? `/reports/${d.report_id}` : '/reports'
    }
    if (isAppointmentKind(n)) return apptData(n) ? '/appointments' : null
    if (n.kind === 'work_marked' || n.kind === 'work_due') {
      const d = workData(n)
      if (!d) return '/work'
      return d.work === 'assessment'
        ? `/assessments/${d.work_id}`
        : `/assignments/${d.work_id}`
    }
    if (n.kind === 'invoice_issued' || n.kind === 'payment_received') {
      const d = moneyData(n)
      return d ? `/billing/${d.invoice_id}` : '/billing'
    }
    if (n.kind === 'announcement') {
      return announcementData(n) ? '/announcements' : null
    }
    return null
  }

  // Academy app. Only the two families staff are ever addressed in.
  if (isReportKind(n)) {
    const d = reportData(n)
    return d ? `/lpkc/${d.report_id}` : '/lpkc'
  }
  // The register, not the diary: the diary is one week, and the session a
  // notification is about may not be in it (docs/notifications.md).
  if (isAppointmentKind(n)) return '/appointments/list'
  return null
}

/** `https://app.hawary.my/learn/x?y` or `hawarystudent://x` -> `/x?y`. */
function pathOf(input: string): string {
  const m = input.match(/^([a-z][a-z0-9+.-]*):\/\/(.*)$/i)
  if (!m) return input.startsWith('/') ? input : `/${input}`
  const scheme = m[1] ?? ''
  const rest = m[2] ?? ''
  // An https link carries a host before its path; a custom-scheme link does
  // not — everything after `://` is already the path.
  if (/^https?$/i.test(scheme)) {
    const slash = rest.indexOf('/')
    return slash < 0 ? '/' : rest.slice(slash)
  }
  return `/${rest}`
}

/**
 * Translate an incoming link into a route of this app.
 *
 * The web app's paths are the contract — every email already sent points at
 * them — so the apps bend to the web rather than the other way round. Unknown
 * paths land on the home screen instead of a "not found": a link the app does
 * not understand is still somebody trying to open the app.
 */
export function routeForIncomingLink(input: string): string {
  const full = pathOf(input)
  const [path = '/', query = ''] = full.split('?')
  const q = query ? `?${query}` : ''
  const clean = path.replace(/\/+$/, '') || '/'

  if (IS_STUDENT_APP) {
    // The learner tree lives under /learn on the web and at the root here.
    const p = clean === '/learn' ? '/' : clean.replace(/^\/learn(?=\/)/, '')
    if (p === '/assessments' || p === '/assignments') return '/work'
    if (
      p === '/' ||
      /^\/(courses|work|appointments|reports|billing|profile|notifications|announcements)$/.test(p) ||
      /^\/(courses|notes|assessments|assignments|reports|billing)\/[^/]+$/.test(p)
    ) {
      return p + q
    }
    return '/'
  }

  // Emails sent before the rename still say /reports/:id.
  const p = clean.replace(/^\/reports(?=\/|$)/, '/lpkc')
  if (p === '/assessments' || p === '/assignments') return '/marking'
  if (p === '/appointments/settings') return '/appointments/blocked'
  if (
    p === '/' ||
    /^\/(lpkc|students|instructors|courses|enrollments|appointments|payments|incentives|notifications|announcements|profile|marking)$/.test(p) ||
    /^\/(lpkc|students|instructors|courses|payments|incentives)\/[^/]+$/.test(p) ||
    /^\/grading\/(submissions|attempts)\/[^/]+$/.test(p) ||
    p === '/appointments/list' ||
    p === '/payments/log'
  ) {
    return p + q
  }
  return '/'
}
