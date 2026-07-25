import { useRef, useState, type ChangeEvent } from 'react'
import { Upload, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'

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
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
      // First path segment must be the academy id (storage RLS scopes on it).
      const path = `${academyId}/${crypto.randomUUID()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type })
      if (upErr) throw upErr
      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      onChange(data.publicUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
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
            <Upload /> {busy ? 'Uploading…' : value ? 'Change' : 'Upload'}
          </Button>
          {value ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => onChange('')}
              aria-label="Remove picture"
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
