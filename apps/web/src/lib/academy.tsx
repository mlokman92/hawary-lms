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

export type Role = 'admin' | 'trainer' | 'student'

export type Membership = {
  academyId: string
  role: Role
  academy: { id: string; name: string; slug: string } | null
}

type AcademyContextValue = {
  memberships: Membership[]
  loading: boolean
  activeAcademyId: string | null
  setActiveAcademyId: (id: string) => void
  active: Membership | null
  refresh: () => Promise<void>
}

const AcademyContext = createContext<AcademyContextValue | undefined>(undefined)

const ACTIVE_KEY = 'hawary.activeAcademyId'

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
    () => localStorage.getItem(ACTIVE_KEY),
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
    localStorage.setItem(ACTIVE_KEY, id)
    setActive(id)
  }, [])

  // Keep the active academy valid: default to the first membership.
  useEffect(() => {
    if (memberships.length === 0) return
    const stillValid = memberships.some((m) => m.academyId === activeAcademyId)
    if (!stillValid) setActiveAcademyId(memberships[0].academyId)
  }, [memberships, activeAcademyId, setActiveAcademyId])

  const value = useMemo<AcademyContextValue>(() => {
    const active =
      memberships.find((m) => m.academyId === activeAcademyId) ??
      memberships[0] ??
      null
    return {
      memberships,
      loading,
      activeAcademyId,
      setActiveAcademyId,
      active,
      refresh,
    }
  }, [memberships, loading, activeAcademyId, setActiveAcademyId, refresh])

  return <AcademyContext.Provider value={value}>{children}</AcademyContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAcademy(): AcademyContextValue {
  const ctx = useContext(AcademyContext)
  if (!ctx) throw new Error('useAcademy must be used within <AcademyProvider>')
  return ctx
}
