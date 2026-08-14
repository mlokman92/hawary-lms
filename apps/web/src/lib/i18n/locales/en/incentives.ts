/**
 * Incentive payouts: the batches themselves, the recipient picker, and the
 * student bank account that money lands in.
 *
 * The bank card is here rather than in `students` because the account only
 * exists to receive a payout — it is rendered on `/students/:id` and on
 * `/learn/profile`, but it belongs to this feature, and keeping one `bank.*`
 * block stops the same four field labels being written twice.
 *
 * "Sandbox" is Billplz's own mode name and stays as-is in every language, the
 * same as it does on the ToyyibPay card.
 */
export const incentives = {
  // List page
  'incentives.title': 'Incentive',
  'incentives.subtitle':
    'One-off transfers straight to students’ own bank accounts.',
  'incentives.back': 'Back to incentives',
  'incentives.admin_only':
    'Only academy admins can manage incentive payouts.',
  'incentives.empty': 'No incentive batches yet.',
  'incentives.not_found':
    'This incentive batch does not exist, or you do not have access to it.',
  'incentives.amount_per_student': 'Amount per student',
  'incentives.sandbox': 'Sandbox',
  'incentives.no_bank': 'No bank details',
  'incentives.refresh_status': 'Refresh status',
  'incentives.resume': 'Resume',

  'incentives.recipients_one': '{count} recipient',
  'incentives.recipients_other': '{count} recipients',

  'incentives.batch.per_student': '{amount} per student',

  'incentives.table.recipients': 'Recipients',
  'incentives.table.created': 'Created',
  'incentives.table.account': 'Account',
  'incentives.table.reason': 'Reason',

  // New batch dialog
  'incentives.new.action': 'New incentive',
  'incentives.new.title': 'New incentive',
  'incentives.new.description':
    'Set the amount each student receives. You pick the recipients next.',
  'incentives.new.title_placeholder': 'Childcare education grant 2026',
  'incentives.new.description_placeholder':
    'Reaches the recipient with the transfer',
  'incentives.new.title_required': 'A title is required.',
  'incentives.new.amount_required': 'Enter an amount greater than zero.',

  // Recipient picker
  'incentives.picker.search_placeholder':
    'Search by name, student number or email',
  'incentives.picker.empty': 'No students in this academy yet.',
  'incentives.picker.no_match': 'No students match your search.',
  'incentives.picker.select_all': 'Select all',
  'incentives.picker.bank': 'Bank',

  // Sending. The confirmation is plural because "1 bank accounts" in the one
  // dialog that spends money reads as a bug in the thing about to spend.
  'incentives.send.action': 'Send transfers',
  'incentives.send.confirm_title': 'Send these transfers?',
  'incentives.send.confirm_body_one':
    'This transfers {total} to 1 bank account. A payment order cannot be recalled once it is sent.',
  'incentives.send.confirm_body_other':
    'This transfers {total} to {count} bank accounts. A payment order cannot be recalled once it is sent.',
  'incentives.send.list_changed':
    'Nothing was sent. Only {count} of the {picked} students you picked still have bank details on file. The list below has been updated — check it and confirm again.',

  'incentives.delete.action': 'Delete incentive',
  'incentives.delete.title': 'Delete this incentive?',
  'incentives.delete.body':
    '“{title}” and its recipient list will be removed. This cannot be undone.',

  'incentives.error.insufficient_funds':
    'Your Billplz payment order limit is too low for this batch. Top it up, then resume.',
  'incentives.error.not_configured':
    'Billplz is not connected. Add your keys in Settings first.',
  'incentives.error.no_recipients':
    'This batch has no recipients with bank details.',
  'incentives.error.send_failed': 'The transfers could not be sent.',
  'incentives.error.refresh_failed':
    'The payout statuses could not be refreshed.',
  'incentives.error.no_response': 'No response from the server.',

  // Payout and batch status badges — the maps are in
  // `features/incentives/status.ts`, which is built before a language is known.
  'incentives.payout_status.pending': 'Not sent',
  'incentives.payout_status.sending': 'Sending',
  'incentives.payout_status.processing': 'Processing',
  'incentives.payout_status.completed': 'Paid',
  'incentives.payout_status.failed': 'Failed',
  'incentives.payout_status.cancelled': 'Cancelled',

  'incentives.batch_status.sending': 'Sending',
  'incentives.batch_status.sent': 'Sent',
  'incentives.batch_status.cancelled': 'Cancelled',

  // Learner side — the payouts table under /learn/billing.
  'incentives.learn.payouts': 'Payouts',
  'incentives.learn.col.batch': 'Incentive',

  // Student bank account (staff view on /students/:id, own view on
  // /learn/profile — the same row under the same policy, so the same form).
  'incentives.bank.title': 'Bank account',
  'incentives.bank.description':
    'Where incentive payouts are transferred.',
  'incentives.bank.bank': 'Bank',
  'incentives.bank.bank_placeholder': 'Select a bank',
  'incentives.bank.account_number': 'Account number',
  'incentives.bank.account_number_placeholder': 'Digits only',
  'incentives.bank.holder': 'Account holder name',
  'incentives.bank.holder_placeholder': 'As printed by the bank',
  'incentives.bank.holder_ic': 'IC number (optional)',
  'incentives.bank.empty': 'No bank account on file.',
  'incentives.bank.removing': 'Removing…',
  'incentives.bank.remove_confirm.title': 'Remove bank account?',
  'incentives.bank.remove_confirm.body':
    'The details are deleted. Payouts already sent are not affected.',
  'incentives.bank.error.bank': 'Choose a bank.',
  'incentives.bank.error.account_number':
    'Enter an account number of 5 to 20 digits.',
  'incentives.bank.error.holder': 'Enter the account holder name.',
} as const

export type IncentivesDict = Record<keyof typeof incentives, string>
