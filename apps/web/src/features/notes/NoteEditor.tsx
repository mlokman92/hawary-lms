import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useT } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useUpdateNote, type Note } from './api'

// Tiptap is heavy; keep it out of the main bundle — it loads when a note opens.
const RichTextEditor = lazy(() =>
  import('@/components/RichTextEditor').then((m) => ({
    default: m.RichTextEditor,
  })),
)

export function NoteEditor({
  academyId,
  courseId,
  note,
}: {
  academyId: string
  courseId: string
  note: Note
}) {
  const { t } = useT()
  const updateNote = useUpdateNote(academyId, courseId)
  const [title, setTitle] = useState(note.title)
  const [published, setPublished] = useState(note.is_published)
  const [content, setContent] = useState(note.content)
  const [dirty, setDirty] = useState(false)

  // The stored fallback title a blank field saves as. Read from `t` so it
  // matches the language the note was written in.
  const untitled = t('common.untitled')

  async function save() {
    await updateNote.mutateAsync({
      id: note.id,
      patch: {
        title: title.trim() || untitled,
        is_published: published,
        content,
      },
    })
    setDirty(false)
  }

  // Flush unsaved edits when the editor unmounts. NotesPage keys this component
  // by note id, so switching notes (or the course) unmounts it — without this,
  // in-progress typing would be silently discarded. Refs hold the latest values
  // and mutate fn so the unmount-only cleanup ([] deps) never fires per-render
  // and never captures stale state.
  const latest = useRef({
    title,
    content,
    published,
    dirty,
    id: note.id,
    untitled,
  })
  latest.current = { title, content, published, dirty, id: note.id, untitled }
  const mutateRef = useRef(updateNote.mutate)
  mutateRef.current = updateNote.mutate
  useEffect(() => {
    return () => {
      const s = latest.current
      if (!s.dirty) return
      mutateRef.current({
        id: s.id,
        patch: {
          title: s.title.trim() || s.untitled,
          is_published: s.published,
          content: s.content,
        },
      })
    }
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value)
            setDirty(true)
          }}
          placeholder={untitled}
          className="h-10 flex-1 text-base font-semibold md:text-base"
        />
        <Button
          type="button"
          variant={published ? 'default' : 'outline'}
          onClick={() => {
            setPublished((p) => !p)
            setDirty(true)
          }}
        >
          {published ? t('common.published') : t('common.draft')}
        </Button>
        <Button onClick={save} disabled={updateNote.isPending || !dirty}>
          {updateNote.isPending
            ? t('common.saving')
            : dirty
              ? t('common.save')
              : t('common.saved')}
        </Button>
      </div>

      <p className="text-muted-foreground text-xs">{t('notes.tip_format')}</p>

      <Suspense
        fallback={
          <div className="text-muted-foreground grid min-h-[24rem] place-items-center rounded-md border text-sm">
            {t('notes.editor_loading')}
          </div>
        }
      >
        <RichTextEditor
          value={content}
          // The note's own tenant, not the ambient active academy: uploads are
          // stored under <academy_id>/ and checked against it server-side.
          academyId={note.academy_id}
          onChange={(html) => {
            setContent(html)
            setDirty(true)
          }}
        />
      </Suspense>
    </div>
  )
}
