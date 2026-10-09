import { useAcademy, type Membership } from '@/lib/academy'
import { IS_STUDENT_APP } from '@/lib/env'
import { useStudentAcademy } from '@/lib/studentAcademy'

/**
 * The academy a screen is standing in.
 *
 * The web app has two shells and so two contexts — `useAcademy()` for the
 * back-office, `useStudentAcademy()` for the learner tree — and anything
 * mounted in both has to be told which one it is in (docs/notifications.md,
 * "Which academy it is scoped to is a prop"). Here each BINARY is one shell,
 * so the answer is fixed at build time and shared screens can simply ask.
 */
export type Scope = {
  academyId: string | null
  active: Membership | null
  /** The memberships this app can switch between. */
  memberships: Membership[]
  setAcademyId: (id: string) => void
  isAdmin: boolean
  isDirector: boolean
  /** A Director who is also a system admin. A name, not a further gate. */
  isSystemAdmin: boolean
}

function useStudentScope(): Scope {
  const { academyId, active, memberships, setAcademyId } = useStudentAcademy()
  return {
    // `academyId` can briefly hold a stored id that is no longer valid; the
    // reconciled membership is the truth.
    academyId: active?.academyId ?? academyId,
    active,
    memberships,
    setAcademyId,
    isAdmin: false,
    isDirector: false,
    isSystemAdmin: false,
  }
}

function useStaffScope(): Scope {
  const { active, staffMemberships, setActiveAcademyId } = useAcademy()
  return {
    academyId: active?.academyId ?? null,
    active,
    memberships: staffMemberships,
    setAcademyId: setActiveAcademyId,
    isAdmin: active?.role === 'admin',
    isDirector: active?.isDirector === true,
    isSystemAdmin: active?.isSystemAdmin === true,
  }
}

/** Picked once, at module load, so the hook order never changes. */
export const useScope: () => Scope = IS_STUDENT_APP
  ? useStudentScope
  : useStaffScope
