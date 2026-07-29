import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { supabase } from './supabase'
import { useAuth } from './auth'
import { readActiveAcademyId, writeActiveAcademyId } from './activeAcademy'

export type Role = 'admin' | 'trainer' | 'student'

export type Membership = {
  academyId: string
  role: Role
  academy: { id: string; name: string; slug: string } | null
}

type AcademyContextValue = {
  memberships: Membership[]
  /** admin/trainer memberships — the web back-office operates on these. */
  staffMemberships: Membership[]
  /** student-role memberships — serviced by the (future) mobile student app. */
  studentMemberships: Membership[]
  loading: boolean
  activeAcademyId: string | null
  setActiveAcademyId: (id: string) => void
  /** The active STAFF membership (the back-office is staff-only). */
  active: Membership | null
  refresh: () => Promise<void>
}

const isStaffRole = (r: Role) => r === 'admin' || r === 'trainer'

const AcademyContext = createContext<AcademyContextValue | undefined>(undefined)

// Shape of the PostgREST embed; cast the query result to this.
type MemberRow = {
  academy_id: string
  role: Role
  academies: { id: string; name: string; slug: string } | null
}

export function AcademyProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [loading, setLoading] = useState(true)
  const [activeAcademyId, setActive] = useState<string | null>(
    readActiveAcademyId,
  )

  const refresh = useCallback(async () => {
    if (!user) {
      setMemberships([])
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error } = await supabase
      .from('academy_members')
      .select('academy_id, role, academies(id, name, slug)')
      .eq('user_id', user.id)
      .eq('status', 'active')

    if (error) {
      setMemberships([])
    } else {
      const rows = (data ?? []) as unknown as MemberRow[]
      setMemberships(
        rows.map((r) => ({
          academyId: r.academy_id,
          role: r.role,
          academy: r.academies,
        })),
      )
    }
    setLoading(false)
  }, [user])

  useEffect(() => {
    if (authLoading) return
    void refresh()
  }, [authLoading, refresh])

  const setActiveAcademyId = useCallback((id: string) => {
    writeActiveAcademyId(id)
    setActive(id)
  }, [])

  const staffMemberships = useMemo(
    () => memberships.filter((m) => isStaffRole(m.role)),
    [memberships],
  )
  const studentMemberships = useMemo(
    () => memberships.filter((m) => !isStaffRole(m.role)),
    [memberships],
  )

  // Keep the active academy valid and STAFF-scoped: the back-office must never
  // point at an academy where the user is only a student (RLS would blank it).
  useEffect(() => {
    if (staffMemberships.length === 0) return
    const stillValid = staffMemberships.some(
      (m) => m.academyId === activeAcademyId,
    )
    if (!stillValid) setActiveAcademyId(staffMemberships[0].academyId)
  }, [staffMemberships, activeAcademyId, setActiveAcademyId])

  const value = useMemo<AcademyContextValue>(() => {
    const active =
      staffMemberships.find((m) => m.academyId === activeAcademyId) ??
      staffMemberships[0] ??
      null
    return {
      memberships,
      staffMemberships,
      studentMemberships,
      loading,
      activeAcademyId,
      setActiveAcademyId,
      active,
      refresh,
    }
  }, [
    memberships,
    staffMemberships,
    studentMemberships,
    loading,
    activeAcademyId,
    setActiveAcademyId,
    refresh,
  ])

  return <AcademyContext.Provider value={value}>{children}</AcademyContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAcademy(): AcademyContextValue {
  const ctx = useContext(AcademyContext)
  if (!ctx) throw new Error('useAcademy must be used within <AcademyProvider>')
  return ctx
}
