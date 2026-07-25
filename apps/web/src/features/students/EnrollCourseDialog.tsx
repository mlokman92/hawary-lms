import { useState, type FormEvent } from 'react'
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
  const { data: courses } = useCourses(academyId)
  const enroll = useEnrollStudent(academyId, studentId)
  const [courseId, setCourseId] = useState('')
  const [error, setError] = useState<string | null>(null)

  const available = (courses ?? []).filter(
    (c) => c.status !== 'archived' && !enrolledCourseIds.includes(c.id),
  )

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!courseId) return setError('Select a course.')
    setError(null)
    try {
      await enroll.mutateAsync(courseId)
      setCourseId('')
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enroll in a course</DialogTitle>
          <DialogDescription>
            Add this student to one of your academy’s courses.
          </DialogDescription>
        </DialogHeader>
        <form id="enroll-form" className="grid gap-2" onSubmit={onSubmit}>
          <Label>Course</Label>
          <Select value={courseId} onValueChange={setCourseId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a course" />
            </SelectTrigger>
            <SelectContent>
              {available.length === 0 ? (
                <div className="text-muted-foreground px-2 py-1.5 text-sm">
                  No available courses
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
            Cancel
          </Button>
          <Button
            type="submit"
            form="enroll-form"
            disabled={enroll.isPending || available.length === 0}
          >
            {enroll.isPending ? 'Enrolling…' : 'Enroll'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
