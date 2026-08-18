import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { Button } from '@/components/ui/button'

/**
 * Prev / position / Next for a server-paged list.
 *
 * Renders **nothing** when everything fits on one page: a disabled pager under
 * a six-row table is decoration, and the absence of the control already says
 * there is nothing more to see.
 *
 * Deliberately not numbered page links. Jumping to page 14 of a ledger is not a
 * thing anyone wants — you either walk it or you search it — and a numbered
 * strip would be the widest thing on the row for no gain.
 */
export function Pager({
  page,
  total,
  pageSize,
  onPageChange,
}: {
  /** 1-based. */
  page: number
  /** Rows across the whole filtered set, not this page. */
  total: number
  pageSize: number
  onPageChange: (page: number) => void
}) {
  const { t } = useT()
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  if (pageCount <= 1) return null

  // Guard both ends: a filter change can leave `page` past the new last page
  // for one render, and the buttons must not offer to go further.
  const canPrev = page > 1
  const canNext = page < pageCount

  return (
    <div className="mt-4 flex items-center justify-end gap-2">
      <span className="text-muted-foreground text-sm tabular-nums">
        {t('common.page_of', { page, pages: pageCount })}
      </span>
      <Button
        variant="outline"
        size="sm"
        disabled={!canPrev}
        onClick={() => onPageChange(page - 1)}
      >
        <ChevronLeft /> {t('common.previous')}
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={!canNext}
        onClick={() => onPageChange(page + 1)}
      >
        {t('common.next')} <ChevronRight />
      </Button>
    </div>
  )
}
