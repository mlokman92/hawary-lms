/** Course materials: the upload dialog and the storage errors it can raise. */
export const materials = {
  'materials.upload.title': 'Upload material',
  'materials.upload.description':
    'Slides, notes, a worksheet — a file students download rather than read in the app.',
  'materials.upload.hint':
    'PDF, Word, PowerPoint, Excel, text, ZIP or an image. Up to 50 MB.',
  'materials.file': 'File',
  'materials.title_placeholder': 'Named after the file if you leave this blank',
  'materials.error.no_file': 'Choose a file to upload.',
  'materials.error.too_large': 'That file is larger than 50 MB.',
  // lib/storage.ts, when the signing function returns nothing usable.
  'material.no_url': 'Could not open that file. Try again.',
} as const

export type MaterialsDict = Record<keyof typeof materials, string>
