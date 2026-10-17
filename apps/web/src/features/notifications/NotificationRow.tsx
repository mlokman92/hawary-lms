import { getLang, useT } from '@/lib/i18n'
import { fmtDateTime, localeFor } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Notification } from './api'
import { detailOf, titleOf } from './render'

/**
 * One notification as a button: the unread dot, the title and the detail line.
 * The bell and the full page render the same row; `full` lets the page show
 * the whole title and when the row arrived, which the narrow panel has no
 * room for.
 */
export function NotificationRow({
  row,
  onOpen,
  full = false,
}: {
  row: Notification
  onOpen: (row: Notification) => void
  full?: boolean
}) {
  const { t } = useT()
  const locale = localeFor(getLang())
  return (
    <button
      type="button"
      onClick={() => onOpen(row)}
      className={cn(
        'hover:bg-muted/60 flex w-full items-start gap-2 text-left transition-colors',
        full ? 'px-4 py-3' : 'px-3 py-2.5',
        !row.read_at && 'bg-muted/30',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'mt-1.5 size-1.5 shrink-0 rounded-full',
          row.read_at ? 'bg-transparent' : 'bg-destructive',
        )}
      />
      <span className="min-w-0 flex-1">
        <span className={cn('block text-sm', !full && 'truncate')}>
          {titleOf(row, t)}
        </span>
        <span className="text-muted-foreground block text-xs">
          {detailOf(row, locale)}
        </span>
      </span>
      {full ? (
        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
          {fmtDateTime(row.created_at)}
        </span>
      ) : null}
    </button>
  )
}
