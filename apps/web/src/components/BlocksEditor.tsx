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
import { uploadPublicImage } from '@/lib/storage'
import { useT } from '@/lib/i18n'
import {
  newBlock,
  youtubeId,
  type Block,
  type BlockType,
  type ImageBlock,
  type YoutubeBlock,
} from '@/lib/blocks'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

function ImageBlockEditor({
  block,
  academyId,
  bucket,
  onChange,
}: {
  block: ImageBlock
  academyId: string
  bucket: string
  onChange: (b: ImageBlock) => void
}) {
  const { t } = useT()
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    setErr(null)
    try {
      const url = await uploadPublicImage(bucket, academyId, file)
      onChange({ ...block, url })
    } catch (er) {
      setErr(er instanceof Error ? er.message : t('upload.failed'))
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
          {t('notes.blocks.no_image')}
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
          <Upload />{' '}
          {busy
            ? t('common.uploading')
            : block.url
              ? t('notes.blocks.replace_image')
              : t('notes.blocks.upload_image')}
        </Button>
      </div>
      <Input
        value={block.caption}
        onChange={(e) => onChange({ ...block, caption: e.target.value })}
        placeholder={t('notes.blocks.caption_placeholder')}
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
  const { t } = useT()
  const vid = youtubeId(block.url)
  return (
    <div className="grid gap-2">
      <Input
        value={block.url}
        onChange={(e) => onChange({ ...block, url: e.target.value })}
        placeholder={t('notes.blocks.youtube_placeholder')}
      />
      {block.url ? (
        vid ? (
          <div className="aspect-video overflow-hidden rounded-md border">
            <iframe
              className="h-full w-full"
              src={`https://www.youtube.com/embed/${vid}`}
              title={t('notes.blocks.youtube_title')}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        ) : (
          <p className="text-destructive text-xs">
            {t('notes.blocks.youtube_invalid')}
          </p>
        )
      ) : null}
    </div>
  )
}

function BlockCard({
  block,
  academyId,
  bucket,
  first,
  last,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  block: Block
  academyId: string
  bucket: string
  first: boolean
  last: boolean
  onChange: (b: Block) => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  const { t } = useT()
  return (
    <div className="group relative rounded-lg border p-3">
      <div className="bg-background absolute top-2 right-2 flex items-center rounded-md border opacity-0 shadow-sm group-hover:opacity-100">
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          disabled={first}
          onClick={onMoveUp}
          aria-label={t('notes.blocks.move_up')}
        >
          <ArrowUp />
        </Button>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          disabled={last}
          onClick={onMoveDown}
          aria-label={t('notes.blocks.move_down')}
        >
          <ArrowDown />
        </Button>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          onClick={onRemove}
          aria-label={t('notes.blocks.remove')}
        >
          <Trash2 />
        </Button>
      </div>
      {block.type === 'text' ? (
        <Textarea
          value={block.text}
          onChange={(e) => onChange({ ...block, text: e.target.value })}
          placeholder={t('notes.blocks.text_placeholder')}
          rows={4}
        />
      ) : block.type === 'image' ? (
        <ImageBlockEditor
          block={block}
          academyId={academyId}
          bucket={bucket}
          onChange={onChange}
        />
      ) : (
        <YoutubeBlockEditor block={block} onChange={onChange} />
      )}
    </div>
  )
}

export function BlocksEditor({
  academyId,
  bucket,
  blocks,
  onChange,
}: {
  academyId: string
  bucket: string
  blocks: Block[]
  onChange: (blocks: Block[]) => void
}) {
  const { t } = useT()
  const add = (type: BlockType) => onChange([...blocks, newBlock(type)])
  const change = (i: number, b: Block) =>
    onChange(blocks.map((x, idx) => (idx === i ? b : x)))
  const remove = (i: number) => onChange(blocks.filter((_, idx) => idx !== i))
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= blocks.length) return
    const next = [...blocks]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }

  return (
    <div className="space-y-3">
      {blocks.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {t('notes.blocks.empty')}
        </p>
      ) : (
        blocks.map((b, i) => (
          <BlockCard
            key={b.id}
            block={b}
            academyId={academyId}
            bucket={bucket}
            first={i === 0}
            last={i === blocks.length - 1}
            onChange={(nb) => change(i, nb)}
            onRemove={() => remove(i)}
            onMoveUp={() => move(i, -1)}
            onMoveDown={() => move(i, 1)}
          />
        ))
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => add('text')}>
          <Plus /> {t('notes.blocks.add_text')}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => add('image')}>
          <ImageIcon /> {t('notes.blocks.add_image')}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => add('youtube')}>
          <Video /> YouTube
        </Button>
      </div>
    </div>
  )
}
