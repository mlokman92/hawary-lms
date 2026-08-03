/** Shared invitation widgets: pending-invitation list and admin account linking. */
export const invitations = {
  // Pending invitation list
  'invite.pending.title': 'Pending invitations',
  'invite.row.expires': '{email} · expires {date}',
  'invite.row.expired': '{email} · expired',
  'invite.status.pending': 'Pending',
  'invite.status.expired': 'Expired',
  'invite.actions': 'Invitation actions',
  'invite.action.resend': 'Resend (new link)',
  'invite.action.revoke': 'Revoke',
  'invite.error.resend': 'Could not resend.',

  // The invitee's own side: academies waiting for them
  'invite.waiting.title': 'Academy invitations',
  'invite.waiting.description':
    'These academies have added you. Join to get access.',
  'invite.waiting.added': 'Added {date}',
  'invite.waiting.role_student': 'Student',
  'invite.waiting.role_trainer': 'Trainer',
  'invite.waiting.join': 'Join',
  'invite.waiting.joining': 'Joining…',
  'invite.waiting.error': 'Could not join this academy.',

  // Link an existing account (admin only)
  'invite.link.title': 'Link an existing account',
  'invite.link.description.student':
    'The person must already have signed up. Linking grants student access to this academy.',
  'invite.link.description.instructor':
    'The person must already have signed up. Linking grants trainer access to this academy.',
  'invite.link.email_label': 'Account email',
  'invite.link.email_placeholder': 'person@example.com',
  'invite.link.error.email_required': 'Email is required.',
  'invite.link.error.failed': 'Could not link the account.',
  'invite.link.linking': 'Linking…',
  'invite.link.submit': 'Link account',
} as const

export type InvitationsDict = Record<keyof typeof invitations, string>
