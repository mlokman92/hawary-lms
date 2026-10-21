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

  // Employment letter — the admin's review, and what the student reads of it
  'sdoc.review.pending': 'Pending review',
  'sdoc.review.accepted': 'Accepted',
  'sdoc.review.rejected': 'Rejected',
  'sdoc.review.accept': 'Accept',
  'sdoc.review.reject': 'Reject…',
  'sdoc.review.reject_title': 'Reject {name}’s letter',
  'sdoc.review.note': 'Note to the student',
  'sdoc.review.note_required': 'Write why the letter is rejected.',
  'sdoc.review.reject_confirm': 'Reject and notify',

  // KWSP letter (Surat Pengesahan Pendaftaran Pelajar) — the staff side
  'sdoc.kwsp.title': 'KWSP letter',
  'sdoc.kwsp.not_created': 'Not created',
  'sdoc.kwsp.created': 'Created',
  'sdoc.kwsp.created_on': 'Created {date}',
  'sdoc.kwsp.applied': 'Applied',
  'sdoc.kwsp.applied_on': 'Applied {date}',
  'sdoc.kwsp.empty': 'No KWSP applications or letters yet.',
  'sdoc.kwsp.create_title': 'Create KWSP letters',
  'sdoc.kwsp.create_count': 'Create ({count})',
  'sdoc.kwsp.download_count': 'Download ({count})',
  'sdoc.kwsp.remove_count': 'Remove ({count})',
  'sdoc.kwsp.download_dated': 'Download with date…',
  'sdoc.kwsp.letter_date': 'Letter date',
  'sdoc.select_all': 'Select all',

  // KWSP application — the student asks for the letter; its title is the nav's
  'sdoc.kwsp_app.description':
    'Ask the academy for the letter confirming your registration, for your KWSP withdrawal.',
  'sdoc.kwsp_app.apply': 'Apply',
  'sdoc.kwsp_app.applying': 'Applying…',
  'sdoc.kwsp_app.withdraw': 'Withdraw',
  'sdoc.kwsp_app.withdrawing': 'Withdrawing…',
  'sdoc.kwsp_app.not_applied': 'Not applied',
  'sdoc.kwsp_app.in_review': 'Under review',
  'sdoc.kwsp_app.approved': 'Approved',
} as const

export type StudentDocsDict = Record<keyof typeof studentDocs, string>
