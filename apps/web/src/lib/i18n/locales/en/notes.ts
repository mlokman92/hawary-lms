/**
 * The note editor, plus the two authoring surfaces notes owns and lends out:
 * the tiptap rich-text editor (notes) and the block editor/viewer (shared with
 * assessments and assignments).
 */
export const notes = {
  // Note editor page
  'notes.not_found': 'Note not found.',
  'notes.back_to_courses': 'Back to courses',
  'notes.delete.title': 'Delete this note?',
  'notes.delete.body': '“{title}” will be permanently deleted.',

  // Note editor
  'notes.tip_format': 'Tip: select any text to format it.',
  'notes.editor_loading': 'Loading editor…',

  // Rich-text editor (notes)
  'notes.rt.placeholder': 'Write something…',
  'notes.rt.add_image': 'Add image',
  'notes.rt.paste_hint': 'or paste / drag an image into the note',
  'notes.rt.link_prompt': 'Link URL',
  'notes.rt.bold': 'Bold',
  'notes.rt.italic': 'Italic',
  'notes.rt.underline': 'Underline',
  'notes.rt.strikethrough': 'Strikethrough',
  'notes.rt.code': 'Code',
  'notes.rt.heading_1': 'Heading 1',
  'notes.rt.heading_2': 'Heading 2',
  'notes.rt.bullet_list': 'Bullet list',
  'notes.rt.numbered_list': 'Numbered list',
  'notes.rt.quote': 'Quote',
  'notes.rt.link': 'Link',

  // Block editor / viewer (notes, assessments, assignments)
  'notes.blocks.empty': 'No content yet. Add a block below.',
  'notes.blocks.add_text': 'Text',
  'notes.blocks.add_image': 'Image',
  'notes.blocks.text_placeholder': 'Write…',
  'notes.blocks.caption_placeholder': 'Caption (optional)',
  'notes.blocks.no_image': 'No image yet',
  'notes.blocks.upload_image': 'Upload image',
  'notes.blocks.replace_image': 'Replace',
  'notes.blocks.youtube_placeholder': 'Paste a YouTube link…',
  'notes.blocks.youtube_invalid': 'Not a recognised YouTube URL.',
  'notes.blocks.youtube_title': 'YouTube video',
  'notes.blocks.video_title': 'Video',
  'notes.blocks.move_up': 'Move up',
  'notes.blocks.move_down': 'Move down',
  'notes.blocks.remove': 'Remove block',
} as const

export type NotesDict = Record<keyof typeof notes, string>
