import { useRef, useState, type ChangeEvent } from 'react'
import { ExternalLink, Upload } from 'lucide-react'
import { useStudentAcademy } from '@/lib/studentAcademy'
import { useT } from '@/lib/i18n'
import { errorMessage } from '@/lib/errors'
import { fmtDate } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/patterns/PageHeader'
import { ErrorBlock, LoadingBlock } from '@/components/patterns/QueryState'
import { NoStudentRecord } from '@/components/learn/NoStudentRecord'
import { useMyStudent } from '@/features/learn/api'
import {
  useMyIcCopy,
  useOpenIcCopy,
  useUploadMyIcCopy,
} from '@/features/documents/api'

/** The bucket's own cap; checked here only so the message is translated. */
const MAX_MB = 10

/**
 * The student's IC copy: send it, look at it, send a better one.
 *
 * PDF only. The picker is narrowed to PDF and the file is checked here so the
 * refusal arrives in the reader's language, but the rule is the function's —
 * it reads the file's first bytes, not the name it arrived under.
 */
export function LearnIcCopyPage() {
  const { t } = useT()
  const { academyId } = useStudentAcademy()
  const student = useMyStudent(academyId)
  const studentId = student.data?.id
  const copy = useMyIcCopy(studentId)
  const upload = useUploadMyIcCopy(studentId)
  const open = useOpenIcCopy()
  const input = useRef<HTMLInputElement>(null)
  const [err, setErr] = useState<string | null>(null)

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Cleared so picking the same file again after a failure still fires.
    e.target.value = ''
    if (!file) return
    setErr(null)
    if (file.type !== 'application/pdf') {
      setErr(t('sdoc.ic.pdf_only'))
      return
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setErr(t('sdoc.ic.too_large', { max: MAX_MB }))
      return
    }
    try {
      await upload.mutateAsync(file)
    } catch (e2) {
      setErr(errorMessage(e2, t('upload.failed')))
    }
  }

  const error = student.error ?? copy.error
  const loading = student.isLoading || (!!studentId && copy.isLoading)

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader title={t('sdoc.ic.title')} />
      <div className="mt-6">
        {loading ? (
          <LoadingBlock />
        ) : error ? (
          <ErrorBlock error={error} />
        ) : !studentId ? (
          <NoStudentRecord />
        ) : (
          <Card>
            <CardContent className="grid gap-4">
              {copy.data ? (
                <div>
                  <p className="truncate text-sm font-medium">
                    {copy.data.file_name}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {t('sdoc.ic.uploaded_on', {
                      date: fmtDate(copy.data.created_at),
                    })}
                  </p>
                </div>
              ) : null}

              {err ? <p className="text-destructive text-sm">{err}</p> : null}

              <div className="flex flex-wrap gap-2">
                <input
                  ref={input}
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={(e) => void onPick(e)}
                />
                <Button
                  variant={copy.data ? 'outline' : 'default'}
                  disabled={upload.isPending}
                  onClick={() => input.current?.click()}
                >
                  <Upload />{' '}
                  {upload.isPending
                    ? t('common.uploading')
                    : copy.data
                      ? t('sdoc.ic.replace')
                      : t('sdoc.ic.choose')}
                </Button>
                {copy.data ? (
                  <Button
                    variant="outline"
                    disabled={open.isPending}
                    onClick={() => {
                      setErr(null)
                      open.mutate(studentId, {
                        onError: (e) =>
                          setErr(errorMessage(e, t('common.error'))),
                      })
                    }}
                  >
                    <ExternalLink /> {t('common.view')}
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
