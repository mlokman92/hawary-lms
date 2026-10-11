import { Node, mergeAttributes } from '@tiptap/react'

/**
 * A recorded lecture inside a note: one `<video>` the student plays in place.
 *
 * It is a node of its own — not allowed to ride through as raw HTML — because
 * the schema is what keeps note content safe (see RichTextView). Both the
 * editor and the viewer register it, so a trainer who opens a note that holds a
 * video and saves it does not silently strip the video out.
 *
 * `src` must be https; anything else fails to parse and the node is dropped.
 * The URL is whatever the author stored: if it points at a public bucket, it is
 * as shareable as the link itself.
 */
export const LectureVideo = Node.create({
  name: 'lectureVideo',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return { src: { default: null } }
  },

  parseHTML() {
    return [
      {
        tag: 'video[src]',
        getAttrs: (el) => {
          if (typeof el === 'string') return false
          const src = el.getAttribute('src') ?? ''
          return /^https:\/\//i.test(src) ? { src } : false
        },
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'video',
      mergeAttributes(HTMLAttributes, {
        controls: '',
        controlsList: 'nodownload',
        playsinline: '',
        // A 3-hour file: fetch the index only, never the whole thing up front.
        preload: 'metadata',
      }),
    ]
  },
})
