import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Upload } from 'lucide-react'
import { useAuth } from '@/lib/auth'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCreateMaterial } from './api'

/** Mirrors the bucket's allowed_mime_types and the Edge Function's allow-list. */
const ACCEPT = [
  '.pdf',
  '.doc',
  '.docx',
  '.ppt',
  '.pptx',
  '.xls',
  '.xlsx',
  '.txt',
  '.csv',
  '.zip',
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
].join(',')

const MAX_BYTES = 50 * 1024 * 1024

export function MaterialUploadDialog({
  academyId,
  courseId,
  moduleId,
  sortOrder,
  open,
  onOpenChange,
}: {
  academyId: string
  courseId: string
  moduleId: string | null
  sortOrder: number
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useT()
  const { user } = useAuth()
  const create = useCreateMaterial(academyId, courseId)
  const fileRef = useRef<HTMLInputElement>(null)

  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setFile(null)
    setTitle('')
    setError(null)
  }, [open])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!moduleId) return
    if (!file) {
      setError(t('materials.error.no_file'))
      return
    }
    if (file.size > MAX_BYTES) {
      setError(t('materials.error.too_large'))
      return
    }
    setError(null)
    try {
      await create.mutateAsync({
        file,
        // Blank title falls back to the filename in the hook, so a hurried
        // upload still lands with something readable on it.
        title,
        module_id: moduleId,
        created_by: user?.id ?? null,
        sort_order: sortOrder,
      })
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('materials.upload.title')}</DialogTitle>
          <DialogDescription>{t('materials.upload.description')}</DialogDescription>
        </DialogHeader>

        <form id="material-upload" className="grid gap-4" onSubmit={onSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="material-file">{t('materials.file')}</Label>
            <Input
              id="material-file"
              ref={fileRef}
              type="file"
              accept={ACCEPT}
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null
                setFile(f)
                // Prefill the title from the filename, minus the extension —
                // "Week 1 slides.pdf" is already the name they meant.
                if (f && !title.trim()) {
                  setTitle(f.name.replace(/\.[^.]+$/, ''))
                }
              }}
            />
            <p className="text-muted-foreground text-xs">
              {t('materials.upload.hint')}
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="material-title">{t('common.title')}</Label>
            <Input
              id="material-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={file?.name ?? t('materials.title_placeholder')}
            />
          </div>

          {error ? <p className="text-destructive text-sm">{error}</p> : null}
        </form>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={create.isPending}
          >
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            form="material-upload"
            disabled={create.isPending || !file}
          >
            <Upload />
            {create.isPending ? t('common.uploading') : t('common.upload')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
