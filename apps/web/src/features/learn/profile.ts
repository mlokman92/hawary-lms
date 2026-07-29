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
 * every academy — so this is deliberately not academy-scoped. SELECT is
 * `id = auth.uid() OR app.shares_academy(id)`; UPDATE is `id = auth.uid()` in
 * both USING and WITH CHECK, which is what makes the edit below safe to offer.
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

export function useUpdateMyProfile() {
  const qc = useQueryClient()
  const { user } = useAuth()
  const uid = user?.id ?? null
  return useMutation({
    mutationFn: async (patch: { full_name: string | null; phone: string | null }) => {
      // The message reaches the page's error line, so it is translated here —
      // `translate` rather than `t` because this is a plain function.
      if (!uid) throw new Error(translate('lacct.profile.not_signed_in'))
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
    },
  })
}
