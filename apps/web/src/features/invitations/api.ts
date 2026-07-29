import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Tables } from '@hawary/shared'
import { supabase } from '@/lib/supabase'

export type Invitation = Tables<'academy_invitations'>

export type InvitationRow = Invitation & {
  students: { id: string; full_name: string | null } | null
  instructors: { id: string; full_name: string | null } | null
}

const key = (academyId: string | null) => ['invitations', academyId] as const

/**
 * Pending / expired invitations for an academy.
 *
 * There is no client write path to this table any more — DML was revoked and
 * the staff update/delete policies dropped, because an unrestricted UPDATE let
 * a trainer rewrite an invitation's `role` to 'admin' and accept it. Mutations
 * go through revoke_invitation / resend_invitation, which touch only status,
 * token and expires_at.
 */
export function useInvitations(academyId: string | null) {
  return useQuery({
    queryKey: key(academyId),
    enabled: !!academyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('academy_invitations')
        .select('*, students(id, full_name), instructors(id, full_name)')
        .eq('academy_id', academyId!)
        .in('status', ['pending', 'expired'])
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as InvitationRow[]
    },
  })
}

export function useRevokeInvitation(academyId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('revoke_invitation', {
        _invitation_id: id,
      })
      if (error) throw error
      return id
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key(academyId) }),
  })
}

/**
 * Re-issues the SAME invitation with a fresh token. Deliberately not
 * create_invitation: that revokes the prior pending invite first, so using it
 * to "resend" silently kills the link already in the invitee's inbox.
 */
export function useResendInvitation(academyId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc('resend_invitation', {
        _invitation_id: id,
      })
      if (error) throw error
      return data as unknown as { id: string; token: string }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key(academyId) }),
  })
}

/**
 * Link an existing account to a student/instructor record without an email
 * round trip. accept_invitation is otherwise the only writer of
 * students.user_id / instructors.user_id, which makes the whole learner and
 * grading surface untestable until transactional email is configured — and
 * leaves no repair path when a link is wrong.
 */
export function useLinkStudentAccount(academyId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ studentId, email }: { studentId: string; email: string }) => {
      const { data, error } = await supabase.rpc('link_student_account', {
        _student_id: studentId,
        _email: email,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['students', academyId] })
      qc.invalidateQueries({ queryKey: ['student'] })
    },
  })
}

export function useLinkInstructorAccount(academyId: string | null) {
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['instructors', academyId] })
      qc.invalidateQueries({ queryKey: ['instructor'] })
    },
  })
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

export type MemberRow = Tables<'academy_members'> & {
  profiles: { id: string; full_name: string | null; avatar_url: string | null } | null
}

export function useMembers(academyId: string | null) {
  return useQuery({
    queryKey: ['members', academyId] as const,
    enabled: !!academyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('academy_members')
        .select('*, profiles(id, full_name, avatar_url)')
        .eq('academy_id', academyId!)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as unknown as MemberRow[]
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members', academyId] }),
  })
}
