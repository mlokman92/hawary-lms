import { useMutation, useQuery } from '@tanstack/react-query'
import { FileText, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useT } from '@/lib/i18n'
import { formatBytes } from '@/features/materials/api'

/**
 * The files attached to an assignment hand-in.
 *
 * Attaching happens in the Student mobile app — photographs of written work,
 * mostly — so the web's part is to SHOW them: to the grader marking the work,
 * and to the student looking at what they handed in. Read-only here on purpose;
 * see docs/mobile-apps.md → "Assignment attachments".
 *
 * RLS on `assignment_submission_files` follows the submission, so whoever may
 * read the hand-in sees its files and nobody else does. The objects are in the
 * private `submissions` bucket: a click asks `submission-url` for a 60-second
 * signed URL, by file id, exactly as `report-url` does for a report.
 *
 * Renders nothing when there are no files, so it can sit unconditionally under
 * the submitted text.
 */
export function SubmissionFiles({
  submissionId,
}: {
  submissionId: string | null | undefined
}) {
  const { t } = useT()
  const { data: files } = useQuery({
    queryKey: ['submission-files', submissionId ?? ''] as const,
    enabled: !!submissionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('assignment_submission_files')
        .select('id, file_name, size_bytes')
        .eq('submission_id', submissionId!)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data ?? []
    },
  })

  const open = useMutation({
    mutationFn: async (fileId: string) => {
      const { data, error } = await supabase.functions.invoke<{
        url?: string
        error?: string
      }>('submission-url', { body: { file_id: fileId } })
      if (error) throw error
      if (!data?.url) throw new Error(data?.error ?? t('report.no_url'))
      // noopener: the signed URL is a bearer token in a query string.
      window.open(data.url, '_blank', 'noopener,noreferrer')
    },
  })

  if (!files || files.length === 0) return null

  return (
    <div className="mt-4">
      <ul className="divide-y rounded-lg border">
        {files.map((f) => (
          <li key={f.id}>
            <button
              type="button"
              onClick={() => open.mutate(f.id)}
              disabled={open.isPending}
              aria-label={t('report.file.download', { name: f.file_name })}
              className="hover:bg-muted/50 flex w-full items-center gap-2 px-3 py-2 text-left transition-colors"
            >
              {open.isPending && open.variables === f.id ? (
                <Loader2 className="text-muted-foreground size-4 shrink-0 animate-spin" />
              ) : (
                <FileText className="text-muted-foreground size-4 shrink-0" aria-hidden />
              )}
              <span className="min-w-0 flex-1 truncate text-sm">{f.file_name}</span>
              <span className="text-muted-foreground shrink-0 text-xs">
                {formatBytes(f.size_bytes)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {open.error ? (
        <p className="text-destructive mt-2 text-sm">{t('report.no_url')}</p>
      ) : null}
    </div>
  )
}
