import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { errorMessage } from '@/lib/errors'
import { fmtDate } from '@/lib/format'
import { PageHeader } from '@/components/patterns/PageHeader'
import { Button } from '@/components/ui/button'
import { DocumentStudentList } from '@/features/documents/DocumentStudentList'
import { useOpenIcCopy } from '@/features/documents/api'

/**
 * Who has sent their IC copy, and the copy itself.
 *
 * Read-only for staff: the student uploads their own card. Opening one mints a
 * link for that click — the bucket is private and nothing here holds a URL.
 */
export function IcCopiesPage() {
  const { t } = useT()
  const open = useOpenIcCopy()
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader title={t('sdoc.ic.title')} />
      {error ? <p className="text-destructive mt-4 text-sm">{error}</p> : null}
      <DocumentStudentList
        lastHead={t('sdoc.ic.title')}
        lastCell={(s) =>
          s.icCopy ? (
            <div className="flex items-center justify-end gap-3">
              <span className="text-muted-foreground text-xs">
                {fmtDate(s.icCopy.created_at)}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={open.isPending && open.variables === s.id}
                onClick={() => {
                  setError(null)
                  open.mutate(s.id, {
                    onError: (e) => setError(errorMessage(e, t('common.error'))),
                  })
                }}
              >
                <ExternalLink /> {t('common.view')}
              </Button>
            </div>
          ) : (
            <span className="text-muted-foreground text-sm">
              {t('sdoc.ic.not_uploaded')}
            </span>
          )
        }
      />
    </div>
  )
}
