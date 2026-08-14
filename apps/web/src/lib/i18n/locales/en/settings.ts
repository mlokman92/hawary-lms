/**
 * Academy settings: the academy profile (letterhead) card, the ToyyibPay
 * gateway card and the members (staff) page.
 */
export const settings = {
  // Settings page shell
  'settings.title': 'Settings',
  'settings.subtitle': 'Configure your academy’s details and integrations.',
  'settings.admin_only': 'Only academy admins can manage settings.',

  // Academy profile — what invoices and receipts print
  'settings.academy.title': 'Academy details',
  'settings.academy.description':
    'These appear on the invoices and receipts your students download.',
  'settings.academy.name_label': 'Academy name',
  'settings.academy.name_placeholder': 'Your academy’s registered name',
  'settings.academy.logo_label': 'Logo',
  'settings.academy.logo_hint':
    'PNG, JPEG or WebP. Shown at the top of every invoice and receipt.',
  'settings.academy.no_logo': 'No logo',
  'settings.academy.change_logo': 'Change logo',
  'settings.academy.remove_logo': 'Remove logo',
  'settings.academy.address_label': 'Address',
  'settings.academy.address_placeholder':
    'Street, postcode, city and state — one line each',
  'settings.academy.phone_label': 'Phone number',
  'settings.academy.phone_placeholder': '03-1234 5678',
  'settings.academy.sst_label': 'SST number',
  'settings.academy.sst_placeholder': 'W10-1808-31000000',
  'settings.academy.optional_hint':
    'Only the academy name is required. Anything left blank is simply omitted from the document.',
  'settings.academy.save': 'Save details',
  'settings.academy.saved': 'Saved',
  'settings.academy.preview': 'Preview invoice',
  'settings.academy.error.name_required': 'Enter your academy name.',

  // Invoice / receipt preview dialog
  'settings.preview.title': 'Document preview',
  'settings.preview.description':
    'How your invoices and receipts will look with the details above.',
  'settings.preview.tab_invoice': 'Invoice',
  'settings.preview.tab_receipt': 'Receipt',
  'settings.preview.sample_note':
    'Sample figures — only the academy details are yours. Changes here are previewed before you save them.',

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

  'settings.toyyibpay.charge_to_payor': 'Payor pays the ToyyibPay charge',
  'settings.toyyibpay.charge_to_payor.hint':
    'ToyyibPay adds its {amount} FPX charge on top, so the student pays it and you receive the full invoice amount. Off means you absorb it. This is the default for new invoices — you can change it on each one.',

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

  // Billplz card. The sibling of the ToyyibPay card above and deliberately
  // shaped like it — but the opposite direction of money: ToyyibPay collects
  // from students, Billplz Payment Orders pay them. "Sandbox", "Live" and
  // "Payment Order" are Billplz's own names and stay as-is in every language.
  'settings.billplz.title': 'Student transfers · Billplz',
  'settings.billplz.description':
    'Add your academy’s Billplz Payment Order keys so you can transfer incentives straight into your students’ own bank accounts.',
  'settings.billplz.connected': 'Keys connected',
  'settings.billplz.mode.sandbox': 'Sandbox',
  'settings.billplz.mode.live': 'Live',
  'settings.billplz.secret_masked': 'Secret ••••{last4}',
  'settings.billplz.limit': 'Payment Order Limit {amount}',
  'settings.billplz.replace_key': 'Replace keys',
  'settings.billplz.remove_key': 'Remove keys',
  'settings.billplz.removing': 'Removing…',
  'settings.billplz.remove_confirm.title': 'Remove Billplz keys?',
  'settings.billplz.remove_confirm.body':
    'This deletes your stored keys, so no further transfers can be sent. Transfers already sent are kept, along with their status. You can add keys again anytime.',

  'settings.billplz.secret_label': 'Billplz API secret key',
  'settings.billplz.secret_placeholder': 'Your API secret key',
  'settings.billplz.secret_hint':
    'Find it in your Billplz dashboard under Settings → Account Settings.',
  'settings.billplz.xsign_label': 'X Signature Key',
  'settings.billplz.xsign_placeholder': 'Your X Signature Key',
  'settings.billplz.xsign_hint':
    'Billplz signs every payment order with this key. Find it in your Billplz dashboard under Settings → X Signature Key, Payment Order section.',
  'settings.billplz.sandbox_label': 'Sandbox mode',
  'settings.billplz.sandbox_hint':
    'Use billplz-sandbox.com for testing. Leave off for real transfers.',
  'settings.billplz.advanced': 'Advanced options',

  'settings.billplz.verifying': 'Verifying…',
  'settings.billplz.save_new_key': 'Save new keys',
  'settings.billplz.connect': 'Connect Billplz',

  'settings.billplz.error.secret_required':
    'Enter your Billplz API secret key.',
  'settings.billplz.error.xsign_required':
    'Enter your Billplz X Signature Key.',
  'settings.billplz.error.verify_failed':
    'Could not verify the keys with Billplz.',
  'settings.billplz.error.save_failed': 'Could not save the keys.',
  'settings.billplz.error.no_response': 'No response from server.',

  // The members page has its own namespace now — see `locales/en/members.ts`.
} as const

export type SettingsDict = Record<keyof typeof settings, string>
