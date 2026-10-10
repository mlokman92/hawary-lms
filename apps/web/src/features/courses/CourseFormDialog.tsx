import { useEffect, useState, type FormEvent } from 'react'
import { senToRinggit, ringgitToSen } from '@hawary/shared'
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
import { errorMessage } from '@/lib/errors'

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
  const { t } = useT()
  const createCourse = useCreateCourse(academyId)
  const updateCourse = useUpdateCourse(academyId)

  const [title, setTitle] = useState('')
  const [code, setCode] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<CourseStatus>('draft')
  const [price, setPrice] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setTitle(course?.title ?? '')
    setCode(course?.code ?? '')
    setDescription(course?.description ?? '')
    setStatus(course?.status ?? 'draft')
    setPrice(course ? senToRinggit(course.price_sen) : '')
    setStartDate(course?.start_date ?? '')
    setEndDate(course?.end_date ?? '')
    setError(null)
  }, [open, course])

  const busy = createCourse.isPending || updateCourse.isPending

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) {
      setError(t('courses.form.title_required'))
      return
    }
    // yyyy-mm-dd sorts as text, so this is the same comparison the
    // courses_dates_ordered constraint makes — said here in the reader's
    // language rather than as a raw check violation.
    if (startDate && endDate && endDate < startDate) {
      setError(t('courses.form.dates_order'))
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
      start_date: startDate || null,
      end_date: endDate || null,
    }
    try {
      if (isEdit && course) {
        await updateCourse.mutateAsync({ id: course.id, patch: fields })
      } else {
        await createCourse.mutateAsync({ ...fields, created_by: user?.id ?? null })
      }
      onOpenChange(false)
    } catch (err) {
      setError(errorMessage(err, t('common.error')))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t('courses.edit') : t('courses.new')}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? t('courses.form.description_edit')
              : t('courses.form.description_new')}
          </DialogDescription>
        </DialogHeader>

        <form id="course-form" className="grid gap-4" onSubmit={onSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="title">{t('common.title')}</Label>
            <Input
              id="title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('courses.form.title_placeholder')}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="code">{t('courses.form.code')}</Label>
              <Input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={t('courses.form.code_placeholder')}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="price">{t('courses.form.price')}</Label>
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
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="start-date">{t('courses.form.start_date')}</Label>
              <Input
                id="start-date"
                type="date"
                value={startDate}
                max={endDate || undefined}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="end-date">{t('courses.form.end_date')}</Label>
              <Input
                id="end-date"
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="description">{t('courses.form.description')}</Label>
            <Textarea
              id="description"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('courses.form.description_placeholder')}
            />
          </div>
          <div className="grid gap-2">
            <Label>{t('common.status')}</Label>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as CourseStatus)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">{t('common.draft')}</SelectItem>
                <SelectItem value="published">
                  {t('common.published')}
                </SelectItem>
                <SelectItem value="archived">
                  {t('courses.status.archived')}
                </SelectItem>
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
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="course-form" disabled={busy}>
            {busy
              ? t('common.saving')
              : isEdit
                ? t('courses.form.save_changes')
                : t('courses.form.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
