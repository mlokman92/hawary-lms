import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Tables } from '@hawary/shared'
import { supabase } from '@/lib/supabase'
import { rpcPending } from '@/lib/rpcPending'

/**
 * Announcements: one message from the academy, or from one course, to its
 * students. Staff post; students read. Clients have no DML on the table — a
 * post has to notify its recipients in the same statement, so it is an RPC.
 */
export type Announcement = Tables<'announcements'> & {
  course: { id: string; title: string } | null
}

const key = (academyId: string | null) => ['announcements', academyId] as const

/**
 * RLS decides what comes back: staff see every announcement in the academy; a
 * student sees the academy-wide ones and those of courses they are enrolled in.
 */
export function useAnnouncements(academyId: string | null) {
  return useQuery({
    queryKey: key(academyId),
    enabled: !!academyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('announcements')
        .select('*, course:courses(id, title)')
        .eq('academy_id', academyId!)
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return (data ?? []) as unknown as Announcement[]
    },
  })
}

export function usePostAnnouncement(academyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      courseId: string | null
      title: string
      body: string
    }) => {
      const { data, error } = await supabase.rpc('post_announcement', {
        _academy_id: academyId,
        // Null addresses the whole academy; the generated type calls it a
        // string because Postgres does not mark function arguments nullable.
        _course_id: input.courseId as unknown as string,
        _title: input.title,
        _body: input.body,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key(academyId) }),
  })
}

export function useDeleteAnnouncement(academyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => rpcPending('delete_announcement', { _id: id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(academyId) }),
  })
}
