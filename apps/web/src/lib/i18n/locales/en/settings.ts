/** Academy settings: the ToyyibPay gateway card and the members (staff) page. */
export const settings = {
  // Settings page shell
  'settings.title': 'Settings',
  'settings.subtitle': 'Configure your academy’s integrations.',
  'settings.admin_only': 'Only academy admins can manage settings.',

  // ToyyibPay gateway card. "Sandbox" and "Live" are ToyyibPay's own mode
  // names and stay as-is in every language.
  'settings.toyyibpay.title': 'Online payments · ToyyibPay',
  'settings.toyyibpay.description':
    'Add your academy’s ToyyibPay secret key so students can pay invoices online via FPX — funds go straight to your ToyyibPay account.',
  'settings.toyyibpay.connected': 'Key connected',
  'settings.toyyibpay.mode.sandbox': 'Sandbox',
  'settings.toyyibpay.mode.live': 'Live',
  'settings.toyyibpay.secret_masked': 'Secret ••••{last4}',
  'settings.toyyibpay.secret_masked_category':
    'Secret ••••{last4} · Category {code}',
  'settings.toyyibpay.replace_key': 'Replace key',
  'settings.toyyibpay.remove_key': 'Remove key',
  'settings.toyyibpay.removing': 'Removing…',
  'settings.toyyibpay.remove_confirm.title': 'Remove ToyyibPay key?',
  'settings.toyyibpay.remove_confirm.body':
    'This deletes your stored secret key and turns off online payments. Existing invoices and recorded payments are kept. You can add a key again anytime.',

  'settings.toyyibpay.accept_online': 'Accept online payments',
  'settings.toyyibpay.accept_online.hint':
    'Show a “Pay online” button on invoice pay links.',

  'settings.toyyibpay.secret_label': 'ToyyibPay secret key',
  'settings.toyyibpay.secret_placeholder': 'Your userSecretKey',
  'settings.toyyibpay.secret_hint':
    'Find it in your ToyyibPay dashboard under Settings → Secret Key. We verify it and create a billing category for you.',
  'settings.toyyibpay.sandbox_label': 'Sandbox mode',
  'settings.toyyibpay.sandbox_hint':
    'Use dev.toyyibpay.com for testing. Leave off for live payments.',
  'settings.toyyibpay.category_label': 'Category code (optional)',
  'settings.toyyibpay.category_placeholder': 'Leave blank to auto-create',
  'settings.toyyibpay.advanced': 'Advanced options',

  'settings.toyyibpay.verifying': 'Verifying…',
  'settings.toyyibpay.save_new_key': 'Save new key',
  'settings.toyyibpay.connect': 'Connect ToyyibPay',

  'settings.toyyibpay.error.key_required': 'Enter your ToyyibPay secret key.',
  'settings.toyyibpay.error.verify_failed':
    'Could not verify the key with ToyyibPay.',
  'settings.toyyibpay.error.save_failed': 'Could not save the key.',
  'settings.toyyibpay.error.no_response': 'No response from server.',

  // Members page
  'settings.members.title': 'Members',
  'settings.members.subtitle':
    'Everyone with access to this academy, and what they can do.',
  'settings.members.col.person': 'Person',
  'settings.members.you': '(you)',
  'settings.members.actions': 'Member actions',
  'settings.members.make_admin': 'Make admin',
  'settings.members.make_trainer': 'Make trainer',
  'settings.members.make_student': 'Make student',
  'settings.members.suspend': 'Suspend access',
  'settings.members.restore': 'Restore access',
  'settings.members.footnote':
    'Suspending a member revokes course access immediately — enrolment alone no longer grants it.',

  // academy_members.status
  'settings.members.status.active': 'Active',
  'settings.members.status.invited': 'Invited',
  'settings.members.status.suspended': 'Suspended',
} as const

export type SettingsDict = Record<keyof typeof settings, string>
