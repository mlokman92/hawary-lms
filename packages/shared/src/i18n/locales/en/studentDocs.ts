/** Documents: the offer letter, the IC copy, the employment letter and the KWSP letter. */
export const studentDocs = {
  // Offer letter — staff list
  'sdoc.offer.title': 'Offer letter',
  'sdoc.offer.search': 'Search name, number or IC',
  'sdoc.col.ic': 'IC number',
  'sdoc.col.start_date': 'Start date',
  'sdoc.empty.none': 'No students yet.',
  'sdoc.empty.no_match': 'No students match.',
  'sdoc.download_failed': 'The file could not be prepared. Try again.',
  'sdoc.offer.signed': 'Signed and agreed',
  'sdoc.offer.not_signed': 'Not signed',
  'sdoc.offer.all_statuses': 'All statuses',

  // Offer letter — the student's own
  'sdoc.offer.not_ready': 'Your offer letter is not ready yet.',
  'sdoc.offer.pay_first':
    'Your offer letter can be downloaded once you have made a payment.',
  'sdoc.offer.go_to_billing': 'Go to billing',
  'sdoc.offer.save_and_download': 'Save and download',
  'sdoc.offer.ic_required': 'Enter your IC number.',
  'sdoc.offer.address_required': 'Enter your personal address.',
  'sdoc.offer.signature': 'Signature',
  'sdoc.offer.sign_again': 'Sign again',
  'sdoc.offer.signed_on': 'Signed {date}',
  'sdoc.offer.agree':
    'I have read and agree to the terms and conditions above.',
  'sdoc.offer.signature_required': 'Sign in the box.',
  'sdoc.offer.agree_required':
    'Tick the box to agree to the terms and conditions.',

  // A PDF the student uploads — shared by the IC copy and the employment letter
  'sdoc.file.uploaded': 'Uploaded',
  'sdoc.file.not_uploaded': 'Not uploaded',
  'sdoc.file.choose': 'Upload PDF',
  'sdoc.file.replace': 'Replace PDF',
  'sdoc.file.too_large': 'The file is larger than {max} MB.',
  'sdoc.file.uploaded_on': 'Uploaded {date}',

  // IC copy
  'sdoc.ic.title': 'IC copy',
  'sdoc.ic.pdf_only': 'Upload your IC copy as a PDF file.',

  // Employment letter (Surat Pengesahan Tempoh Bekerja)
  'sdoc.employment.title': 'Employment duration letter',
  'sdoc.employment.pdf_only':
    'Upload your employment duration letter as a PDF file.',

  // KWSP letter (Surat Pengesahan Pendaftaran Pelajar) — staff only
  'sdoc.kwsp.title': 'KWSP letter',
  'sdoc.kwsp.not_created': 'Not created',
  'sdoc.kwsp.created_on': 'Created {date}',
  'sdoc.kwsp.empty': 'No KWSP letters yet.',
  'sdoc.kwsp.create_title': 'Create KWSP letters',
  'sdoc.kwsp.create_count': 'Create ({count})',
  'sdoc.kwsp.download_count': 'Download ({count})',
  'sdoc.kwsp.remove_count': 'Remove ({count})',
  'sdoc.select_all': 'Select all',
} as const

export type StudentDocsDict = Record<keyof typeof studentDocs, string>
