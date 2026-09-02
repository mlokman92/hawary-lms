import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import type { Enums, Tables } from '@hawary/shared'
import { supabase } from '@/lib/supabase'
import type { TKey } from '@/lib/i18n'
import type { Tone } from '@/lib/tone'
import { zonedDayStart, type Ymd } from './calendar'

export type BookingSettings = Tables<'academy_booking_settings'>
export type BookingHour = Tables<'booking_hours'>
export type TimeOff = Tables<'booking_time_off'>
export type Appointment = Tables<'appointments'>
export type AppointmentStatus = Enums<'appointment_status'>
export type AssignmentMode = Enums<'appointment_assignment'>

/** Slot lengths the DB check constraint accepts. Keep the two in step. */
export const SLOT_MINUTES = [15, 20, 30, 45, 60, 90, 120] as const

export const APPOINTMENT_STATUS: Record<
  AppointmentStatus,
  { labelKey: TKey; tone: Tone }
> = {
  booked: { labelKey: 'appt.status.booked', tone: 'info' },
  completed: { labelKey: 'appt.status.completed', tone: 'positive' },
  cancelled: { labelKey: 'appt.status.cancelled', tone: 'muted' },
  no_show: { labelKey: 'appt.status.no_show', tone: 'danger' },
}

/** An appointment as the staff calendar reads it. */
export type AppointmentRow = Appointment & {
  students: { id: string; full_name: string | null; student_no: string } | null
  instructors: { id: string; full_name: string | null } | null
}

/** One instructor as the "who can be booked" list needs them. */
export type BookableInstructor = {
  id: string
  full_name: string | null
  avatar_url: string | null
  status: Enums<'instructor_status'>
  is_bookable: boolean
}

export type SlotInstructor = {
  id: string
  full_name: string | null
  avatar_url: string | null
}

/**
 * A free slot. `instructors` is null under round robin on the learner side —
 * the server withholds it, so the client cannot accidentally reveal the rota.
 *
 * `capacity` is how many instructors are free at that time, and it is sent in
 * **both** modes: a count names nobody, so it survives the withholding that
 * nulls `instructors`, and it is what the student is actually choosing between
 * when picking a time.
 */
export type OpenSlot = {
  starts_at: string
  ends_at: string
  capacity: number
  instructors: SlotInstructor[] | null
}

export type BookingOptions = {
  is_open: boolean
  assignment_mode?: AssignmentMode
  slot_minutes?: number
  max_open_per_student?: number | null
  max_per_week_per_student?: number | null
  open_count?: number
  slots: OpenSlot[]
}

export type MyAppointment = {
  id: string
  starts_at: string
  ends_at: string
  status: AppointmentStatus
  note: string | null
  cancel_reason: string | null
  instructor: {
    id: string
    full_name: string | null
    avatar_url: string | null
    specialization: string | null
  }
}

export type BookResult = {
  id: string
  starts_at: string
  ends_at: string
  auto_assigned: boolean
  instructor: SlotInstructor
}

/**
 * What `cancel_appointment` came to. `reassigned` is the whole point: staff
 * cancelling means "I cannot take this", so the session usually survives with a
 * different instructor and is only really called off when nobody can cover.
 */
export type CancelResult = {
  id: string
  status: AppointmentStatus
  reassigned: boolean
  instructor?: SlotInstructor
}

/**
 * One recipient's outcome. `code` is why, when nothing was sent — and note that
 * `already_sent` and `is_actor` come back with `sent: true`, because both mean
 * the person is not owed an email, not that one failed.
 */
export type NoticeOutcome = {
  sent: boolean
  code?: 'no_email' | 'send_failed' | 'already_sent' | 'is_actor'
  id?: string | null
}

/**
 * What `send-appointment-notice` came to. `ok` is true only when BOTH parties
 * were reached; the two outcomes say which one was not, because an instructor
 * record with no address must not read as the student going untold.
 */
export type BookingNotice = {
  ok: boolean
  code?: 'email_not_configured'
  message?: string
  student?: NoticeOutcome
  instructor?: NoticeOutcome
}

/**
 * Which of the three things happened to the session. The same function sends
 * all three — see `supabase/functions/send-appointment-notice` — because the
 * only difference is the wording; the trust model is identical.
 */
export type NoticeEvent = 'booked' | 'cancelled' | 'reassigned'

/**
 * Tell both parties, without letting a mail failure look like the write
 * failing.
 *
 * Every caller of this is a *second* call after an RPC that has already
 * committed: the session is booked, cancelled or handed on the moment that
 * returns, and a provider outage must not undo it or appear to. So this
 * swallows everything and returns null — the row is the record of what
 * happened.
 *
 * The function is handed an appointment id and an event, and nothing else. It
 * re-reads both addresses itself; passing them from the browser would make an
 * email relay of it, and a student cannot read `instructors` in the first
 * place.
 */
async function sendNotice(
  appointmentId: string,
  event: NoticeEvent,
): Promise<BookingNotice | null> {
  const { data, error } = await supabase.functions.invoke<BookingNotice>(
    'send-appointment-notice',
    { body: { appointment_id: appointmentId, event, origin: window.location.origin } },
  )
  if (error) {
    console.error('appointment notice failed', event, appointmentId, error)
    return null
  }
  return data ?? null
}

const settingsKey = (a: string | null) => ['booking-settings', a] as const
const hoursKey = (a: string | null) => ['booking-hours', a] as const
const timeOffKey = (a: string | null) => ['booking-time-off', a] as const
const poolKey = (a: string | null) => ['booking-pool', a] as const
const calendarKey = (a: string | null, from: Ymd, to: Ymd) =>
  ['appointments', a, from, to] as const
const availabilityKey = (a: string | null, from: Ymd, to: Ymd) =>
  ['booking-availability', a, from, to] as const
const optionsKey = (a: string | null, from: Ymd, to: Ymd) =>
  ['booking-options', a, from, to] as const
const mineKey = (a: string | null) => ['my-appointments', a] as const
const upcomingCountKey = (a: string | null) =>
  ['appointments-upcoming-count', a] as const

/** Everything a booking write can invalidate, in one place. */
function invalidateBookings(
  qc: ReturnType<typeof useQueryClient>,
  academyId: string | null,
) {
  void qc.invalidateQueries({ queryKey: ['appointments', academyId] })
  void qc.invalidateQueries({ queryKey: ['booking-availability', academyId] })
  void qc.invalidateQueries({ queryKey: ['booking-options', academyId] })
  void qc.invalidateQueries({ queryKey: mineKey(academyId) })
  void qc.invalidateQueries({ queryKey: upcomingCountKey(academyId) })
}

// ---------------------------------------------------------------------------
// The academy's timezone
//
// Its own query rather than another column on the academy context: this is the
// only feature that needs it, and `academies` is readable by every member, so
// the learner tree can ask for it too.
// ---------------------------------------------------------------------------

export const DEFAULT_TZ = 'Asia/Kuala_Lumpur'

export function useAcademyTimezone(academyId: string | null) {
  return useQuery({
    queryKey: ['academy-timezone', academyId] as const,
    enabled: !!academyId,
    // A tenant's timezone is not something that changes while a tab is open.
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('academies')
        .select('timezone')
        .eq('id', academyId!)
        .maybeSingle()
      if (error) throw error
      return data?.timezone ?? DEFAULT_TZ
    },
  })
}

// ---------------------------------------------------------------------------
// Staff — the policy
// ---------------------------------------------------------------------------

export function useBookingSettings(academyId: string | null) {
  return useQuery({
    queryKey: settingsKey(academyId),
    enabled: !!academyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('academy_booking_settings')
        .select('*')
        .eq('academy_id', academyId!)
        .maybeSingle()
      if (error) throw error
      return data as BookingSettings | null
    },
  })
}

/** Upsert: no row until someone opens booking, and absent reads as closed. */
export function useSaveBookingSettings(academyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (patch: Partial<Omit<BookingSettings, 'academy_id'>>) => {
      const { data, error } = await supabase
        .from('academy_booking_settings')
        .upsert({ academy_id: academyId, ...patch }, { onConflict: 'academy_id' })
        .select()
        .single()
      if (error) throw error
      return data as BookingSettings
    },
    onSuccess: (row) => {
      qc.setQueryData(settingsKey(academyId), row)
      // Slot length, notice and horizon all change what is free.
      invalidateBookings(qc, academyId)
    },
  })
}

// ---------------------------------------------------------------------------
// Staff — weekly hours
// ---------------------------------------------------------------------------

export function useBookingHours(academyId: string | null) {
  return useQuery({
    queryKey: hoursKey(academyId),
    enabled: !!academyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('booking_hours')
        .select('*')
        .eq('academy_id', academyId!)
        .order('weekday')
        .order('start_time')
      if (error) throw error
      return (data ?? []) as BookingHour[]
    },
  })
}

export function useAddBookingHours(academyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      weekdays: number[]
      start_time: string
      end_time: string
    }) => {
      const { error } = await supabase.from('booking_hours').insert(
        input.weekdays.map((weekday) => ({
          academy_id: academyId,
          weekday,
          start_time: input.start_time,
          end_time: input.end_time,
        })),
      )
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: hoursKey(academyId) })
      invalidateBookings(qc, academyId)
    },
  })
}

export function useDeleteBookingHours(academyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('booking_hours').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: hoursKey(academyId) })
      invalidateBookings(qc, academyId)
    },
  })
}

// ---------------------------------------------------------------------------
// Staff — time off
// ---------------------------------------------------------------------------

export type TimeOffRow = TimeOff & {
  instructors: { id: string; full_name: string | null } | null
}

/** Only what is still ahead: a holiday that has passed is not a control. */
export function useTimeOff(academyId: string | null) {
  return useQuery({
    queryKey: timeOffKey(academyId),
    enabled: !!academyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('booking_time_off')
        .select('*, instructors(id, full_name)')
        .eq('academy_id', academyId!)
        .gte('ends_at', new Date().toISOString())
        .order('starts_at')
      if (error) throw error
      return (data ?? []) as unknown as TimeOffRow[]
    },
  })
}

export function useAddTimeOff(academyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      instructor_id: string | null
      starts_at: string
      ends_at: string
      reason: string | null
    }) => {
      const { error } = await supabase
        .from('booking_time_off')
        .insert({ academy_id: academyId, ...input })
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: timeOffKey(academyId) })
      invalidateBookings(qc, academyId)
    },
  })
}

export function useDeleteTimeOff(academyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('booking_time_off')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: timeOffKey(academyId) })
      invalidateBookings(qc, academyId)
    },
  })
}

// ---------------------------------------------------------------------------
// Staff — who is in the pool
// ---------------------------------------------------------------------------

export function useBookingPool(academyId: string | null) {
  return useQuery({
    queryKey: poolKey(academyId),
    enabled: !!academyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('instructors')
        .select('id, full_name, avatar_url, status, is_bookable')
        .eq('academy_id', academyId!)
        .is('archived_at', null)
        .order('full_name')
      if (error) throw error
      return (data ?? []) as BookableInstructor[]
    },
  })
}

/**
 * Optimistic: the row carries a switch, and a switch that waits for a round
 * trip before moving reads as broken. Same treatment as `useTogglePublished`.
 */
export function useSetInstructorBookable(academyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; is_bookable: boolean }) => {
      const { error } = await supabase
        .from('instructors')
        .update({ is_bookable: input.is_bookable })
        .eq('id', input.id)
      if (error) throw error
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: poolKey(academyId) })
      const previous = qc.getQueryData<BookableInstructor[]>(poolKey(academyId))
      qc.setQueryData<BookableInstructor[]>(poolKey(academyId), (rows) =>
        (rows ?? []).map((r) =>
          r.id === input.id ? { ...r, is_bookable: input.is_bookable } : r,
        ),
      )
      return { previous }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(poolKey(academyId), ctx.previous)
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: poolKey(academyId) })
      void qc.invalidateQueries({ queryKey: ['instructors', academyId] })
      invalidateBookings(qc, academyId)
    },
  })
}

// ---------------------------------------------------------------------------
// Staff — the calendar
// ---------------------------------------------------------------------------

/**
 * Every appointment overlapping the visible days.
 *
 * The window is built from the academy's own midnights, not the browser's, so
 * the first and last columns are not quietly clipped for a reader in another
 * zone. `to` is inclusive — it is the last day shown.
 */
export function useAcademyAppointments(
  academyId: string | null,
  tz: string,
  from: Ymd,
  to: Ymd,
) {
  return useQuery({
    queryKey: calendarKey(academyId, from, to),
    enabled: !!academyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('appointments')
        .select(
          '*, students(id, full_name, student_no), instructors(id, full_name)',
        )
        .eq('academy_id', academyId!)
        .gte('starts_at', zonedDayStart(from, tz).toISOString())
        .lt('starts_at', zonedDayStart(to, tz).toISOString())
        .order('starts_at')
      if (error) throw error
      return (data ?? []) as unknown as AppointmentRow[]
    },
  })
}

// ---------------------------------------------------------------------------
// The register — every session, not just the week on screen
// ---------------------------------------------------------------------------

/** How many rows a page of the register holds. */
export const APPOINTMENT_PAGE_SIZE = 50

/**
 * Which side of now to look at — and there is no third option.
 *
 * The register used to offer "Any date" as well, and that was the admin
 * default: the top of the list was whichever session happened to sort first
 * across all of history, so the one thing a register is opened for — what is
 * coming — was never on screen. Two views, and only two: what is still to
 * happen, and the **archive** of what already has.
 *
 * It decides the ORDER as well as the filter, and it has to: "upcoming, newest
 * first" would put next month before tomorrow. Soonest-first is the only useful
 * reading of a list you are about to act on; for the archive, most-recent-first
 * is.
 */
export type AppointmentWhen = 'upcoming' | 'archive'

export type AppointmentFilters = {
  /** '' means every status, including cancelled ones. */
  status: AppointmentStatus | ''
  /**
   * '' means every instructor the reader may see — which for a trainer is
   * already only her own, by RLS. Admin-only control.
   */
  instructorId: string
  /** Student name or record number. '' means no search. */
  search: string
  when: AppointmentWhen
}

const listPageKey = (
  a: string | null,
  f: AppointmentFilters,
  page: number,
) =>
  [
    'appointments',
    a,
    'register',
    f.status,
    f.instructorId,
    f.search,
    f.when,
    page,
  ] as const

/**
 * One page of every session the academy has ever held.
 *
 * The diary on `/appointments` answers "what does this week look like"; this
 * answers "find me that session". They cannot be the same query: the diary is
 * windowed to seven days and drops anything cancelled out of view, which is
 * exactly the row somebody is looking for when they come here.
 *
 * Paged on the server from the start rather than when it hurts. `/payments`
 * and `/payments/log` both had to be retrofitted after an academy passed 500
 * rows, and PostgREST silently caps a request at the project's max — a
 * register that stops at row 1000 without saying so is worse than a slow one.
 *
 * `id` is the final tie-break on every ordering: OFFSET paging over a
 * non-unique sort repeats one row and skips another, and sessions genuinely do
 * share a `starts_at` (a whole academy teaches the 10:00 slot at once).
 */
export function useAppointmentPage(
  academyId: string | null,
  filters: AppointmentFilters,
  page: number,
) {
  return useQuery({
    queryKey: listPageKey(academyId, filters, page),
    enabled: !!academyId,
    // Without this a page turn blanks the table through the empty state and
    // back, which reads as an error rather than as paging.
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const from = (page - 1) * APPOINTMENT_PAGE_SIZE
      const q = filters.search.trim()
      let query = supabase
        .from('appointments')
        .select(
          // `!inner` only when searching: an inner join would otherwise drop a
          // session whose student record was archived away underneath it, and
          // those are precisely the ones worth finding in a register.
          q
            ? '*, students!inner(id, full_name, student_no), instructors(id, full_name)'
            : '*, students(id, full_name, student_no), instructors(id, full_name)',
          { count: 'exact' },
        )
        .eq('academy_id', academyId!)

      if (filters.status) query = query.eq('status', filters.status)
      if (filters.instructorId)
        query = query.eq('instructor_id', filters.instructorId)
      // Read at query time, not memoised into the key: the boundary should move
      // with the clock, and a session that ends while you are looking at the
      // list belongs on the other side of it after the next refetch.
      //
      // The cut is `ends_at`, not `starts_at` — a lesson is still today's
      // lesson while it is being taught. Splitting on `starts_at` would drop a
      // 10:00–11:00 session into the archive at 10:00:01, and every live
      // appointment here is a full hour, so that is an hour of the day going
      // missing from the view somebody is working out of. Same reasoning as
      // `useMyUpcomingSessions` / `useMyUnclosedSessions`, which have always
      // split on `ends_at` for exactly this.
      const now = new Date().toISOString()
      query =
        filters.when === 'upcoming'
          ? query.gte('ends_at', now)
          : query.lt('ends_at', now)
      if (q) {
        // Scoped to the embedded resource: PostgREST cannot OR across a join,
        // so the search has to be expressed against `students` itself.
        query = query.or(
          `full_name.ilike.%${q}%,student_no.ilike.%${q}%`,
          { referencedTable: 'students' },
        )
      }

      // Nearest first when looking forward, most recent first in the archive.
      // Ordered on `starts_at` even though the split is on `ends_at`: what a
      // reader scans down is when each session begins.
      const ascending = filters.when === 'upcoming'
      const { data, error, count } = await query
        .order('starts_at', { ascending })
        .order('id', { ascending })
        .range(from, from + APPOINTMENT_PAGE_SIZE - 1)
      if (error) throw error
      return {
        rows: (data ?? []) as unknown as AppointmentRow[],
        total: count ?? 0,
      }
    },
  })
}

/** Free slots for the staff booking dialog. Always names the instructors. */
export function useAcademyAvailability(
  academyId: string | null,
  from: Ymd,
  to: Ymd,
  enabled = true,
) {
  return useQuery({
    queryKey: availabilityKey(academyId, from, to),
    enabled: !!academyId && enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_academy_availability', {
        _academy_id: academyId!,
        _from: from,
        _to: to,
      })
      if (error) throw error
      return ((data as unknown as { slots: OpenSlot[] } | null)?.slots ??
        []) as OpenSlot[]
    },
  })
}

/**
 * Just the sidebar's number: a count, not the rows.
 *
 * Its own query rather than a slice of useAcademyAppointments — that one is
 * scoped to the week being *looked at*, which is the wrong window (next week's
 * sessions still count) and is not loaded at all outside /appointments. Same
 * shape as usePendingEnrollmentCount: a head request, so no rows cross the
 * wire to render one integer on every back-office page.
 *
 * It counts what the reader may see, and that is now role-dependent by RLS —
 * the academy's booked future for an admin, her own for a trainer. No filter
 * here says so, and none should: the badge is meant to mean "sessions coming
 * up", and for a trainer her own sessions ARE the sessions coming up.
 */
export function useUpcomingAppointmentCount(academyId: string | null) {
  return useQuery({
    queryKey: upcomingCountKey(academyId),
    enabled: !!academyId,
    // The sidebar outlives every navigation, and students book while the tab
    // sits open — coming back to the window is when this has to be right.
    staleTime: 0,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('appointments')
        .select('id', { count: 'exact', head: true })
        .eq('academy_id', academyId!)
        .eq('status', 'booked')
        // Strictly ahead of now: a session that has started is no longer
        // upcoming, and one already marked done or cancelled is not booked.
        .gt('starts_at', new Date().toISOString())
      if (error) throw error
      return count ?? 0
    },
  })
}

/**
 * One instructor's own diary, for the trainer dashboard.
 *
 * `.eq('instructor_id', …)` is a DISPLAY narrowing that now agrees with the
 * boundary rather than standing in for it: `appointments: admin all, own
 * instructor, own student` is `app.is_admin OR app.owns_instructor OR
 * app.owns_student`, so for a trainer this filter is redundant and for an admin
 * who also teaches it is the whole point — it answers "mine", which is not the
 * same question as "allowed".
 *
 * `mine` sits inside the `['appointments', academyId]` prefix on purpose:
 * `invalidateBookings` sweeps by that prefix, so booking or cancelling from
 * anywhere refreshes this list with no extra wiring.
 *
 * The select shape matches `useAcademyAppointments` exactly so a row IS an
 * `AppointmentRow` and `AppointmentDialog` takes it unchanged.
 */
export function useMyUpcomingSessions(
  academyId: string | null,
  instructorId: string | null,
  days: number,
) {
  return useQuery({
    queryKey: ['appointments', academyId, 'mine-upcoming', instructorId, days] as const,
    enabled: !!academyId && !!instructorId,
    queryFn: async () => {
      const until = new Date(Date.now() + days * 86_400_000).toISOString()
      const { data, error } = await supabase
        .from('appointments')
        .select(
          '*, students(id, full_name, student_no), instructors(id, full_name)',
        )
        .eq('academy_id', academyId!)
        .eq('instructor_id', instructorId!)
        .eq('status', 'booked')
        // `ends_at`, not `starts_at`: a lesson is still today's lesson while it
        // is being taught. Splitting on starts_at would drop a 10:00–11:00
        // session out of the diary at 10:00:01 — and every live appointment is
        // a full hour, so that is an hour of the day going missing.
        .gte('ends_at', new Date().toISOString())
        // The horizon stays on starts_at: it bounds how far ahead we look.
        .lt('starts_at', until)
        .order('starts_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as unknown as AppointmentRow[]
    },
  })
}

/**
 * Sessions that have already happened and are still marked `booked` — nobody
 * said whether the student turned up.
 *
 * This is the one thing on the dashboard that is genuinely waiting on the
 * trainer, and the dashboard is the best place for it to surface: /appointments
 * is a week grid, so a session that was never closed disappears from view the
 * moment the week turns over while staying open forever. The register's archive
 * holds it too — filter to Archive + Booked — but that is somewhere you go to
 * look, and this is something that has to come and find you.
 */
export function useMyUnclosedSessions(
  academyId: string | null,
  instructorId: string | null,
) {
  return useQuery({
    queryKey: ['appointments', academyId, 'mine-unclosed', instructorId] as const,
    enabled: !!academyId && !!instructorId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('appointments')
        .select(
          '*, students(id, full_name, student_no), instructors(id, full_name)',
        )
        .eq('academy_id', academyId!)
        .eq('instructor_id', instructorId!)
        .eq('status', 'booked')
        // The exact complement of `useMyUpcomingSessions` — also on `ends_at`,
        // so a session in progress is never listed as one nobody closed off.
        .lt('ends_at', new Date().toISOString())
        // Most recently missed first: that is the one still fresh enough to
        // remember whether they showed up.
        .order('starts_at', { ascending: false })
        .limit(5)
      if (error) throw error
      return (data ?? []) as unknown as AppointmentRow[]
    },
  })
}

/**
 * Mark completed / no-show. A plain UPDATE, the same reasoning that keeps
 * enrollment approval an UPDATE: the `appointments: staff update` policy
 * already grants exactly this, so an RPC would add nothing.
 */
export function useSetAppointmentStatus(academyId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; status: AppointmentStatus }) => {
      const { error } = await supabase
        .from('appointments')
        .update({ status: input.status })
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: () => invalidateBookings(qc, academyId),
  })
}

// ---------------------------------------------------------------------------
// Booking and cancelling — both surfaces, both RPCs
// ---------------------------------------------------------------------------

/**
 * `studentId` set means staff booking on somebody's behalf; the server rejects
 * it from anybody who is not staff. `instructorId` is ignored by the server
 * under round robin unless the caller is staff.
 *
 * Then both parties are told — see `sendNotice` for why that is a second call
 * whose failure is reported on the result rather than thrown.
 */
export function useBookAppointment(academyId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      startsAt: string
      instructorId?: string | null
      note?: string | null
      studentId?: string | null
    }): Promise<BookResult & { notice: BookingNotice | null }> => {
      const { data, error } = await supabase.rpc('book_appointment', {
        _academy_id: academyId!,
        _starts_at: input.startsAt,
        _instructor_id: input.instructorId ?? undefined,
        _note: input.note ?? undefined,
        _student_id: input.studentId ?? undefined,
      })
      if (error) throw error
      const booking = data as unknown as BookResult

      // Not thrown and not surfaced: the session is booked either way. The row
      // is the record of what happened — notice_sent_at with a null receipt is
      // the one state worth a query.
      return { ...booking, notice: await sendNotice(booking.id, 'booked') }
    },
    onSuccess: () => invalidateBookings(qc, academyId),
  })
}

/**
 * Cancelling, which means two different things depending on who asks.
 *
 * For a student it calls the session off — they do not want it. For an admin or
 * the session's own instructor it means "I cannot take this one", so the server
 * hands the session to whoever can cover and only cancels when nobody can.
 * Which of the two happened is in the result, and the caller has to say so:
 * "cancelled" on screen when the session is actually still going ahead with
 * somebody else would be a lie.
 *
 * Which is also why the email is chosen from the RESULT and not from the
 * button: about half of what staff cancel is covered, and mailing a student
 * "your session is cancelled" when it is going ahead an hour later with
 * somebody else is the one message worse than sending nothing. The server
 * decides who hears it — whoever clicked is skipped, the same rule the in-app
 * notification follows.
 */
export function useCancelAppointment(academyId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; reason?: string | null }) => {
      const { data, error } = await supabase.rpc('cancel_appointment', {
        _id: input.id,
        _reason: input.reason ?? undefined,
      })
      if (error) throw error
      const result = data as unknown as CancelResult
      await sendNotice(result.id, result.reassigned ? 'reassigned' : 'cancelled')
      return result
    },
    onSuccess: () => invalidateBookings(qc, academyId),
  })
}

// ---------------------------------------------------------------------------
// Learner
// ---------------------------------------------------------------------------

export function useBookingOptions(
  academyId: string | null,
  from: Ymd,
  to: Ymd,
) {
  return useQuery({
    queryKey: optionsKey(academyId, from, to),
    enabled: !!academyId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_booking_options', {
        _academy_id: academyId!,
        _from: from,
        _to: to,
      })
      if (error) throw error
      return data as unknown as BookingOptions
    },
  })
}

export function useMyAppointments(academyId: string | null) {
  return useQuery({
    queryKey: mineKey(academyId),
    enabled: !!academyId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_appointments', {
        _academy_id: academyId!,
      })
      if (error) throw error
      return (data as unknown as MyAppointment[]) ?? []
    },
  })
}
