// HARNESS-ONLY VARIANT of apps/web/src/features/reports/ReportTimeline.tsx.
//
// Substituted by tools/capture/web/variants/plugin.mjs for the showreel; never
// written into apps/web. It is the product's file, line for line, with exactly
// one addition (search "AI"): an entry whose actor is the AI check
// (actor_role 'system', written by "Hawary AI") gets the lucide Sparkles icon in
// its circle and a small outline Badge reading "AI check" beside its headline.
// Built from the app's own Badge, tokens and lucide icons; no new colours.
//
// The two data-* attributes are invisible hooks for the screenshot tool.

import { useState } from 'react'
import {
  ArrowRightLeft,
  CheckCircle2,
  Download,
  FileText,
  MessageSquare,
  Sparkles,
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
} from '@/features/reports/api'

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
  const { t, lang } = useT()

  return (
    <ol className="divide-y">
      {events.map((e) => {
        // AI: the check that reads the upload writes its entry as the system.
        const ai = e.actor_role === 'system'
        const Icon = ai ? Sparkles : KIND_ICON[e.kind]
        const status = e.to_status ? REPORT_STATUS[e.to_status] : null
        const mine = !!myUserId && e.actor_id === myUserId
        return (
          <li
            key={e.id}
            className="flex gap-3 px-4 py-3"
            data-event={e.kind}
            data-ai-event={ai ? '' : undefined}
          >
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
                {/* AI */}
                {ai ? (
                  <Badge variant="outline" className="shrink-0" data-ai-badge="">
                    {lang === 'ms' ? 'Semakan AI' : 'AI check'}
                  </Badge>
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
