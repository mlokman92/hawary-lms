import { useState } from 'react'
import type { Json } from '@hawary/shared'
import { parseBlocks, type Block } from '@/lib/blocks'
import { BlocksEditor } from '@/components/BlocksEditor'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useUpdateNote, type Note } from './api'

export function NoteEditor({
  academyId,
  courseId,
  note,
}: {
  academyId: string
  courseId: string
  note: Note
}) {
  const updateNote = useUpdateNote(academyId, courseId)
  const [title, setTitle] = useState(note.title)
  const [published, setPublished] = useState(note.is_published)
  const [blocks, setBlocks] = useState<Block[]>(() => parseBlocks(note.body))
  const [dirty, setDirty] = useState(false)

  async function save() {
    await updateNote.mutateAsync({
      id: note.id,
      patch: {
        title: title.trim() || 'Untitled',
        is_published: published,
        body: blocks as unknown as Json,
      },
    })
    setDirty(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value)
            setDirty(true)
          }}
          placeholder="Untitled"
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
          {published ? 'Published' : 'Draft'}
        </Button>
        <Button onClick={save} disabled={updateNote.isPending || !dirty}>
          {updateNote.isPending ? 'Saving…' : dirty ? 'Save' : 'Saved'}
        </Button>
      </div>

      <BlocksEditor
        academyId={academyId}
        bucket="note-media"
        blocks={blocks}
        onChange={(b) => {
          setBlocks(b)
          setDirty(true)
        }}
      />
    </div>
  )
}
