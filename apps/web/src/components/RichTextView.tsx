import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'

/**
 * Read-only renderer for note HTML.
 *
 * Deliberately NOT dangerouslySetInnerHTML: notes.content is author-supplied
 * HTML and the app ships no sanitizer. Parsing it through the tiptap schema
 * means only nodes/marks the schema knows survive — scripts, event handlers and
 * unknown attributes are dropped on the way in, and the DOM is rebuilt from the
 * parsed document rather than from the raw string.
 *
 * Uses the same extension set as the editor so what a trainer writes is what a
 * student sees.
 */
export function RichTextView({ html }: { html: string }) {
  const editor = useEditor({
    editable: false,
    content: html || '',
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: {
          openOnClick: true,
          autolink: true,
          HTMLAttributes: {
            rel: 'noopener noreferrer nofollow',
            target: '_blank',
          },
        },
      }),
      Image.configure({ inline: false, allowBase64: false }),
    ],
    editorProps: {
      attributes: { class: 'tiptap text-sm leading-7 focus:outline-none' },
    },
  })

  if (!editor) return null
  return <EditorContent editor={editor} />
}
