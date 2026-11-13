import { Node, mergeAttributes } from '@tiptap/react'

/**
 * A lecture recording kept on Google Drive, played in Drive's own player.
 *
 * Recordings run to gigabytes, past what Storage takes, and a Drive file that
 * large cannot be a `<video src>` — Drive answers with a "too large to scan"
 * page, not the file. Its `/preview` page streams it instead.
 *
 * Only the Drive file id is kept: the iframe's src is rebuilt from it, so a
 * note can frame Drive's preview page and nothing else. The file must be shared
 * "anyone with the link". Like LectureVideo, the editor and the viewer both
 * register it so saving a note does not strip the recording out. The Student
 * app shows note HTML in a web view, which plays the same iframe.
 */
const PREVIEW = /^https:\/\/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]+)\/preview/

export const DriveVideo = Node.create({
  name: 'driveVideo',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return { fileId: { default: null } }
  },

  parseHTML() {
    return [
      {
        tag: 'iframe[src]',
        getAttrs: (el) => {
          if (typeof el === 'string') return false
          const m = PREVIEW.exec(el.getAttribute('src') ?? '')
          return m ? { fileId: m[1] } : false
        },
      },
    ]
  },

  renderHTML({ node }) {
    return [
      'iframe',
      mergeAttributes({
        src: `https://drive.google.com/file/d/${node.attrs.fileId}/preview`,
        allow: 'autoplay; fullscreen',
        allowfullscreen: 'true',
        loading: 'lazy',
      }),
    ]
  },
})
