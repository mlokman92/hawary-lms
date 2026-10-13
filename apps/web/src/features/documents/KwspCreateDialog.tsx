import { useState } from 'react'
import { errorMessage } from '@/lib/errors'
import { useT } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DocumentStudentList } from './DocumentStudentList'
import { useCreateKwspLetters, type DocumentStudent } from './api'

const withoutLetter = (s: DocumentStudent) => !s.kwspCreatedAt

/**
 * Prepare a KWSP letter for many students at once: the roster of everyone who
 * has none, narrowed to a course, ticked, created. See docs/documents.md.
 *
 * The roster is unmounted with the dialog, so it opens on no search and no
 * course every time; the ticks are kept here and are dropped on the way out.
 */
export function KwspCreateDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useT()
  const create = useCreateKwspLetters()
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [error, setError] = useState<string | null>(null)

  function change(next: boolean) {
    if (!next) {
      setSelected(new Set())
      setError(null)
    }
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent className="sm:max-w-4xl" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t('sdoc.kwsp.create_title')}</DialogTitle>
        </DialogHeader>
        <DocumentStudentList
          className="mt-0 min-w-0"
          tableClassName="max-h-[55vh] overflow-y-auto"
          only={withoutLetter}
          selection={{ selected, onChange: setSelected }}
        />
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => change(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={selected.size === 0 || create.isPending}
            onClick={() => {
              setError(null)
              create.mutate([...selected], {
                onSuccess: () => change(false),
                onError: (e) => setError(errorMessage(e, t('common.error'))),
              })
            }}
          >
            {create.isPending
              ? t('common.creating')
              : t('sdoc.kwsp.create_count', { count: selected.size })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
