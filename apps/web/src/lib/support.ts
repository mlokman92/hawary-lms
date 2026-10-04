/**
 * Reaching a human.
 *
 * Every screen that can strand somebody needs the same number, and a stranded
 * person is exactly who cannot be told "ask your academy" — the academy's own
 * record is usually what is wrong. It lives here rather than in a page because
 * `/onboarding` and the invitation list both need it, and the next screen
 * should not copy a phone number out of a component.
 */
const SUPPORT_PHONE = '60127967065'

/** A `wa.me` link that opens a chat with support. */
export const SUPPORT_WHATSAPP_URL = `https://wa.me/${SUPPORT_PHONE}`
