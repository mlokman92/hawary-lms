import { useState, type FormEvent } from 'react'
import { useCourses } from '@/features/courses/api'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAssignCourse } from './api'
import { errorMessage } from '@/lib/errors'

export function AssignCourseDialog({
  academyId,
  instructorId,
  assignedCourseIds,
  open,
  onOpenChange,
}: {
  academyId: string
  instructorId: string
  assignedCourseIds: string[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useT()
  const { data: courses } = useCourses(academyId)
  const assign = useAssignCourse(academyId, instructorId)
  const [courseId, setCourseId] = useState('')
  const [error, setError] = useState<string | null>(null)

  const available = (courses ?? []).filter(
    (c) => c.status !== 'archived' && !assignedCourseIds.includes(c.id),
  )

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!courseId) return setError(t('instructors.assign.required'))
    setError(null)
    try {
      await assign.mutateAsync(courseId)
      setCourseId('')
      onOpenChange(false)
    } catch (err) {
      setError(errorMessage(err, t('common.error')))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('instructors.assign.title')}</DialogTitle>
          <DialogDescription>
            {t('instructors.assign.description')}
          </DialogDescription>
        </DialogHeader>
        <form id="assign-form" className="grid gap-2" onSubmit={onSubmit}>
          <Label>{t('common.course')}</Label>
          <Select value={courseId} onValueChange={setCourseId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t('instructors.assign.placeholder')} />
            </SelectTrigger>
            <SelectContent>
              {available.length === 0 ? (
                <div className="text-muted-foreground px-2 py-1.5 text-sm">
                  {t('instructors.assign.empty')}
                </div>
              ) : (
                available.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.title}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
        </form>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={assign.isPending}
          >
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            form="assign-form"
            disabled={assign.isPending || available.length === 0}
          >
            {assign.isPending
              ? t('instructors.assign.busy')
              : t('instructors.assign.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
