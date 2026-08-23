import { useRef, useState, type ChangeEvent } from 'react'
import { Upload, X } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { uploadPublicImage } from '@/lib/storage'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { errorMessage } from '@/lib/errors'

export function AvatarUploader({
  academyId,
  value,
  onChange,
  fallback,
}: {
  academyId: string
  value: string
  onChange: (url: string) => void
  fallback?: string
}) {
  const { t } = useT()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      // Same path as note media: the upload-media Edge Function scopes the
      // object under <academy_id>/ and checks staff membership server-side.
      onChange(await uploadPublicImage('avatars', academyId, file))
    } catch (err) {
      setError(errorMessage(err, t('upload.failed')))
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Avatar className="size-14">
        <AvatarImage src={value || undefined} />
        <AvatarFallback>{fallback || '—'}</AvatarFallback>
      </Avatar>
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onFile}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            <Upload />{' '}
            {busy
              ? t('common.uploading')
              : value
                ? t('students.avatar.change')
                : t('common.upload')}
          </Button>
          {value ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => onChange('')}
              aria-label={t('students.avatar.remove')}
            >
              <X />
            </Button>
          ) : null}
        </div>
        {error ? <p className="text-destructive text-xs">{error}</p> : null}
      </div>
    </div>
  )
}
