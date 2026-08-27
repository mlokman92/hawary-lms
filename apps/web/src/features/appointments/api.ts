import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
 */
export type OpenSlot = {
  starts_at: string
  ends_at: string
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
 */
export function useBookAppointment(academyId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      startsAt: string
      instructorId?: string | null
      note?: string | null
      studentId?: string | null
    }) => {
      const { data, error } = await supabase.rpc('book_appointment', {
        _academy_id: academyId!,
        _starts_at: input.startsAt,
        _instructor_id: input.instructorId ?? undefined,
        _note: input.note ?? undefined,
        _student_id: input.studentId ?? undefined,
      })
      if (error) throw error
      return data as unknown as BookResult
    },
    onSuccess: () => invalidateBookings(qc, academyId),
  })
}

export function useCancelAppointment(academyId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; reason?: string | null }) => {
      const { error } = await supabase.rpc('cancel_appointment', {
        _id: input.id,
        _reason: input.reason ?? undefined,
      })
      if (error) throw error
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
