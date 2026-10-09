import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Enums, Tables } from '@hawary/shared'
import { supabase } from '@/lib/supabase'
import { translate, type TKey } from '@/lib/i18n'

/** Same four the other `status.ts` maps use — kept local, as they are. */
type Variant = 'default' | 'secondary' | 'outline' | 'destructive'

export type MemberStatus = Enums<'member_status'>
export type MemberRole = Tables<'academy_members'>['role']

/**
 * One row of the staff roster.
 *
 * Hand-written rather than derived from the generated `Returns` type: Supabase
 * types every `returns table (...)` column as non-null, and half of these are
 * genuinely null (a member with no profile row, no phone, no instructor
 * record). Taking the generated shape would push those nulls into the UI
 * unannounced.
 */
export type StaffMember = {
  user_id: string
  role: MemberRole
  status: MemberStatus
  joined_at: string
  full_name: string | null
  email: string | null
  phone: string | null
  avatar_url: string | null
  /**
   * Director (`academy_members.is_director` on an admin row): grants and
   * revokes staff access, and owns the gateway and billing settings.
   */
  is_director: boolean
  /** A Director who is also a system admin. Merged in by `useStaffMembers`. */
  is_system_admin?: boolean
  instructor_id: string | null
  instructor_no: string | null
  instructor_status: Enums<'instructor_status'> | null
  courses_taught: number
  /**
   * Staff are usually instructors, but someone enrolled as a student and later
   * made a trainer keeps their student record — and that is then the only
   * profile page they have.
   */
  student_id: string | null
  student_no: string | null
}

/**
 * Where a member's row leads: their instructor record, else their student
 * record, else nowhere. A member with neither has no profile page to open —
 * give them an instructor record first.
 */
export function memberRecordPath(m: StaffMember): string | null {
  if (m.instructor_id) return `/instructors/${m.instructor_id}`
  if (m.student_id) return `/students/${m.student_id}`
  return null
}

/**
 * What a member's row says they are.
 *
 * Access level and teaching are two independent axes, which is the whole point:
 * `role` is what the database enforces (58 policies read it through
 * `app.is_staff`/`app.is_admin`), while "instructor" is a linked `instructors`
 * record. Keeping them apart is what lets one account be Director *and*
 * instructor without touching the role enum.
 */
export type MemberTier =
  | 'system_admin'
  | 'director'
  | 'admin'
  | 'trainer'
  | 'student'

export function memberTier(
  m: Pick<StaffMember, 'role' | 'is_director' | 'is_system_admin'>,
): MemberTier {
  // `app.is_director` needs an admin row too, so a demoted Director is not
  // still badged as one: the badge tracks the access the database grants.
  if (m.is_director && m.role === 'admin') {
    // A system admin is a Director first; the flag only renames the badge.
    return m.is_system_admin ? 'system_admin' : 'director'
  }
  return m.role
}

export const TIER_META: Record<MemberTier, { labelKey: TKey; variant: Variant }> = {
  system_admin: { labelKey: 'members.tier.system_admin', variant: 'default' },
  director: { labelKey: 'members.tier.director', variant: 'default' },
  admin: { labelKey: 'members.tier.admin', variant: 'secondary' },
  trainer: { labelKey: 'members.tier.trainer', variant: 'outline' },
  student: { labelKey: 'members.tier.student', variant: 'outline' },
}

export const MEMBER_STATUS_META: Record<
  MemberStatus,
  { labelKey: TKey; variant: Variant }
> = {
  active: { labelKey: 'members.status.active', variant: 'secondary' },
  invited: { labelKey: 'members.status.invited', variant: 'outline' },
  suspended: { labelKey: 'members.status.suspended', variant: 'destructive' },
}

const membersKey = (academyId: string | null) =>
  ['staff-members', academyId] as const

/**
 * The staff roster: admins and trainers only.
 *
 * Goes through an RPC rather than selecting `academy_members` because the two
 * things this page most needs — the account's email and whether they also hold
 * an instructor record — are not reachable from a client select. Email lives in
 * `auth.users`; see the migration for why it is not mirrored onto `profiles`.
 */
export function useStaffMembers(academyId: string | null) {
  return useQuery({
    queryKey: membersKey(academyId),
    enabled: !!academyId,
    queryFn: async () => {
      // The RPC predates the system-admin flag and its column list cannot grow
      // without dropping it, so the flag is read beside it: staff may read
      // `academy_members`, and this is one short column of it.
      const [staff, flagged] = await Promise.all([
        supabase.rpc('list_academy_staff', { _academy_id: academyId! }),
        supabase
          .from('academy_members')
          .select('user_id')
          .eq('academy_id', academyId!)
          .eq('is_system_admin', true),
      ])
      if (staff.error) throw staff.error
      const systemAdmins = new Set((flagged.data ?? []).map((r) => r.user_id))
      return ((staff.data ?? []) as unknown as StaffMember[]).map((m) => ({
        ...m,
        is_system_admin: systemAdmins.has(m.user_id),
      }))
    },
  })
}

/**
 * One person's membership, for surfaces that are not admin-only and so cannot
 * call the roster RPC — the student page, where a student's app access is now
 * managed (they are no longer listed under /members).
 *
 * Readable by any staff member: the `academy_members` SELECT policy is
 * `user_id = auth.uid() OR app.is_staff(academy_id)`. Writing it needs an admin
 * for a student row and a Director for an admin or trainer row; the caller
 * gates on both.
 */
export function useMemberAccess(
  academyId: string | null,
  userId: string | null | undefined,
) {
  return useQuery({
    queryKey: ['member-access', academyId, userId] as const,
    enabled: !!academyId && !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('academy_members')
        .select('user_id, role, status')
        .eq('academy_id', academyId!)
        .eq('user_id', userId!)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })
}

export function useUpdateMember(academyId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      userId,
      patch,
    }: {
      userId: string
      patch: Partial<Pick<Tables<'academy_members'>, 'role' | 'status'>>
    }) => {
      const { data, error } = await supabase
        .from('academy_members')
        .update(patch)
        .eq('academy_id', academyId!)
        .eq('user_id', userId)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: membersKey(academyId) })
      qc.invalidateQueries({ queryKey: ['member-access', academyId] })
    },
  })
}

function invalidateMemberAndInstructors(
  qc: ReturnType<typeof useQueryClient>,
  academyId: string | null,
) {
  qc.invalidateQueries({ queryKey: membersKey(academyId) })
  qc.invalidateQueries({ queryKey: ['instructors', academyId] })
  qc.invalidateQueries({ queryKey: ['instructor'] })
}

/**
 * Give an existing member an instructor record, so they can be assigned courses
 * and graded against them while keeping the access level they already have.
 *
 * Two steps because there is no single privileged entry point: the insert
 * (`instructors: director insert`) and `link_instructor_account`, the only
 * writer of `instructors.user_id`, are both Director-only and run as the
 * caller, so only a Director reaches this. It preserves an `admin` role on purpose — that is what
 * makes "admin *and* instructor" reachable at all.
 */
export function useMakeInstructor(academyId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (member: StaffMember) => {
      if (!member.email) {
        throw new Error(translate('members.instructor.needs_email'))
      }
      // instructor_no: '' triggers the DB to generate a unique 8-char code.
      const { data: created, error } = await supabase
        .from('instructors')
        .insert({
          academy_id: academyId!,
          instructor_no: '',
          full_name: member.full_name,
          email: member.email,
          phone: member.phone,
        })
        .select()
        .single()
      if (error) throw error

      const { error: linkError } = await supabase.rpc(
        'link_instructor_account',
        { _instructor_id: created.id, _email: member.email },
      )
      if (linkError) {
        // Roll the record back rather than leave an unlinked duplicate behind
        // for someone to find later and wonder about.
        await supabase.from('instructors').delete().eq('id', created.id)
        throw linkError
      }
      return created
    },
    onSuccess: () => invalidateMemberAndInstructors(qc, academyId),
  })
}

/** Point an instructor record the academy already keyed in at this account. */
export function useAttachInstructor(academyId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      instructorId,
      email,
    }: {
      instructorId: string
      email: string
    }) => {
      const { data, error } = await supabase.rpc('link_instructor_account', {
        _instructor_id: instructorId,
        _email: email,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => invalidateMemberAndInstructors(qc, academyId),
  })
}

/**
 * Detach the instructor record. The record itself survives (it carries the
 * course assignments and grading history) and the membership is untouched —
 * this removes the teaching hat, not the account.
 */
export function useUnlinkInstructor(academyId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (instructorId: string) => {
      const { data, error } = await supabase.rpc('unlink_instructor_account', {
        _instructor_id: instructorId,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => invalidateMemberAndInstructors(qc, academyId),
  })
}
