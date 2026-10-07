import { kvGet, kvRemove, kvSet } from './kv'

/**
 * The active academy id, persisted so a relaunch lands in the same branch.
 * Same two keys as the web app's `lib/activeAcademy.ts`, and the same reason
 * they are separate: the staff surface and the learner surface must never
 * inherit each other's tenant.
 */
export const readActiveAcademyId = () => kvGet('hawary.activeAcademyId')
export const writeActiveAcademyId = (id: string) =>
  kvSet('hawary.activeAcademyId', id)
export const clearActiveAcademyId = () => kvRemove('hawary.activeAcademyId')

export const readLearnAcademyId = () => kvGet('hawary.learnAcademyId')
export const writeLearnAcademyId = (id: string) =>
  kvSet('hawary.learnAcademyId', id)
export const clearLearnAcademyId = () => kvRemove('hawary.learnAcademyId')
