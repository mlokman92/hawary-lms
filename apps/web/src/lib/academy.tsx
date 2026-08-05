import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
  /**
   * This user created the academy. Surfaced as "Director" — a name for the
   * founder, not a fourth role: the permissions are an admin's, and
   * `academies.created_by` is the only thing that distinguishes them.
   */
  isCreator: boolean
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
  academies: {
    id: string
    name: string
    slug: string
    created_by: string | null
  } | null
}

export function AcademyProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [loading, setLoading] = useState(true)
  const [activeAcademyId, setActive] = useState<string | null>(
    readActiveAcademyId,
  )

  /**
   * Depend on the id, not the `user` object. supabase-js re-emits the auth
   * state on every tab focus — it re-reads the session from storage, so `user`
   * is a fresh object identity even when nothing changed. Keying on the id (the
   * only thing this query needs) keeps `refresh` stable, so the effect below
   * fires on sign-in and sign-out and nowhere else.
   */
  const userId = user?.id ?? null

  /**
   * Which user `memberships` is already resolved for. `loading` gates a
   * full-page spinner in AppShell/StudentShell, and that spinner *unmounts*
   * every routed page beneath them — so it has to mean "nothing trustworthy to
   * render yet", never "a fetch is in flight". Keyed on the id rather than a
   * bare boolean so switching accounts still blocks: the memberships in hand
   * are then the wrong person's.
   */
  const resolvedFor = useRef<string | null>(null)
  /** Ticket for the in-flight fetch, so a superseded response can't land. */
  const seq = useRef(0)

  const refresh = useCallback(async () => {
    const ticket = ++seq.current
    if (!userId) {
      resolvedFor.current = null
      setMemberships([])
      setLoading(false)
      return
    }
    if (resolvedFor.current !== userId) setLoading(true)
    const { data, error } = await supabase
      .from('academy_members')
      .select('academy_id, role, academies(id, name, slug, created_by)')
      .eq('user_id', userId)
      .eq('status', 'active')

    // Signed out, or a newer refresh overtook this one, while we were awaiting.
    // Bailing here stops the previous account's academies repopulating.
    if (ticket !== seq.current) return

    if (error) {
      setMemberships([])
    } else {
      const rows = (data ?? []) as unknown as MemberRow[]
      setMemberships(
        rows.map((r) => ({
          academyId: r.academy_id,
          role: r.role,
          academy: r.academies,
          isCreator: !!r.academies?.created_by && r.academies.created_by === userId,
        })),
      )
    }
    resolvedFor.current = userId
    setLoading(false)
  }, [userId])

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
