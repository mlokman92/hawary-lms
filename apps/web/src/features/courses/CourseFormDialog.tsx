import { useEffect, useState, type FormEvent } from 'react'
import { senToRinggit, ringgitToSen } from '@hawary/shared'
import { useAuth } from '@/lib/auth'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  useCreateCourse,
  useUpdateCourse,
  type Course,
  type CourseStatus,
} from './api'

export function CourseFormDialog({
  academyId,
  course,
  open,
  onOpenChange,
}: {
  academyId: string
  course?: Course | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const isEdit = !!course
  const { user } = useAuth()
  const createCourse = useCreateCourse(academyId)
  const updateCourse = useUpdateCourse(academyId)

  const [title, setTitle] = useState('')
  const [code, setCode] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<CourseStatus>('draft')
  const [price, setPrice] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setTitle(course?.title ?? '')
    setCode(course?.code ?? '')
    setDescription(course?.description ?? '')
    setStatus(course?.status ?? 'draft')
    setPrice(course ? senToRinggit(course.price_sen) : '')
    setError(null)
  }, [open, course])

  const busy = createCourse.isPending || updateCourse.isPending

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) {
      setError('Title is required.')
      return
    }
    setError(null)
    const fields = {
      title: title.trim(),
      code: code.trim() || null,
      description: description.trim() || null,
      status,
      price_sen: ringgitToSen(price),
      currency: 'MYR',
    }
    try {
      if (isEdit && course) {
        await updateCourse.mutateAsync({ id: course.id, patch: fields })
      } else {
        await createCourse.mutateAsync({ ...fields, created_by: user?.id ?? null })
      }
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit course' : 'New course'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update this course’s details.'
              : 'Create a course for your academy.'}
          </DialogDescription>
        </DialogHeader>

        <form id="course-form" className="grid gap-4" onSubmit={onSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Certified Welding — Level 1"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="code">Code (optional)</Label>
              <Input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="WELD-101"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="price">Price (RM)</Label>
              <Input
                id="price"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this course covers…"
            />
          </div>
          <div className="grid gap-2">
            <Label>Status</Label>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as CourseStatus)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="published">Published</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
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
            Cancel
          </Button>
          <Button type="submit" form="course-form" disabled={busy}>
            {busy ? 'Saving…' : isEdit ? 'Save changes' : 'Create course'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
