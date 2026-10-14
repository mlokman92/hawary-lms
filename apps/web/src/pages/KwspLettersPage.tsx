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
import { KwspDateDialog } from '@/features/documents/KwspDateDialog'
import {
  downloadStudentKwspLetters,
  kwspState,
  useCreateKwspLetters,
  useDocumentStudents,
  useRemoveKwspApplications,
  useRemoveKwspLetters,
  type DocumentStudent,
} from '@/features/documents/api'

const hasLetter = (s: DocumentStudent) => kwspState(s) === 'created'
const isWaiting = (s: DocumentStudent) => kwspState(s) === 'applied'
const onPage = (s: DocumentStudent) => kwspState(s) !== 'none'
const idOf = (s: DocumentStudent) => s.id

/**
 * The KWSP letter — Surat Pengesahan Pendaftaran Pelajar — for the students
 * who have asked for one and the students the academy has prepared one for,
 * and only them: anybody else is not on this page. See docs/documents.md.
 *
 * An application is reviewed here. It is listed ahead of the letters, and
 * *Create* on its row is the answer; *Remove* turns it away. The page's own
 * *Create* opens the roster of everyone without a letter, to prepare it for
 * many at once, asked for or not.
 *
 * The student sees where their application stands and never the letter: the
 * academy prints and hands it over. A letter is signed on the day it is
 * downloaded; *Download with date…* behind `⋯` picks another day.
 */
export function KwspLettersPage() {
  const { t } = useT()
  const { activeAcademyId } = useAcademy()
  // The roster's own read, already in the cache: the ticked ids become rows.
  const { data: students } = useDocumentStudents(activeAcademyId)
  const create = useCreateKwspLetters()
  const removeLetters = useRemoveKwspLetters()
  const removeApplications = useRemoveKwspApplications()
  const [creating, setCreating] = useState(false)
  const [dating, setDating] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  // A student's id while their one letter is drawn, 'selected' for the batch.
  const [drawing, setDrawing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const chosen = useMemo(
    () => (students ?? []).filter((s) => selected.has(s.id) && onPage(s)),
    [students, selected],
  )
  const waiting = chosen.filter(isWaiting)
  const created = chosen.filter(hasLetter)

  const failed = (e: unknown) => setError(errorMessage(e, t('common.error')))

  async function download(key: string, of: DocumentStudent[], date?: string) {
    setDrawing(key)
    setError(null)
    try {
      await downloadStudentKwspLetters(of, date)
    } catch {
      setError(t('sdoc.download_failed'))
    } finally {
      setDrawing(null)
    }
  }

  function createFor(of: DocumentStudent[]) {
    setError(null)
    create.mutate(of.map(idOf), { onError: failed })
  }

  // A letter is taken back, which leaves an application waiting again; an
  // application with no letter is turned away.
  function removeChosen() {
    setError(null)
    if (created.length > 0) {
      removeLetters.mutate(created.map(idOf), { onError: failed })
    }
    if (waiting.length > 0) {
      removeApplications.mutate(waiting.map(idOf), { onError: failed })
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
        only={onPage}
        first={isWaiting}
        emptyLabel={t('sdoc.kwsp.empty')}
        statusFilter={{
          label: t('common.status'),
          allLabel: t('sdoc.offer.all_statuses'),
          options: [
            { value: 'applied', label: t('sdoc.kwsp.applied') },
            { value: 'created', label: t('sdoc.kwsp.created') },
          ],
          matches: (s, value) => kwspState(s) === value,
        }}
        selection={{ selected, onChange: setSelected }}
        actions={
          chosen.length > 0 ? (
            <>
              {waiting.length > 0 ? (
                <Button
                  disabled={create.isPending}
                  onClick={() => createFor(waiting)}
                >
                  <Plus />{' '}
                  {t('sdoc.kwsp.create_count', { count: waiting.length })}
                </Button>
              ) : null}
              {created.length > 0 ? (
                <Button
                  variant="outline"
                  disabled={drawing === 'selected'}
                  onClick={() => void download('selected', created)}
                >
                  <Download />{' '}
                  {t('sdoc.kwsp.download_count', { count: created.length })}
                </Button>
              ) : null}
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
                  {created.length > 0 ? (
                    <DropdownMenuItem
                      disabled={drawing === 'selected'}
                      onClick={() => setDating(true)}
                    >
                      {t('sdoc.kwsp.download_dated')}
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={
                      removeLetters.isPending || removeApplications.isPending
                    }
                    onClick={removeChosen}
                  >
                    {t('sdoc.kwsp.remove_count', { count: chosen.length })}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : null
        }
        lastHead={t('sdoc.kwsp.title')}
        lastCell={(s) =>
          hasLetter(s) ? (
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
          ) : (
            <div className="flex items-center justify-end gap-3">
              <span className="text-muted-foreground text-xs">
                {t('sdoc.kwsp.applied_on', {
                  date: fmtDate(s.kwspAppliedAt),
                })}
              </span>
              <Button
                size="sm"
                disabled={create.isPending}
                onClick={() => createFor([s])}
              >
                <Plus /> {t('common.create')}
              </Button>
            </div>
          )
        }
      />
      <KwspCreateDialog open={creating} onOpenChange={setCreating} />
      <KwspDateDialog
        open={dating}
        onOpenChange={setDating}
        onDownload={(date) => download('selected', created, date)}
      />
    </div>
  )
}
