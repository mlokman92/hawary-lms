import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Trash2 } from 'lucide-react'
import type { Json } from '@hawary/shared'
import { parseBlocks, type Block } from '@/lib/blocks'
import { useAcademy } from '@/lib/academy'
import { useT } from '@/lib/i18n'
import { BlocksEditor } from '@/components/BlocksEditor'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  useAssignment,
  useDeleteAssignment,
  useUpdateAssignment,
} from '@/features/assignments/api'

export function AssignmentEditorPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t } = useT()
  const { activeAcademyId, active } = useAcademy()
  const academyId = activeAcademyId ?? ''
  const isStaff = active?.role === 'admin' || active?.role === 'trainer'

  const { data: assignment, isLoading, error } = useAssignment(id)
  const courseId = assignment?.course_id ?? ''
  const update = useUpdateAssignment(academyId, courseId)
  const del = useDeleteAssignment(academyId, courseId)

  const [title, setTitle] = useState('')
  const [published, setPublished] = useState(false)
  const [blocks, setBlocks] = useState<Block[]>([])
  const [dueDate, setDueDate] = useState('')
  const [points, setPoints] = useState(100)
  const [allowLate, setAllowLate] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [seeded, setSeeded] = useState(false)

  useEffect(() => {
    if (seeded || !assignment) return
    setTitle(assignment.title)
    setPublished(assignment.is_published)
    setBlocks(parseBlocks(assignment.instructions))
    setDueDate(assignment.due_at ? assignment.due_at.slice(0, 10) : '')
    setPoints(Number(assignment.total_points))
    setAllowLate(assignment.allow_late)
    setSeeded(true)
  }, [seeded, assignment])

  async function onSave() {
    if (!assignment) return
    await update.mutateAsync({
      id: assignment.id,
      patch: {
        title: title.trim() || t('assign.untitled'),
        is_published: published,
        instructions: blocks as unknown as Json,
        due_at: dueDate ? new Date(`${dueDate}T23:59:59`).toISOString() : null,
        total_points: points,
        allow_late: allowLate,
      },
    })
    setDirty(false)
  }

  if (isLoading) {
    return (
      <div className="text-muted-foreground py-16 text-center text-sm">
        {t('common.loading')}
      </div>
    )
  }
  if (error || !assignment) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <p className="text-muted-foreground text-sm">{t('assign.not_found')}</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/courses">{t('assign.back_to_courses')}</Link>
        </Button>
      </div>
    )
  }

  const touch = () => setDirty(true)

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div className="flex items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to={`/courses/${courseId}`}>
            <ArrowLeft /> {t('common.course')}
          </Link>
        </Button>
        {isStaff ? (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={published ? 'default' : 'outline'}
              onClick={() => {
                setPublished((p) => !p)
                touch()
              }}
            >
              {published ? t('common.published') : t('common.draft')}
            </Button>
            <Button onClick={onSave} disabled={update.isPending || !dirty}>
              {update.isPending
                ? t('common.saving')
                : dirty
                  ? t('common.save')
                  : t('common.saved')}
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={t('assign.delete.action')}
                >
                  <Trash2 />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {t('assign.delete.confirm_title')}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('assign.delete.confirm_body', {
                      title: title || t('common.untitled'),
                    })}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={async () => {
                      await del.mutateAsync(assignment.id)
                      navigate(`/courses/${courseId}`)
                    }}
                  >
                    {t('common.delete')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ) : null}
      </div>

      <Input
        value={title}
        onChange={(e) => {
          setTitle(e.target.value)
          touch()
        }}
        placeholder={t('assign.untitled')}
        className="h-11 text-lg font-semibold md:text-lg"
        disabled={!isStaff}
      />

      <Card>
        <CardHeader>
          <CardTitle>{t('assign.section.brief')}</CardTitle>
        </CardHeader>
        <CardContent>
          <BlocksEditor
            // The row's own tenant, not the ambient active academy: storage RLS
            // checks this path segment, and staff access to this row proves it.
            academyId={assignment.academy_id}
            bucket="note-media"
            blocks={blocks}
            onChange={(b) => {
              setBlocks(b)
              touch()
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('assign.section.settings')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="grid gap-2">
            <Label htmlFor="due">{t('assign.due_date')}</Label>
            <Input
              id="due"
              type="date"
              value={dueDate}
              onChange={(e) => {
                setDueDate(e.target.value)
                touch()
              }}
              disabled={!isStaff}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="points">{t('assign.total_points')}</Label>
            <Input
              id="points"
              type="number"
              min="0"
              step="1"
              value={points}
              onChange={(e) => {
                setPoints(Number(e.target.value) || 0)
                touch()
              }}
              disabled={!isStaff}
            />
          </div>
          <div className="grid gap-2">
            <Label>{t('assign.late.label')}</Label>
            <Button
              type="button"
              variant={allowLate ? 'default' : 'outline'}
              className="justify-start"
              disabled={!isStaff}
              onClick={() => {
                setAllowLate((a) => !a)
                touch()
              }}
            >
              {allowLate ? t('assign.late.allowed') : t('assign.late.not_allowed')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
