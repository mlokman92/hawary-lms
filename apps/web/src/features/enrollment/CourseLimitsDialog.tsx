import { useEffect, useState, type FormEvent } from 'react'
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
import { useSaveCourseOpening, type CourseOpening } from './api'
import { errorMessage } from '@/lib/errors'

/** ISO instant -> the yyyy-mm-dd an <input type="date"> wants, in local time. */
function toDateInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * "Stop on the 14th" means the 14th is still a day you can request, so the
 * stored instant is the END of the chosen day in the browser's timezone — which
 * for this product is always Malaysia.
 */
function fromDateInput(value: string): string | null {
  if (!value) return null
  const d = new Date(`${value}T23:59:59`)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export function CourseLimitsDialog({
  academyId,
  course,
  open,
  onOpenChange,
}: {
  academyId: string
  course: CourseOpening | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useT()
  const save = useSaveCourseOpening(academyId)
  const [capacity, setCapacity] = useState('')
  const [closesAt, setClosesAt] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !course) return
    setCapacity(course.capacity != null ? String(course.capacity) : '')
    setClosesAt(toDateInput(course.closesAt))
    setError(null)
  }, [open, course])

  if (!course) return null

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!course) return
    const seats = capacity.trim() === '' ? null : Number(capacity)
    if (seats !== null && (!Number.isInteger(seats) || seats < 1)) {
      setError(t('enroll.limits.capacity_hint'))
      return
    }
    setError(null)
    try {
      await save.mutateAsync({
        courseId: course.id,
        capacity: seats,
        closes_at: fromDateInput(closesAt),
      })
      onOpenChange(false)
    } catch (err) {
      setError(errorMessage(err, t('common.error')))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('enroll.limits.title')}</DialogTitle>
          <DialogDescription>
            {t('enroll.limits.description', { course: course.title })}
          </DialogDescription>
        </DialogHeader>

        <form id="course-limits-form" className="grid gap-4" onSubmit={onSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="capacity">{t('enroll.limits.capacity')}</Label>
            <Input
              id="capacity"
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              {t('enroll.limits.capacity_hint')}
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="closes-at">{t('enroll.limits.closes_at')}</Label>
            <Input
              id="closes-at"
              type="date"
              value={closesAt}
              onChange={(e) => setClosesAt(e.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              {t('enroll.limits.closes_at_hint')}
            </p>
          </div>
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
        </form>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={save.isPending}
            onClick={() => onOpenChange(false)}
          >
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="course-limits-form" disabled={save.isPending}>
            {save.isPending ? t('common.saving') : t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
