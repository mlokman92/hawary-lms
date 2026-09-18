import { useState } from 'react'
import {
  ArrowRightLeft,
  CheckCircle2,
  Download,
  FileText,
  MessageSquare,
  Upload,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useT, type TFn } from '@/lib/i18n'
import { fmtDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { TONE_CLASS } from '@/lib/tone'
import { Badge } from '@/components/ui/badge'
import {
  REPORT_STATUS,
  reportFileUrl,
  type ReportEvent,
  type ReportFile,
} from './api'

/**
 * The history, oldest first.
 *
 * Oldest first and not newest first, unlike every list in the back office: this
 * is a conversation, and a conversation read bottom-up is a conversation you
 * have to reassemble. The newest entry is at the end, next to the box you reply
 * in.
 *
 * Four kinds, one row shape. An entry is an EVENT — who, when, what changed —
 * and the words are assembled here, so a Malay reader sees Malay for a thread
 * an English-speaking checker wrote status changes into.
 */

const KIND_ICON: Record<ReportEvent['kind'], LucideIcon> = {
  submitted: Upload,
  comment: MessageSquare,
  status: CheckCircle2,
  assigned: ArrowRightLeft,
}

function humanSize(bytes: number | null): string {
  if (bytes === null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * One attached document. The URL is minted on click and lives 60 seconds, so
 * there is nothing to render until somebody asks — which is also why this is a
 * button and not an anchor.
 */
function FileChip({ file }: { file: ReportFile }) {
  const { t } = useT()
  const [busy, setBusy] = useState(false)

  async function open(download: boolean) {
    setBusy(true)
    try {
      const url = await reportFileUrl(file.id, download)
      window.open(url, '_blank', 'noopener,noreferrer')
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="bg-muted/60 inline-flex items-center gap-1 rounded-md py-1 pr-1 pl-2 text-xs">
      <button
        type="button"
        disabled={busy}
        onClick={() => void open(false)}
        className="flex min-w-0 items-center gap-1.5 hover:underline"
      >
        <FileText className="size-3.5 shrink-0" aria-hidden />
        <span className="max-w-56 truncate">{file.file_name}</span>
        {file.size_bytes ? (
          <span className="text-muted-foreground shrink-0">
            {humanSize(file.size_bytes)}
          </span>
        ) : null}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => void open(true)}
        aria-label={t('report.file.download', { name: file.file_name })}
        className="hover:bg-background rounded p-1"
      >
        <Download className="size-3" />
      </button>
    </span>
  )
}

/** What this entry says happened, in the reader's language. */
function headlineOf(e: ReportEvent, t: TFn): string {
  const who = e.actor_name?.trim() || t('report.someone')
  if (e.kind === 'submitted') {
    return e.version && e.version > 1
      ? t('report.event.resubmitted', { who, version: e.version })
      : t('report.event.submitted', { who })
  }
  if (e.kind === 'assigned') {
    return t('report.event.assigned', { who, to: e.body ?? t('report.someone') })
  }
  if (e.kind === 'status' || (e.kind === 'comment' && e.to_status)) {
    return t('report.event.decided', { who })
  }
  return t('report.event.commented', { who })
}

export function ReportTimeline({
  events,
  myUserId,
}: {
  events: ReportEvent[]
  /** Highlights the reader's own entries. Nothing more — this is not a grant. */
  myUserId: string | null
}) {
  const { t } = useT()

  return (
    <ol className="divide-y">
      {events.map((e) => {
        const Icon = KIND_ICON[e.kind]
        const status = e.to_status ? REPORT_STATUS[e.to_status] : null
        const mine = !!myUserId && e.actor_id === myUserId
        return (
          <li key={e.id} className="flex gap-3 px-4 py-3">
            <span
              className={cn(
                'bg-muted mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full',
                status && TONE_CLASS[status.tone],
              )}
            >
              <Icon className="size-3.5" aria-hidden />
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-sm font-medium">
                  {headlineOf(e, t)}
                </span>
                {mine ? (
                  <span className="text-muted-foreground text-xs">
                    {t('report.event.you')}
                  </span>
                ) : null}
                {status ? (
                  <Badge variant="outline" className="shrink-0">
                    {t(status.labelKey)}
                  </Badge>
                ) : null}
                <span className="text-muted-foreground ml-auto shrink-0 text-xs tabular-nums">
                  {fmtDateTime(e.created_at)}
                </span>
              </div>

              {/* `whitespace-pre-wrap`: a checker's notes are a list of points
                  far more often than a paragraph, and collapsing their line
                  breaks would run the points together. */}
              {e.body && e.kind !== 'assigned' ? (
                <p className="mt-1 text-sm whitespace-pre-wrap">{e.body}</p>
              ) : null}

              {e.files.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {e.files.map((f) => (
                    <FileChip key={f.id} file={f} />
                  ))}
                </div>
              ) : null}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
