import { useState, type FormEvent } from 'react'
import { useT } from '@/lib/i18n'
import { useCourses } from '@/features/courses/api'
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
import { useEnrollStudent } from './api'
import { errorMessage } from '@/lib/errors'

export function EnrollCourseDialog({
  academyId,
  studentId,
  enrolledCourseIds,
  open,
  onOpenChange,
}: {
  academyId: string
  studentId: string
  enrolledCourseIds: string[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useT()
  const { data: courses } = useCourses(academyId)
  const enroll = useEnrollStudent(academyId, studentId)
  const [courseId, setCourseId] = useState('')
  const [error, setError] = useState<string | null>(null)

  const available = (courses ?? []).filter(
    (c) => c.status !== 'archived' && !enrolledCourseIds.includes(c.id),
  )

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!courseId) return setError(t('students.enroll.required'))
    setError(null)
    try {
      await enroll.mutateAsync(courseId)
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
          <DialogTitle>{t('students.enroll.title')}</DialogTitle>
          <DialogDescription>
            {t('students.enroll.description')}
          </DialogDescription>
        </DialogHeader>
        <form id="enroll-form" className="grid gap-2" onSubmit={onSubmit}>
          <Label>{t('common.course')}</Label>
          <Select value={courseId} onValueChange={setCourseId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t('students.enroll.select_course')} />
            </SelectTrigger>
            <SelectContent>
              {available.length === 0 ? (
                <div className="text-muted-foreground px-2 py-1.5 text-sm">
                  {t('students.enroll.none_available')}
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
            disabled={enroll.isPending}
          >
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            form="enroll-form"
            disabled={enroll.isPending || available.length === 0}
          >
            {enroll.isPending
              ? t('students.enroll.busy')
              : t('students.enroll.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
