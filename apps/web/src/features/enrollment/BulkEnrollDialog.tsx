import { useEffect, useMemo, useRef, useState } from 'react'
import { FileUp } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  classifyEmails,
  parseEmailList,
  useBulkEnroll,
  useEnrollRoster,
} from './bulkEnroll'

function Stat({ label, value }: { label: string; value: number }) {
  if (value === 0) return null
  return (
    <div className="bg-muted/50 rounded-md border px-3 py-2">
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-muted-foreground text-xs">{label}</p>
    </div>
  )
}

function Bucket({
  title,
  hint,
  emails,
}: {
  title: string
  hint: string
  emails: string[]
}) {
  if (emails.length === 0) return null
  return (
    <div className="grid gap-1 rounded-lg border border-dashed p-3">
      <p className="text-sm font-medium">{title}</p>
      <p className="text-muted-foreground max-h-24 overflow-y-auto text-xs break-all">
        {emails.join(', ')}
      </p>
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
    </div>
  )
}

/**
 * Enrol a list of existing students onto this course.
 *
 * The preview is the point: an admin pasting forty addresses needs to see, before
 * anything is written, how many will land and which ones will not — and why.
 */
export function BulkEnrollDialog({
  academyId,
  courseId,
  open,
  onOpenChange,
}: {
  academyId: string
  courseId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t, tn } = useT()
  const fileRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<number | null>(null)

  const { data: roster, isLoading } = useEnrollRoster(academyId, courseId)
  const enroll = useBulkEnroll(academyId, courseId)

  useEffect(() => {
    if (!open) return
    setText('')
    setError(null)
    setDone(null)
  }, [open])

  const parsed = useMemo(() => parseEmailList(text), [text])
  const buckets = useMemo(
    () => classifyEmails(parsed.emails, roster),
    [parsed.emails, roster],
  )

  async function readFile(file: File) {
    setError(null)
    try {
      const content = await file.text()
      setText((prev) => (prev.trim() ? `${prev}\n${content}` : content))
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'))
    }
  }

  async function submit() {
    setError(null)
    try {
      const count = await enroll.mutateAsync(
        buckets.ready.map((r) => r.student.id),
      )
      setDone(count)
      setText('')
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('enroll.bulk.title')}</DialogTitle>
          <DialogDescription>{t('enroll.bulk.description')}</DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[60vh] gap-4 overflow-y-auto pr-1">
          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="bulk-emails">{t('enroll.bulk.label')}</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
              >
                <FileUp /> {t('enroll.bulk.upload')}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv,text/plain"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  // Reset first: picking the same file twice must still fire.
                  e.target.value = ''
                  if (file) void readFile(file)
                }}
              />
            </div>
            <Textarea
              id="bulk-emails"
              rows={6}
              className="font-mono text-xs"
              placeholder={t('enroll.bulk.placeholder')}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              {t('enroll.bulk.hint')}
            </p>
          </div>

          {parsed.emails.length > 0 || parsed.invalid.length > 0 ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Stat
                label={t('enroll.bulk.stat.ready')}
                value={buckets.ready.length}
              />
              <Stat
                label={t('enroll.bulk.stat.already')}
                value={buckets.already.length}
              />
              <Stat
                label={t('enroll.bulk.stat.unknown')}
                value={buckets.unknown.length}
              />
              <Stat
                label={t('enroll.bulk.stat.ambiguous')}
                value={buckets.ambiguous.length}
              />
              <Stat
                label={t('enroll.bulk.stat.invalid')}
                value={parsed.invalid.length}
              />
            </div>
          ) : null}

          <Bucket
            title={t('enroll.bulk.unknown_title')}
            hint={`${t('enroll.bulk.unknown_hint')} ${t('enroll.bulk.archived_note')}`}
            emails={buckets.unknown}
          />
          <Bucket
            title={t('enroll.bulk.ambiguous_title')}
            hint={t('enroll.bulk.ambiguous_hint')}
            emails={buckets.ambiguous}
          />
          <Bucket
            title={t('enroll.bulk.invalid_title')}
            hint=""
            emails={parsed.invalid}
          />

          {done !== null ? (
            <p className="text-sm font-medium">
              {tn('enroll.bulk.done', done)}
            </p>
          ) : null}
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t('common.close')}
          </Button>
          <Button
            type="button"
            disabled={
              isLoading || enroll.isPending || buckets.ready.length === 0
            }
            onClick={() => void submit()}
          >
            {enroll.isPending
              ? t('enroll.bulk.submitting')
              : buckets.ready.length === 0
                ? t('enroll.bulk.nothing')
                : t('enroll.bulk.submit', { count: buckets.ready.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
