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
  /** Created the academy — rendered as "Director". */
  is_creator: boolean
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
export type MemberTier = 'director' | 'admin' | 'trainer' | 'student'

export function memberTier(m: Pick<StaffMember, 'role' | 'is_creator'>): MemberTier {
  // A demoted founder is not still the Director: the badge has to track the
  // access the database would actually grant.
  if (m.is_creator && m.role === 'admin') return 'director'
  return m.role
}

export const TIER_META: Record<
  MemberTier,
  { labelKey: TKey; hintKey: TKey; variant: Variant }
> = {
  director: {
    labelKey: 'members.tier.director',
    hintKey: 'members.tier.director_hint',
    variant: 'default',
  },
  admin: {
    labelKey: 'members.tier.admin',
    hintKey: 'members.tier.admin_hint',
    variant: 'secondary',
  },
  trainer: {
    labelKey: 'members.tier.trainer',
    hintKey: 'members.tier.trainer_hint',
    variant: 'outline',
  },
  student: {
    labelKey: 'members.tier.student',
    hintKey: 'members.tier.student_hint',
    variant: 'outline',
  },
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
      const { data, error } = await supabase.rpc('list_academy_staff', {
        _academy_id: academyId!,
      })
      if (error) throw error
      return (data ?? []) as unknown as StaffMember[]
    },
  })
}

/** One member, read out of the roster the list already fetched. */
export function useStaffMember(academyId: string | null, userId?: string) {
  const query = useStaffMembers(academyId)
  return {
    ...query,
    data: userId
      ? (query.data ?? []).find((m) => m.user_id === userId)
      : undefined,
  }
}

/**
 * One person's membership, for surfaces that are not admin-only and so cannot
 * call the roster RPC — the student page, where a student's app access is now
 * managed (they are no longer listed under /members).
 *
 * Readable by any staff member: the `academy_members` SELECT policy is
 * `user_id = auth.uid() OR app.is_staff(academy_id)`. Writing it still needs an
 * admin, which the caller gates on.
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
 * Two steps because there is no single privileged entry point: the insert is
 * ordinary staff DML, and `link_instructor_account` is the only writer of
 * `instructors.user_id`. It preserves an `admin` role on purpose — that is what
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
