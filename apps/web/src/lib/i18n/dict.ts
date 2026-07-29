/**
 * The two dictionaries, composed from one namespace file per feature area.
 *
 * Why namespaces rather than one giant file: they keep a feature's copy next to
 * that feature's work, and they let the English and Malay sides be edited
 * independently without stepping on each other.
 *
 * Why keys carry their own prefix (`'students.title'`, not nested objects):
 * `keyof typeof en` is then a flat union of string literals, so `t()` is
 * autocompleted and a typo is a compile error — no path-type gymnastics.
 *
 * Completeness is enforced twice over:
 *   - each `ms/<ns>.ts` is annotated with the `<Ns>Dict` type its English
 *     sibling exports, so a missing or misspelled key fails there first;
 *   - `ms` below is annotated `Record<TKey, string>`, so a namespace that is
 *     wired into `en` but forgotten in `ms` also fails.
 */
import { common as enCommon } from './locales/en/common'
import { nav as enNav } from './locales/en/nav'
import { auth as enAuth } from './locales/en/auth'
import { dashboard as enDashboard } from './locales/en/dashboard'
import { courses as enCourses } from './locales/en/courses'
import { modules as enModules } from './locales/en/modules'
import { students as enStudents } from './locales/en/students'
import { instructors as enInstructors } from './locales/en/instructors'
import { payments as enPayments } from './locales/en/payments'
import { pay as enPay } from './locales/en/pay'
import { notes as enNotes } from './locales/en/notes'
import { assessments as enAssessments } from './locales/en/assessments'
import { assignments as enAssignments } from './locales/en/assignments'
import { grading as enGrading } from './locales/en/grading'
import { learn as enLearn } from './locales/en/learn'
import { learnWork as enLearnWork } from './locales/en/learnWork'
import { learnAccount as enLearnAccount } from './locales/en/learnAccount'
import { settings as enSettings } from './locales/en/settings'
import { invitations as enInvitations } from './locales/en/invitations'

import { common as msCommon } from './locales/ms/common'
import { nav as msNav } from './locales/ms/nav'
import { auth as msAuth } from './locales/ms/auth'
import { dashboard as msDashboard } from './locales/ms/dashboard'
import { courses as msCourses } from './locales/ms/courses'
import { modules as msModules } from './locales/ms/modules'
import { students as msStudents } from './locales/ms/students'
import { instructors as msInstructors } from './locales/ms/instructors'
import { payments as msPayments } from './locales/ms/payments'
import { pay as msPay } from './locales/ms/pay'
import { notes as msNotes } from './locales/ms/notes'
import { assessments as msAssessments } from './locales/ms/assessments'
import { assignments as msAssignments } from './locales/ms/assignments'
import { grading as msGrading } from './locales/ms/grading'
import { learn as msLearn } from './locales/ms/learn'
import { learnWork as msLearnWork } from './locales/ms/learnWork'
import { learnAccount as msLearnAccount } from './locales/ms/learnAccount'
import { settings as msSettings } from './locales/ms/settings'
import { invitations as msInvitations } from './locales/ms/invitations'

/** `en` is the source of truth: its keys define the contract. */
export const en = {
  ...enCommon,
  ...enNav,
  ...enAuth,
  ...enDashboard,
  ...enCourses,
  ...enModules,
  ...enStudents,
  ...enInstructors,
  ...enPayments,
  ...enPay,
  ...enNotes,
  ...enAssessments,
  ...enAssignments,
  ...enGrading,
  ...enLearn,
  ...enLearnWork,
  ...enLearnAccount,
  ...enSettings,
  ...enInvitations,
} as const

export type TKey = keyof typeof en

/**
 * Bases accepted by `tn()`. A `foo_other` key implies a `foo_one` sibling, so
 * the union is derived from the plural half.
 *
 * The indirection through a generic is load-bearing: a conditional type only
 * distributes over a *naked type parameter*. Written as
 * `TKey extends \`${infer B}_other\` ? B : never` it tests the whole union at
 * once, which never matches, and the result is silently `never`.
 */
type PluralBaseOf<K> = K extends `${infer Base}_other` ? Base : never

export type PluralBase = PluralBaseOf<TKey>

export const ms: Record<TKey, string> = {
  ...msCommon,
  ...msNav,
  ...msAuth,
  ...msDashboard,
  ...msCourses,
  ...msModules,
  ...msStudents,
  ...msInstructors,
  ...msPayments,
  ...msPay,
  ...msNotes,
  ...msAssessments,
  ...msAssignments,
  ...msGrading,
  ...msLearn,
  ...msLearnWork,
  ...msLearnAccount,
  ...msSettings,
  ...msInvitations,
}

export type Lang = 'en' | 'ms'

export const DICTS: Record<Lang, Record<TKey, string>> = { en, ms }
