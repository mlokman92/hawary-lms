import { useEffect, useState, type FormEvent } from 'react'
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
import { Textarea } from '@/components/ui/textarea'
import { useCreateModule, useUpdateModule, type CourseModule } from './api'

export function ModuleFormDialog({
  academyId,
  courseId,
  module,
  /** Position for a new module — the current module count. */
  nextSortOrder,
  open,
  onOpenChange,
}: {
  academyId: string
  courseId: string
  module?: CourseModule | null
  nextSortOrder: number
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const isEdit = !!module
  const { user } = useAuth()
  const { t } = useT()
  const createModule = useCreateModule(academyId, courseId)
  const updateModule = useUpdateModule(academyId, courseId)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setTitle(module?.title ?? '')
    setDescription(module?.description ?? '')
    setError(null)
  }, [open, module])

  const busy = createModule.isPending || updateModule.isPending

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) {
      setError(t('modules.error.title_required'))
      return
    }
    setError(null)
    try {
      if (isEdit && module) {
        await updateModule.mutateAsync({
          id: module.id,
          patch: {
            title: title.trim(),
            description: description.trim() || null,
          },
        })
      } else {
        await createModule.mutateAsync({
          title: title.trim(),
          description: description.trim() || null,
          created_by: user?.id ?? null,
          sort_order: nextSortOrder,
        })
      }
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t(
              isEdit ? 'modules.dialog.edit_title' : 'modules.dialog.new_title',
            )}
          </DialogTitle>
          <DialogDescription>
            {t(
              isEdit
                ? 'modules.dialog.edit_description'
                : 'modules.dialog.new_description',
            )}
          </DialogDescription>
        </DialogHeader>

        <form id="module-form" className="grid gap-4" onSubmit={onSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="module-title">{t('common.title')}</Label>
            <Input
              id="module-title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('modules.field.title_placeholder')}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="module-description">
              {t('modules.field.summary')}
            </Label>
            <Textarea
              id="module-description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('modules.field.summary_placeholder')}
            />
          </div>
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
        </form>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="module-form" disabled={busy}>
            {busy
              ? t('common.saving')
              : isEdit
                ? t('modules.action.save_changes')
                : t('modules.action.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
