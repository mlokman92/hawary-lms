import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * The academy's letterhead — the subset of `academies` that an invoice or a
 * receipt prints.
 *
 * Only `name` is required, and it is already collected at sign-up (see
 * `pages/Onboarding.tsx`); the rest is optional and simply omitted from the
 * document when blank, so a PDF never shows an empty label.
 *
 * Readable by any member, not just staff: `academies: members can view` is
 * `app.is_member(id)`, so a learner generating their own invoice PDF from
 * `/learn/billing` resolves the same row under RLS. Writes stay admin-only
 * (`academies: admins can update`).
 */
export type AcademyProfile = {
  id: string
  name: string
  logo_url: string | null
  address: string | null
  phone: string | null
  sst_number: string | null
}

const COLUMNS = 'id, name, logo_url, address, phone, sst_number'

const profileKey = (academyId: string | null) =>
  ['academy-profile', academyId] as const

export function useAcademyProfile(academyId: string | null) {
  return useQuery({
    queryKey: profileKey(academyId),
    enabled: !!academyId,
    queryFn: () => fetchAcademyProfile(academyId!),
  })
}

/** Same read outside React — the PDF helpers need it on click, not on render. */
export async function fetchAcademyProfile(
  academyId: string,
): Promise<AcademyProfile | null> {
  const { data, error } = await supabase
    .from('academies')
    .select(COLUMNS)
    .eq('id', academyId)
    .maybeSingle()
  if (error) throw error
  return (data ?? null) as AcademyProfile | null
}

export type AcademyProfileInput = {
  name: string
  logoUrl: string
  address: string
  phone: string
  sstNumber: string
}

/** Blank inputs are stored as NULL, so "unset" has one representation. */
const orNull = (v: string) => {
  const trimmed = v.trim()
  return trimmed === '' ? null : trimmed
}

export function useUpdateAcademyProfile(academyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: AcademyProfileInput) => {
      const name = input.name.trim()
      if (!name) throw new Error('Academy name is required')
      const { data, error } = await supabase
        .from('academies')
        .update({
          name,
          logo_url: orNull(input.logoUrl),
          address: orNull(input.address),
          phone: orNull(input.phone),
          sst_number: orNull(input.sstNumber),
        })
        .eq('id', academyId)
        .select(COLUMNS)
        .single()
      if (error) throw error
      return data as AcademyProfile
    },
    onSuccess: (row) => {
      qc.setQueryData(profileKey(academyId), row)
      qc.invalidateQueries({ queryKey: profileKey(academyId) })
    },
  })
}
