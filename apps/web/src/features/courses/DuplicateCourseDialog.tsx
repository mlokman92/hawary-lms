import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
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
import { useDuplicateCourse, type Course } from './api'

/**
 * Copy a course for a new intake.
 *
 * Two fields, both deliberate. The **title** is where the intake is recorded —
 * "Short Course Cohort 2" — because that is how the academy already names them;
 * there is no cohort entity behind this and none is being invented. The **code**
 * starts blank because it is uniquely indexed per academy, so it cannot be
 * inherited; the original is shown so it can be adapted rather than looked up.
 */
export function DuplicateCourseDialog({
  course,
  open,
  onOpenChange,
  academyId,
}: {
  course: Course | null
  open: boolean
  onOpenChange: (open: boolean) => void
  academyId: string
}) {
  const { t } = useT()
  const navigate = useNavigate()
  const duplicate = useDuplicateCourse(academyId)

  const [title, setTitle] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !course) return
    setTitle(t('courses.duplicate.title_default', { title: course.title }))
    setCode('')
    setError(null)
  }, [open, course, t])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!course) return
    if (!title.trim()) {
      setError(t('courses.form.title_required'))
      return
    }
    setError(null)
    try {
      const newId = await duplicate.mutateAsync({
        courseId: course.id,
        title: title.trim(),
        code: code.trim() || null,
      })
      onOpenChange(false)
      // Land on the copy: the next thing anyone does is check what came across
      // and set this intake's dates.
      navigate(`/courses/${newId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('courses.duplicate')}</DialogTitle>
          <DialogDescription>
            {t('courses.duplicate.description')}
          </DialogDescription>
        </DialogHeader>

        <form id="duplicate-course" className="grid gap-4" onSubmit={onSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="dup-title">{t('common.title')}</Label>
            <Input
              id="dup-title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="dup-code">{t('courses.form.code')}</Label>
            <Input
              id="dup-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t('courses.form.code_placeholder')}
            />
            <p className="text-muted-foreground text-xs">
              {course?.code
                ? t('courses.duplicate.code_hint', { code: course.code })
                : t('courses.duplicate.code_hint_none')}
            </p>
          </div>

          <div className="text-muted-foreground rounded-lg border p-3 text-xs leading-5">
            <p className="text-foreground font-medium">
              {t('courses.duplicate.copies.title')}
            </p>
            <p>{t('courses.duplicate.copies.body')}</p>
            <p className="mt-2">{t('courses.duplicate.skips.body')}</p>
          </div>

          {error ? <p className="text-destructive text-sm">{error}</p> : null}
        </form>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={duplicate.isPending}
          >
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            form="duplicate-course"
            disabled={duplicate.isPending}
          >
            {duplicate.isPending
              ? t('courses.duplicate.working')
              : t('courses.duplicate.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
