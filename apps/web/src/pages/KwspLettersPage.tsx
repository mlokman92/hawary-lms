import { useMemo, useState } from 'react'
import { Download, MoreHorizontal, Plus } from 'lucide-react'
import { useAcademy } from '@/lib/academy'
import { errorMessage } from '@/lib/errors'
import { fmtDate } from '@/lib/format'
import { useT } from '@/lib/i18n'
import { PageHeader } from '@/components/patterns/PageHeader'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { DocumentStudentList } from '@/features/documents/DocumentStudentList'
import { KwspCreateDialog } from '@/features/documents/KwspCreateDialog'
import {
  downloadStudentKwspLetters,
  useDocumentStudents,
  useRemoveKwspLetters,
  type DocumentStudent,
} from '@/features/documents/api'

const hasLetter = (s: DocumentStudent) => !!s.kwspCreatedAt

/**
 * The KWSP letter — Surat Pengesahan Pendaftaran Pelajar — for the students
 * the academy has prepared one for, and only them: a student without a letter
 * is not on this page. *Create* opens the roster of everyone else, to prepare
 * it for many at once. See docs/documents.md.
 *
 * Academy side only. A student never sees this letter; the academy prints,
 * signs and hands it over.
 */
export function KwspLettersPage() {
  const { t } = useT()
  const { activeAcademyId } = useAcademy()
  // The roster's own read, already in the cache: the ticked ids become rows.
  const { data: students } = useDocumentStudents(activeAcademyId)
  const remove = useRemoveKwspLetters()
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  // A student's id while their one letter is drawn, 'selected' for the batch.
  const [drawing, setDrawing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const chosen = useMemo(
    () => (students ?? []).filter((s) => selected.has(s.id) && hasLetter(s)),
    [students, selected],
  )

  async function download(key: string, of: DocumentStudent[]) {
    setDrawing(key)
    setError(null)
    try {
      await downloadStudentKwspLetters(of)
    } catch {
      setError(t('sdoc.download_failed'))
    } finally {
      setDrawing(null)
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader title={t('sdoc.kwsp.title')}>
        <Button onClick={() => setCreating(true)}>
          <Plus /> {t('common.create')}
        </Button>
      </PageHeader>
      {error ? <p className="text-destructive mt-4 text-sm">{error}</p> : null}
      <DocumentStudentList
        only={hasLetter}
        emptyLabel={t('sdoc.kwsp.empty')}
        selection={{ selected, onChange: setSelected }}
        actions={
          chosen.length > 0 ? (
            <>
              <Button
                variant="outline"
                disabled={drawing === 'selected'}
                onClick={() => void download('selected', chosen)}
              >
                <Download />{' '}
                {t('sdoc.kwsp.download_count', { count: chosen.length })}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label={t('common.actions')}
                  >
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={remove.isPending}
                    onClick={() => {
                      setError(null)
                      remove.mutate(
                        chosen.map((s) => s.id),
                        {
                          onError: (e) =>
                            setError(errorMessage(e, t('common.error'))),
                        },
                      )
                    }}
                  >
                    {t('sdoc.kwsp.remove_count', { count: chosen.length })}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : null
        }
        lastHead={t('sdoc.kwsp.title')}
        lastCell={(s) => (
          <div className="flex items-center justify-end gap-3">
            <span className="text-muted-foreground text-xs">
              {fmtDate(s.kwspCreatedAt)}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={drawing === s.id}
              onClick={() => void download(s.id, [s])}
            >
              <Download /> {t('common.download')}
            </Button>
          </div>
        )}
      />
      <KwspCreateDialog open={creating} onOpenChange={setCreating} />
    </div>
  )
}
