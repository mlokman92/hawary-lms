import { useRef, useState, type ChangeEvent } from 'react'
import { useEditor, useEditorState, EditorContent, type Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Image from '@tiptap/extension-image'
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  ImagePlus,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
  Strikethrough,
  Underline as UnderlineIcon,
} from 'lucide-react'
import { uploadPublicImage } from '@/lib/storage'
import { useT } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { errorMessage } from '@/lib/errors'

/** Image files out of a paste/drop payload, ignoring anything else. */
function imageFilesFrom(dt: DataTransfer | null): File[] {
  return Array.from(dt?.files ?? []).filter((f) => f.type.startsWith('image/'))
}

function MenuButton({
  active,
  onClick,
  label,
  children,
}: {
  active?: boolean
  onClick: () => void
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      // Keep the selection while clicking a toolbar button.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex size-8 items-center justify-center rounded hover:bg-accent',
        active && 'bg-accent text-accent-foreground',
      )}
    >
      {children}
    </button>
  )
}

function Toolbar({ editor }: { editor: Editor }) {
  const { t } = useT()
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      code: e.isActive('code'),
      h1: e.isActive('heading', { level: 1 }),
      h2: e.isActive('heading', { level: 2 }),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      quote: e.isActive('blockquote'),
      link: e.isActive('link'),
    }),
  })

  function toggleLink() {
    const prev = editor.getAttributes('link').href as string | undefined
    const url = window.prompt(t('notes.rt.link_prompt'), prev ?? '')
    if (url === null) return
    const chain = editor.chain().focus().extendMarkRange('link')
    if (url === '') chain.unsetLink().run()
    else chain.setLink({ href: url }).run()
  }

  return (
    <div className="bg-popover text-popover-foreground flex items-center gap-0.5 rounded-lg border p-1 shadow-md">
      <MenuButton label={t('notes.rt.bold')} active={s.bold} onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold className="size-4" />
      </MenuButton>
      <MenuButton label={t('notes.rt.italic')} active={s.italic} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic className="size-4" />
      </MenuButton>
      <MenuButton label={t('notes.rt.underline')} active={s.underline} onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <UnderlineIcon className="size-4" />
      </MenuButton>
      <MenuButton label={t('notes.rt.strikethrough')} active={s.strike} onClick={() => editor.chain().focus().toggleStrike().run()}>
        <Strikethrough className="size-4" />
      </MenuButton>
      <MenuButton label={t('notes.rt.code')} active={s.code} onClick={() => editor.chain().focus().toggleCode().run()}>
        <Code className="size-4" />
      </MenuButton>
      <span className="bg-border mx-0.5 h-5 w-px" />
      <MenuButton label={t('notes.rt.heading_1')} active={s.h1} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
        <Heading1 className="size-4" />
      </MenuButton>
      <MenuButton label={t('notes.rt.heading_2')} active={s.h2} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
        <Heading2 className="size-4" />
      </MenuButton>
      <MenuButton label={t('notes.rt.bullet_list')} active={s.bullet} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <List className="size-4" />
      </MenuButton>
      <MenuButton label={t('notes.rt.numbered_list')} active={s.ordered} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListOrdered className="size-4" />
      </MenuButton>
      <MenuButton label={t('notes.rt.quote')} active={s.quote} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
        <Quote className="size-4" />
      </MenuButton>
      <span className="bg-border mx-0.5 h-5 w-px" />
      <MenuButton label={t('notes.rt.link')} active={s.link} onClick={toggleLink}>
        <LinkIcon className="size-4" />
      </MenuButton>
    </div>
  )
}

/**
 * Notion-style rich-text editor. Plain writing surface; selecting text pops up
 * a formatting toolbar (highlight → format). Content is HTML, stored as-is in
 * the note's `content` column. Remounts per note (keyed by the caller), so the
 * initial `value` is the source of truth on mount.
 *
 * Images upload to the `note-media` bucket under `academyId` and are inserted
 * as <img> in the HTML — by button, paste, or drag-and-drop.
 */
export function RichTextEditor({
  value,
  onChange,
  placeholder,
  academyId,
}: {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  /** Tenant the uploaded images belong to. Pass the record's own academy_id. */
  academyId: string
}) {
  const { t } = useT()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Resolved here rather than as a default parameter: a translated default
  // cannot be read before the hook runs.
  const placeholderText = placeholder ?? t('notes.rt.placeholder')

  // editorProps is built before `editor` exists, so paste/drop go through a ref
  // that is repointed at the real handler on every render.
  const insertRef = useRef<(files: File[]) => void>(() => {})

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: {
          openOnClick: false,
          autolink: true,
          HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
        },
      }),
      Placeholder.configure({ placeholder: placeholderText }),
      Image.configure({ inline: false, allowBase64: false }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class:
          'tiptap min-h-[24rem] rounded-md border px-4 py-3 text-sm leading-7 focus:outline-none',
      },
      handlePaste: (_view, event) => {
        const files = imageFilesFrom(event.clipboardData)
        if (files.length === 0) return false
        event.preventDefault()
        insertRef.current(files)
        return true
      },
      handleDrop: (_view, event, _slice, moved) => {
        // `moved` = dragging existing content within the doc; leave that alone.
        if (moved) return false
        const files = imageFilesFrom(event.dataTransfer)
        if (files.length === 0) return false
        event.preventDefault()
        insertRef.current(files)
        return true
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  })

  async function uploadAll(files: File[]) {
    if (!editor || files.length === 0) return
    setBusy(true)
    setError(null)
    try {
      // Sequential: each insert appends at the cursor, so parallel uploads
      // would land in a nondeterministic order.
      for (const file of files) {
        const url = await uploadPublicImage('note-media', academyId, file)
        editor
          .chain()
          .focus()
          .setImage({ src: url, alt: file.name })
          .createParagraphNear()
          .run()
      }
    } catch (err) {
      setError(errorMessage(err, t('upload.failed')))
    } finally {
      setBusy(false)
    }
  }

  insertRef.current = (files) => void uploadAll(files)

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = '' // let the same file be picked again
    void uploadAll(files)
  }

  if (!editor) return null

  return (
    <>
      <BubbleMenu editor={editor}>
        <Toolbar editor={editor} />
      </BubbleMenu>

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={onPick}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          <ImagePlus /> {busy ? t('common.uploading') : t('notes.rt.add_image')}
        </Button>
        <span className="text-muted-foreground text-xs">
          {t('notes.rt.paste_hint')}
        </span>
      </div>

      {error ? <p className="text-destructive mb-2 text-xs">{error}</p> : null}

      <EditorContent editor={editor} />
    </>
  )
}
