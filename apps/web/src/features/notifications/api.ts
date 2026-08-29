import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Tables } from '@hawary/shared'
import { supabase } from '@/lib/supabase'

/**
 * The notification centre.
 *
 * A row is an EVENT, not a sentence: `kind` says what happened and `data`
 * carries the facts, so the words are rendered on this side and follow the
 * reader's language. See `NotificationItem` for the rendering.
 *
 * Scoped to the active academy, like everything else behind the switcher — a
 * trainer in two academies is two different people as far as their work goes.
 */
export type Notification = Tables<'notifications'>
export type NotificationKind = Notification['kind']

/** `data` for `appointment_booked`, written by `book_appointment`. */
export type AppointmentBookedData = {
  appointment_id: string
  /** Which side of the session the recipient is on. Decides the wording *and*
   *  where the row leads: a student goes to /learn/appointments, an instructor
   *  to /appointments/list — the register, not the diary, because the diary is
   *  one week and the session may not be in it. */
  role: 'student' | 'instructor'
  /** The other party, as they were named when it happened. */
  with_name: string | null
  starts_at: string
  ends_at: string
  /** The academy's zone at the time, so the row formats without a second query. */
  tz: string
}

/**
 * `data` for `appointment_reassigned`, written by `cancel_appointment` when
 * staff hand a session on. Same shape plus who it came from — the session did
 * not change, the teacher did, and that is the whole news.
 */
export type AppointmentMovedData = AppointmentBookedData & {
  from_name: string | null
}

/** How many rows the panel holds. Older ones are not paged to — see the doc. */
export const NOTIFICATION_LIMIT = 20

const listKey = (a: string | null) => ['notifications', a] as const
const countKey = (a: string | null) => ['notifications-unread', a] as const

/** A minute is short enough that the bell is not stale, long enough to be free. */
const POLL_MS = 60_000

export function useNotifications(academyId: string | null) {
  return useQuery({
    queryKey: listKey(academyId),
    enabled: !!academyId,
    refetchInterval: POLL_MS,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('academy_id', academyId!)
        .order('created_at', { ascending: false })
        .limit(NOTIFICATION_LIMIT)
      if (error) throw error
      return (data ?? []) as Notification[]
    },
  })
}

/**
 * The badge. A count, not the rows — the panel is closed most of the time, and
 * a `head: true` count is a cheaper thing to poll than twenty rows.
 */
export function useUnreadCount(academyId: string | null) {
  return useQuery({
    queryKey: countKey(academyId),
    enabled: !!academyId,
    refetchInterval: POLL_MS,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('academy_id', academyId!)
        .is('read_at', null)
      if (error) throw error
      return count ?? 0
    },
  })
}

function invalidate(
  qc: ReturnType<typeof useQueryClient>,
  academyId: string | null,
) {
  void qc.invalidateQueries({ queryKey: listKey(academyId) })
  void qc.invalidateQueries({ queryKey: countKey(academyId) })
}

/**
 * Marking read goes through an RPC because clients have no UPDATE on the table:
 * a policy of `user_id = auth.uid()` would also let a person rewrite their own
 * notification's `kind` and `data`. The RPC scopes to the caller inside the
 * statement, so an id lifted from somebody else's list changes nothing.
 */
export function useMarkNotificationsRead(academyId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) return 0
      const { data, error } = await supabase.rpc('mark_notifications_read', {
        _ids: ids,
      })
      if (error) throw error
      return (data as number) ?? 0
    },
    onSuccess: () => invalidate(qc, academyId),
  })
}

export function useMarkAllNotificationsRead(academyId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc(
        'mark_all_notifications_read',
        { _academy_id: academyId! },
      )
      if (error) throw error
      return (data as number) ?? 0
    },
    onSuccess: () => invalidate(qc, academyId),
  })
}
