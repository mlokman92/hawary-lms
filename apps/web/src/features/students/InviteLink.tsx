import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function InviteLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="grid gap-1.5">
      <div className="bg-muted flex items-center gap-2 rounded-md border p-2">
        <code className="flex-1 truncate text-xs" title={url}>
          {url}
        </code>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            void navigator.clipboard.writeText(url)
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1500)
          }}
        >
          {copied ? <Check /> : <Copy />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        Share this link with the student. Email delivery arrives once SMTP is
        configured.
      </p>
    </div>
  )
}
