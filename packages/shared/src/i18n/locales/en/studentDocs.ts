/** Documents: the offer letter and the IC copy, on both shells. */
export const studentDocs = {
  // Offer letter — staff list
  'sdoc.offer.title': 'Offer letter',
  'sdoc.offer.search': 'Search name, number or IC',
  'sdoc.col.ic': 'IC number',
  'sdoc.col.start_date': 'Start date',
  'sdoc.empty.none': 'No students yet.',
  'sdoc.empty.no_match': 'No students match.',
  'sdoc.download_failed': 'The file could not be prepared. Try again.',

  // Offer letter — the student's own
  'sdoc.offer.not_ready': 'Your offer letter is not ready yet.',
  'sdoc.offer.pay_first':
    'Your offer letter can be downloaded once you have made a payment.',
  'sdoc.offer.go_to_billing': 'Go to billing',
  'sdoc.offer.save_and_download': 'Save and download',
  'sdoc.offer.ic_required': 'Enter your IC number.',
  'sdoc.offer.address_required': 'Enter your personal address.',

  // IC copy
  'sdoc.ic.title': 'IC copy',
  'sdoc.ic.uploaded': 'Uploaded',
  'sdoc.ic.not_uploaded': 'Not uploaded',
  'sdoc.ic.choose': 'Upload PDF',
  'sdoc.ic.replace': 'Replace PDF',
  'sdoc.ic.pdf_only': 'Upload your IC copy as a PDF file.',
  'sdoc.ic.too_large': 'The file is larger than {max} MB.',
  'sdoc.ic.uploaded_on': 'Uploaded {date}',
} as const

export type StudentDocsDict = Record<keyof typeof studentDocs, string>
