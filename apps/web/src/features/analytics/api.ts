import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAcademy } from '@/lib/academy'
import { useAuth } from '@/lib/auth'

/**
 * One month of student logins, as `login_analytics` returns it.
 *
 * Students only — staff are in the LMS as part of the job. A login is a
 * sign-in, or a return on a device that was still signed in — see
 * docs/analytics.md. Days and months are the academy's calendar, decided by the
 * database, so nothing here converts a timestamp.
 *
 * Hand-written because the RPC returns `json`, which the generated types can
 * only call `Json`.
 */
export type LoginAnalytics = {
  /** The month these figures are for, 'YYYY-MM'. */
  month: string
  /** Every month there is anything to show, newest first. The first is now. */
  months: string[]
  /** Different students who logged in during the month. */
  active_users: number
  /** Logins during the month: the bars, added up. */
  logins: number
  /** One entry per calendar day of the month, empty days included. */
  days: { day: string; logins: number }[]
}

/**
 * One student account and when it was last seen.
 *
 * Hand-written for the reason `StaffMember` is: Supabase types every
 * `returns table (...)` column as non-null, and most of these can be null.
 * `student_id` is null for a student membership whose record was archived.
 */
export type UserLogin = {
  user_id: string
  full_name: string | null
  email: string | null
  last_login_at: string | null
  student_id: string | null
}

/**
 * Whether this account may open `/analytics`: a Director, or the one account
 * `app.can_view_analytics` names. A Director is known from the membership
 * already in hand, so only everybody else costs a request — and the answer
 * decides what to show, not what can be read; both RPCs below check again.
 */
export function useAnalyticsAccess() {
  const { user } = useAuth()
  const { active, activeAcademyId, loading } = useAcademy()
  const isDirector = !!active?.isDirector
  const ask = !!user && !!activeAcademyId && !isDirector

  const { data, isLoading } = useQuery({
    // Keyed on the account too: the cache outlives a sign-out, and the next
    // person at this browser must not inherit the last one's answer.
    queryKey: ['analytics-access', activeAcademyId, user?.id] as const,
    enabled: ask,
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('can_view_analytics', {
        _academy_id: activeAcademyId!,
      })
      if (error) throw error
      return data === true
    },
  })

  return {
    allowed: isDirector || data === true,
    loading: loading || (ask && isLoading),
  }
}

/**
 * `month` is 'YYYY-MM'; null asks for the current month. `courseId` narrows to
 * the students enrolled on one course; null is every course.
 */
export function useLoginAnalytics(
  academyId: string | null,
  month: string | null,
  courseId: string | null,
) {
  return useQuery({
    queryKey: ['login-analytics', academyId, month, courseId] as const,
    enabled: !!academyId,
    // Hold the month on screen while the next one loads, but never another
    // branch's figures under this branch's name.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === academyId ? previous : undefined,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('login_analytics', {
        _academy_id: academyId!,
        ...(month ? { _month: month } : {}),
        ...(courseId ? { _course_id: courseId } : {}),
      })
      if (error) throw error
      return data as unknown as LoginAnalytics
    },
  })
}

/** Every student account in the academy, most recently seen first. */
export function useUserLogins(
  academyId: string | null,
  courseId: string | null,
) {
  return useQuery({
    queryKey: ['user-logins', academyId, courseId] as const,
    enabled: !!academyId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_user_logins', {
        _academy_id: academyId!,
        ...(courseId ? { _course_id: courseId } : {}),
      })
      if (error) throw error
      return (data ?? []) as unknown as UserLogin[]
    },
  })
}
