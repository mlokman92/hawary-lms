import { useRef, useState } from 'react'
import { Paperclip, X } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { errorMessage } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { uploadReportFile, type PendingFile } from './api'

/**
 * Attach documents to a thread.
 *
 * Files go to storage as they are picked, not when the form is submitted, for
 * one reason: a 40 MB portfolio takes long enough that uploading it inside the
 * submit handler would leave a button spinning with nothing to show, and a
 * failure would lose the comment typed above it. Here each file resolves on its
 * own and the form holds only paths.
 *
 * The cost is an orphan object when somebody picks a file and walks away. That
 * is accepted — `course_materials` has the same property, and an unreferenced
 * key in a private bucket is unreachable by anyone.
 */
export function FilePicker({
  academyId,
  files,
  onChange,
  disabled,
}: {
  academyId: string
  files: PendingFile[]
  onChange: (files: PendingFile[]) => void
  disabled?: boolean
}) {
  const { t } = useT()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function pick(list: FileList | null) {
    if (!list || list.length === 0) return
    setBusy(true)
    setError(null)
    const added: PendingFile[] = []
    try {
      // Sequential, not Promise.all: these are big, and a browser firing six
      // 50 MB uploads at once is how the last one times out.
      for (const file of Array.from(list)) {
        added.push(await uploadReportFile(academyId, file))
      }
      onChange([...files, ...added])
    } catch (e) {
      // Keep whatever did land. Re-picking the one that failed is a smaller
      // ask than re-picking all six.
      if (added.length > 0) onChange([...files, ...added])
      setError(errorMessage(e, t('common.error')))
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <div>
      <input
        ref={input}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => void pick(e.target.files)}
      />

      {files.length > 0 ? (
        <ul className="mb-2 flex flex-wrap gap-2">
          {files.map((f) => (
            <li
              key={f.path}
              className="bg-muted flex items-center gap-1.5 rounded-md py-1 pr-1 pl-2.5 text-xs"
            >
              <span className="max-w-50 truncate">{f.name}</span>
              <button
                type="button"
                className="hover:bg-background rounded p-0.5"
                aria-label={t('report.file.remove', { name: f.name })}
                onClick={() =>
                  onChange(files.filter((x) => x.path !== f.path))
                }
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || busy}
        onClick={() => input.current?.click()}
      >
        <Paperclip />
        {busy ? t('report.file.uploading') : t('report.file.attach')}
      </Button>

      {error ? (
        <p className="text-destructive mt-2 text-xs">{error}</p>
      ) : null}
    </div>
  )
}
