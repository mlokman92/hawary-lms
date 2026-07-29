/**
 * The active academy id is persisted so a reload lands back in the same tenant.
 * It lives here — not in `academy.tsx` — so `auth.tsx` can clear it on sign-out
 * without importing the academy context (which imports auth: a cycle).
 *
 * Leaving it behind across a sign-out means the next account starts pointed at
 * the previous account's tenant until memberships load and correct it, which is
 * how a stale id reaches things keyed on it (storage paths, RLS checks).
 */
const ACTIVE_KEY = 'hawary.activeAcademyId'

export const readActiveAcademyId = () => localStorage.getItem(ACTIVE_KEY)

export const writeActiveAcademyId = (id: string) =>
  localStorage.setItem(ACTIVE_KEY, id)

export const clearActiveAcademyId = () => localStorage.removeItem(ACTIVE_KEY)

/**
 * The learner tree keeps its OWN active academy. Sharing ACTIVE_KEY with the
 * back-office would let a student surface inherit an academy the user is (or
 * was) staff of — a tenant they hold no student record in.
 */
const LEARN_KEY = 'hawary.learnAcademyId'

export const readLearnAcademyId = () => localStorage.getItem(LEARN_KEY)

export const writeLearnAcademyId = (id: string) =>
  localStorage.setItem(LEARN_KEY, id)

export const clearLearnAcademyId = () => localStorage.removeItem(LEARN_KEY)
