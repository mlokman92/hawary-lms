/**
 * Reaching a human.
 *
 * Every screen that can strand somebody needs the same number, and a stranded
 * person is exactly who cannot be told "ask your academy" — the academy's own
 * record is usually what is wrong. It lives here rather than in a page because
 * `/onboarding` was the first to need it and the invitation list was the
 * second; the third should not copy a phone number out of a component.
 */
const SUPPORT_PHONE = '60127967065'

/**
 * A `wa.me` link, optionally with the message already in the box.
 *
 * Prefilled, never sent — WhatsApp opens the chat and the person still presses
 * send, which is what keeps a draft from becoming a message they did not write.
 */
export function supportWhatsApp(text?: string): string {
  const query = text?.trim() ? `?text=${encodeURIComponent(text.trim())}` : ''
  return `https://wa.me/${SUPPORT_PHONE}${query}`
}
