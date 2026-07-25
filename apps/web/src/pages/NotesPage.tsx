import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useAcademy } from '@/lib/academy'
import { useAuth } from '@/lib/auth'
import { useCourses } from '@/features/courses/api'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { NoteTree } from '@/features/notes/NoteTree'
import { NoteEditor } from '@/features/notes/NoteEditor'
import {
  buildTree,
  useCreateNote,
  useDeleteNote,
  useNotes,
  type NoteNode,
} from '@/features/notes/api'

export function NotesPage() {
  const { activeAcademyId, active } = useAcademy()
  const { user } = useAuth()
  const academyId = activeAcademyId ?? ''
  const isStaff = active?.role === 'admin' || active?.role === 'trainer'
  const { data: courses } = useCourses(activeAcademyId)

  const [params, setParams] = useSearchParams()
  const courseId = params.get('course') ?? ''
  const setCourseId = (id: string) =>
    setParams(id ? { course: id } : {}, { replace: true })

  // Default to the first course.
  useEffect(() => {
    if (!courseId && courses && courses.length > 0) {
      setParams({ course: courses[0].id }, { replace: true })
    }
  }, [courseId, courses, setParams])

  const { data: notes, isLoading } = useNotes(
    activeAcademyId,
    courseId || null,
  )
  const tree = useMemo(() => buildTree(notes ?? []), [notes])
  const createNote = useCreateNote(academyId, courseId)
  const deleteNote = useDeleteNote(academyId, courseId)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<NoteNode | null>(null)
  const selected = (notes ?? []).find((n) => n.id === selectedId) ?? null

  async function addNote(parentId: string | null) {
    const note = await createNote.mutateAsync({
      title: 'Untitled',
      parent_id: parentId,
      created_by: user?.id ?? null,
    })
    setSelectedId(note.id)
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    await deleteNote.mutateAsync(deleteTarget.id)
    if (selectedId === deleteTarget.id) setSelectedId(null)
    setDeleteTarget(null)
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Notes</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Course material, organised as a folder tree.
          </p>
        </div>
        {courses && courses.length > 0 ? (
          <Select
            value={courseId}
            onValueChange={(v) => {
              setCourseId(v)
              setSelectedId(null)
            }}
          >
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Select a course" />
            </SelectTrigger>
            <SelectContent>
              {courses.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>

      <div className="mt-6">
        {!courses || courses.length === 0 ? (
          <div className="text-muted-foreground rounded-xl border border-dashed p-10 text-center text-sm">
            Create a course first.{' '}
            <Link
              to="/courses"
              className="text-primary underline-offset-4 hover:underline"
            >
              Go to courses
            </Link>
          </div>
        ) : !courseId ? (
          <div className="text-muted-foreground rounded-xl border border-dashed p-10 text-center text-sm">
            Select a course to view its notes.
          </div>
        ) : !isStaff ? (
          <div className="text-muted-foreground rounded-xl border p-10 text-center text-sm">
            Notes are managed by your trainers.
          </div>
        ) : (
          <div className="flex flex-col gap-4 lg:flex-row">
            <aside className="w-full shrink-0 rounded-xl border p-2 lg:w-72">
              <Button
                size="sm"
                className="w-full"
                onClick={() => addNote(null)}
                disabled={createNote.isPending}
              >
                <Plus /> New note
              </Button>
              <div className="mt-2">
                {isLoading ? (
                  <p className="text-muted-foreground px-2 py-4 text-center text-xs">
                    Loading…
                  </p>
                ) : (
                  <NoteTree
                    tree={tree}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                    onAddChild={(pid) => addNote(pid)}
                    onDelete={setDeleteTarget}
                  />
                )}
              </div>
            </aside>
            <div className="min-w-0 flex-1 rounded-xl border p-4">
              {selected ? (
                <NoteEditor
                  key={selected.id}
                  note={selected}
                  academyId={academyId}
                  courseId={courseId}
                />
              ) : (
                <div className="text-muted-foreground grid min-h-64 place-items-center text-sm">
                  Select or create a note to start editing.
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this note?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleteTarget?.title || 'Untitled'}”
              {deleteTarget && deleteTarget.children.length > 0
                ? ` and its ${deleteTarget.children.length} subnote(s)`
                : ''}{' '}
              will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
