import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useAcademy, type Membership } from './academy'
import { readLearnAcademyId, writeLearnAcademyId } from './activeAcademy'

type StudentAcademyValue = {
  /** The caller's student-role memberships. */
  memberships: Membership[]
  academyId: string | null
  setAcademyId: (id: string) => void
  active: Membership | null
}

const Ctx = createContext<StudentAcademyValue | undefined>(undefined)

/**
 * Active academy for the learner tree, deliberately parallel to (not derived
 * from) the back-office one in lib/academy.tsx.
 *
 * Two reasons it cannot reuse that state: `active` there is computed from
 * staffMemberships only, and its reconciliation effect early-returns when there
 * are no staff memberships — so for a student it would stay null forever, or
 * worse, hold a stale id from a tenant they used to be staff of.
 */
export function StudentAcademyProvider({ children }: { children: ReactNode }) {
  const { studentMemberships } = useAcademy()
  const [academyId, setId] = useState<string | null>(readLearnAcademyId)

  const setAcademyId = useCallback((id: string) => {
    writeLearnAcademyId(id)
    setId(id)
  }, [])

  // Keep the selection pointing at a tenant the user actually studies in.
  useEffect(() => {
    if (studentMemberships.length === 0) return
    const valid = studentMemberships.some((m) => m.academyId === academyId)
    if (!valid) setAcademyId(studentMemberships[0].academyId)
  }, [studentMemberships, academyId, setAcademyId])

  const value = useMemo<StudentAcademyValue>(
    () => ({
      memberships: studentMemberships,
      academyId,
      setAcademyId,
      active:
        studentMemberships.find((m) => m.academyId === academyId) ??
        studentMemberships[0] ??
        null,
    }),
    [studentMemberships, academyId, setAcademyId],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useStudentAcademy(): StudentAcademyValue {
  const ctx = useContext(Ctx)
  if (!ctx)
    throw new Error('useStudentAcademy must be used within <StudentAcademyProvider>')
  return ctx
}
