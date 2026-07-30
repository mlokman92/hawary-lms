import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Tables } from '@hawary/shared'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { translate } from '@/lib/i18n'

export type Profile = Tables<'profiles'>

/**
 * The signed-in user's own profile row.
 *
 * `profiles` is global identity, not tenant data — one row per email across
 * every academy — so this is deliberately not academy-scoped, and it is shared
 * by both shells: the learner's `/learn/profile` and the staff `/profile` edit
 * exactly the same row. SELECT is `id = auth.uid() OR app.shares_academy(id)`;
 * UPDATE is `id = auth.uid()` in both USING and WITH CHECK, which is what makes
 * the edit below safe to offer.
 */
export function useMyProfile() {
  const { user } = useAuth()
  const uid = user?.id ?? null
  return useQuery({
    queryKey: ['my-profile', uid] as const,
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', uid!)
        .maybeSingle()
      if (error) throw error
      return data as Profile | null
    },
  })
}

/**
 * Am I also an instructor in this academy?
 *
 * The teaching hat is a linked `instructors` row, not a role, so it has to be
 * looked up separately — and it is readable here because staff may select the
 * instructors of their own academy.
 */
export function useMyInstructorRecord(academyId: string | null) {
  const { user } = useAuth()
  const uid = user?.id ?? null
  return useQuery({
    queryKey: ['my-instructor', academyId, uid] as const,
    enabled: !!academyId && !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('instructors')
        .select('id, full_name, instructor_no, status')
        .eq('academy_id', academyId!)
        .eq('user_id', uid!)
        .is('archived_at', null)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })
}

/**
 * `avatar_url` is optional because only staff can set one: every
 * storage.objects write policy is `app.is_staff`, so the learner page offers no
 * upload control and simply never sends the field.
 */
export type ProfilePatch = {
  full_name: string | null
  phone: string | null
  avatar_url?: string | null
}

export function useUpdateMyProfile() {
  const qc = useQueryClient()
  const { user } = useAuth()
  const uid = user?.id ?? null
  return useMutation({
    mutationFn: async (patch: ProfilePatch) => {
      // The message reaches the page's error line, so it is translated here —
      // `translate` rather than `t` because this is a plain function.
      if (!uid) throw new Error(translate('profile.not_signed_in'))
      const { data, error } = await supabase
        .from('profiles')
        .update(patch)
        .eq('id', uid)
        .select()
        .single()
      if (error) throw error
      return data as Profile
    },
    onSuccess: (row) => {
      qc.setQueryData(['my-profile', uid], row)
      // The sidebar footer and the members roster both render this person.
      qc.invalidateQueries({ queryKey: ['staff-members'] })
    },
  })
}
