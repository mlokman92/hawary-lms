import { useRef, useState, type ChangeEvent } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Image as ImageIcon,
  Plus,
  Trash2,
  Upload,
  Video,
} from 'lucide-react'
import type { Json } from '@hawary/shared'
import { uploadPublicImage } from '@/lib/storage'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  newBlock,
  parseBlocks,
  youtubeId,
  type Block,
  type BlockType,
  type ImageBlock,
  type YoutubeBlock,
} from './blocks'
import { useUpdateNote, type Note } from './api'

function ImageBlockEditor({
  block,
  academyId,
  onChange,
}: {
  block: ImageBlock
  academyId: string
  onChange: (b: ImageBlock) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    setErr(null)
    try {
      const url = await uploadPublicImage('note-media', academyId, file)
      onChange({ ...block, url })
    } catch (er) {
      setErr(er instanceof Error ? er.message : 'Upload failed')
    } finally {
      setBusy(false)
      if (ref.current) ref.current.value = ''
    }
  }

  return (
    <div className="grid gap-2">
      {block.url ? (
        <img
          src={block.url}
          alt={block.caption}
          className="max-h-72 rounded-md border object-contain"
        />
      ) : (
        <div className="text-muted-foreground rounded-md border border-dashed p-6 text-center text-sm">
          No image yet
        </div>
      )}
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onFile}
      />
      <div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => ref.current?.click()}
        >
          <Upload /> {busy ? 'Uploading…' : block.url ? 'Replace' : 'Upload image'}
        </Button>
      </div>
      <Input
        value={block.caption}
        onChange={(e) => onChange({ ...block, caption: e.target.value })}
        placeholder="Caption (optional)"
      />
      {err ? <p className="text-destructive text-xs">{err}</p> : null}
    </div>
  )
}

function YoutubeBlockEditor({
  block,
  onChange,
}: {
  block: YoutubeBlock
  onChange: (b: YoutubeBlock) => void
}) {
  const vid = youtubeId(block.url)
  return (
    <div className="grid gap-2">
      <Input
        value={block.url}
        onChange={(e) => onChange({ ...block, url: e.target.value })}
        placeholder="Paste a YouTube link…"
      />
      {block.url ? (
        vid ? (
          <div className="aspect-video overflow-hidden rounded-md border">
            <iframe
              className="h-full w-full"
              src={`https://www.youtube.com/embed/${vid}`}
              title="YouTube video"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        ) : (
          <p className="text-destructive text-xs">
            Not a recognised YouTube URL.
          </p>
        )
      ) : null}
    </div>
  )
}

function BlockCard({
  block,
  academyId,
  first,
  last,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  block: Block
  academyId: string
  first: boolean
  last: boolean
  onChange: (b: Block) => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  return (
    <div className="group relative rounded-lg border p-3">
      <div className="bg-background absolute top-2 right-2 flex items-center rounded-md border opacity-0 shadow-sm group-hover:opacity-100">
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          disabled={first}
          onClick={onMoveUp}
          aria-label="Move up"
        >
          <ArrowUp />
        </Button>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          disabled={last}
          onClick={onMoveDown}
          aria-label="Move down"
        >
          <ArrowDown />
        </Button>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          onClick={onRemove}
          aria-label="Remove block"
        >
          <Trash2 />
        </Button>
      </div>
      {block.type === 'text' ? (
        <Textarea
          value={block.text}
          onChange={(e) => onChange({ ...block, text: e.target.value })}
          placeholder="Write…"
          rows={4}
        />
      ) : block.type === 'image' ? (
        <ImageBlockEditor
          block={block}
          academyId={academyId}
          onChange={onChange}
        />
      ) : (
        <YoutubeBlockEditor block={block} onChange={onChange} />
      )}
    </div>
  )
}

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

  const editBlocks = (next: Block[]) => {
    setBlocks(next)
    setDirty(true)
  }
  const addBlock = (type: BlockType) => editBlocks([...blocks, newBlock(type)])
  const changeBlock = (i: number, b: Block) =>
    editBlocks(blocks.map((x, idx) => (idx === i ? b : x)))
  const removeBlock = (i: number) =>
    editBlocks(blocks.filter((_, idx) => idx !== i))
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= blocks.length) return
    const next = [...blocks]
    ;[next[i], next[j]] = [next[j], next[i]]
    editBlocks(next)
  }

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

      {blocks.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Empty note. Add a block below.
        </p>
      ) : (
        <div className="space-y-3">
          {blocks.map((b, i) => (
            <BlockCard
              key={b.id}
              block={b}
              academyId={academyId}
              first={i === 0}
              last={i === blocks.length - 1}
              onChange={(nb) => changeBlock(i, nb)}
              onRemove={() => removeBlock(i)}
              onMoveUp={() => move(i, -1)}
              onMoveDown={() => move(i, 1)}
            />
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => addBlock('text')}
        >
          <Plus /> Text
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => addBlock('image')}
        >
          <ImageIcon /> Image
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => addBlock('youtube')}
        >
          <Video /> YouTube
        </Button>
      </div>
    </div>
  )
}
