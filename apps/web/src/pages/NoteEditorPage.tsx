import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { useAcademy } from '@/lib/academy'
import { useT } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
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
import { NoteEditor } from '@/features/notes/NoteEditor'
import { useDeleteNote, useNote } from '@/features/notes/api'

export function NoteEditorPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { activeAcademyId, active } = useAcademy()
  const { t } = useT()
  const academyId = activeAcademyId ?? ''
  const isStaff = active?.role === 'admin' || active?.role === 'trainer'

  const { data: note, isLoading, error } = useNote(id)
  const courseId = note?.course_id ?? ''
  const del = useDeleteNote(academyId, courseId)
  const [deleting, setDeleting] = useState(false)

  if (isLoading) {
    return (
      <div className="text-muted-foreground py-16 text-center text-sm">
        {t('common.loading')}
      </div>
    )
  }
  if (error || !note) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <p className="text-muted-foreground text-sm">{t('notes.not_found')}</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/courses">{t('notes.back_to_courses')}</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div className="flex items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to={`/courses/${courseId}`}>
            <ArrowLeft /> {t('common.course')}
          </Link>
        </Button>
        {isStaff ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={deleting}>
                <Trash2 /> {t('common.delete')}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('notes.delete.title')}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t('notes.delete.body', {
                    title: note.title || t('common.untitled'),
                  })}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={async () => {
                    setDeleting(true)
                    await del.mutateAsync(note.id)
                    navigate(`/courses/${courseId}`, { replace: true })
                  }}
                >
                  {t('common.delete')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </div>

      <NoteEditor note={note} academyId={academyId} courseId={courseId} />
    </div>
  )
}
