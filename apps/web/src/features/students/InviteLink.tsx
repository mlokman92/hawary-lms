import { useState, type ReactNode } from 'react'
import { Check, Copy } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { Button } from '@/components/ui/button'

export function InviteLink({ url, note }: { url: string; note?: ReactNode }) {
  const { t } = useT()
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      // navigator.clipboard is undefined on insecure (non-HTTPS, non-localhost)
      // origins, and writeText can reject if permission is denied — only show
      // the confirmation when the write actually succeeds.
      await navigator.clipboard?.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="grid gap-1.5">
      <div className="bg-muted flex items-center gap-2 rounded-md border p-2">
        <code className="flex-1 truncate text-xs" title={url}>
          {url}
        </code>
        <Button type="button" size="sm" variant="outline" onClick={() => void copy()}>
          {copied ? <Check /> : <Copy />}
          {copied ? t('common.copied') : t('common.copy')}
        </Button>
      </div>
      {note ? <p className="text-muted-foreground text-xs">{note}</p> : null}
    </div>
  )
}
