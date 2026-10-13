import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/**
 * A value that copies itself when pressed — a phone number, usually: the thing
 * read off one screen to be pasted into WhatsApp or a search box.
 *
 * The whole value is the button, not an icon beside it. The tick replaces the
 * copy mark for a moment and only when the write succeeded:
 * `navigator.clipboard` is undefined on an insecure origin and `writeText`
 * can be refused.
 */
export function CopyText({
  value,
  className,
}: {
  value: string
  className?: string
}) {
  const { t } = useT()
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard?.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={t(copied ? 'common.copied' : 'common.copy')}
      className={cn(
        'group hover:text-foreground focus-visible:ring-ring inline-flex items-center gap-1.5 rounded-sm text-left focus-visible:ring-2 focus-visible:outline-none',
        className,
      )}
    >
      <span>{value}</span>
      {copied ? (
        <Check className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
      ) : (
        <Copy className="text-muted-foreground size-3.5 shrink-0 opacity-60 group-hover:opacity-100" />
      )}
      <span className="sr-only" aria-live="polite">
        {copied ? t('common.copied') : ''}
      </span>
    </button>
  )
}
