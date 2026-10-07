import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Json, Tables } from '@hawary/shared'
import { supabase } from '@/lib/supabase'
import { rpcPending } from '@/lib/rpcPending'
import {
  openPrivateFile,
  uploadPrivateFile,
  type UploadFile,
} from '@/lib/storage'

/**
 * Opening a private file. Not a query: the signed URL lives 60 seconds, so
 * caching one would mostly cache something already expired. `variables` tells
 * a list which row is spinning.
 */
export function useOpenFile() {
  return useMutation({
    mutationFn: ({
      kind,
      id,
    }: {
      kind: 'material' | 'report' | 'submission'
      id: string
    }) => openPrivateFile(kind, id),
  })
}

// ---------------------------------------------------------------------------
// Attachments on an assignment hand-in
// ---------------------------------------------------------------------------

export type SubmissionFile = Tables<'assignment_submission_files'>

const filesKey = (submissionId: string | null | undefined) =>
  ['submission-files', submissionId ?? ''] as const

/**
 * The files on one hand-in. RLS follows the submission, so the student whose
 * work it is and anyone who may grade it get the same list.
 *
 * `file_path` is not selected: the bucket is private and the path is of no use
 * to a client — the signing function takes the row id.
 */
export function useSubmissionFiles(submissionId: string | null | undefined) {
  return useQuery({
    queryKey: filesKey(submissionId),
    enabled: !!submissionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('assignment_submission_files')
        .select('id, submission_id, file_name, mime_type, size_bytes, created_at')
        .eq('submission_id', submissionId!)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data ?? []
    },
  })
}

/**
 * Upload, then attach. Two steps because the upload goes through
 * `upload-media` (the only writer of the bucket) and the attach goes through
 * an RPC that re-checks the path was uploaded by the caller.
 */
export function useAttachSubmissionFiles(academyId: string) {
  const qc = useQueryClient()
  return useMutation({
    // The submission id travels with the call, not the hook: the first file on
    // a brand-new hand-in is attached to a draft created a moment earlier.
    mutationFn: async ({
      submissionId,
      files,
    }: {
      submissionId: string
      files: UploadFile[]
    }) => {
      for (const file of files) {
        const uploaded = await uploadPrivateFile('submissions', academyId, file)
        const { error } = await supabase.rpc('attach_submission_file', {
          _submission_id: submissionId,
          _file: uploaded as unknown as Json,
        })
        if (error) throw error
      }
    },
    // On failure too: files before the one that failed are attached.
    onSettled: (_data, _error, input) =>
      qc.invalidateQueries({ queryKey: filesKey(input.submissionId) }),
  })
}

export function useRemoveSubmissionFile(submissionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (fileId: string) =>
      rpcPending('remove_submission_file', { _file_id: fileId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: filesKey(submissionId) }),
  })
}
