/**
 * Phone numbers, and turning one into a WhatsApp link.
 *
 * WhatsApp's `wa.me` takes digits only, in full international form with no
 * `+` and no punctuation. Records here do not hold one shape: of the numbers
 * in this database 551 already start `60`, 67 start `0`, 22 start `+`, and one
 * is neither. So a caller cannot simply interpolate the column, and every
 * screen that wants the link must not each invent its own answer.
 *
 * Malaysia is the assumed home country, matching the rest of the app
 * (`formatMYR`, `en-MY`/`ms-MY`, `Asia/Kuala_Lumpur`). A number already
 * carrying a country code keeps it — an international student is a real case
 * and rewriting their prefix would send the message nowhere.
 */

const MY_CODE = '60'

/**
 * A stored phone number as WhatsApp's `wa.me` digits, or null.
 *
 * Null is a real answer and callers must render nothing rather than a broken
 * link: 35 of the 676 student records here have no phone at all, and a "Message
 * on WhatsApp" button that opens an error is worse than no button.
 */
export function waNumber(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return null

  const digits = trimmed.replace(/\D/g, '')
  if (!digits) return null

  let e164: string
  if (trimmed.startsWith('+') || digits.startsWith(MY_CODE)) {
    // Already international. Left alone on purpose, including the non-Malaysian
    // case — guessing a country for somebody who told us theirs would be worse
    // than any formatting we could impose.
    e164 = digits
  } else if (digits.startsWith('0')) {
    // The Malaysian local form: 012-345 6789 → 60123456789. The trunk 0 is not
    // part of the international number.
    e164 = MY_CODE + digits.slice(1)
  } else {
    // Neither international nor local. Rather than guess a prefix onto a number
    // we cannot read, say so: the caller hides the link and the record can be
    // corrected on the student's own page.
    return null
  }

  // E.164 allows 15 digits; a country code plus a subscriber number is never
  // shorter than 8. Anything outside that is a typo or a note somebody typed
  // into a phone field, and dialling it is not an improvement on doing nothing.
  return e164.length >= 8 && e164.length <= 15 ? e164 : null
}

/**
 * A `wa.me` link with the message already typed, or null when there is no
 * usable number.
 *
 * The text is prefilled rather than sent — WhatsApp opens the chat with it in
 * the box, and the person still presses send. That is the point: the draft
 * saves the typing, and whoever is writing keeps the last word on it.
 */
export function waLink(
  raw: string | null | undefined,
  text?: string,
): string | null {
  const number = waNumber(raw)
  if (!number) return null
  const query = text?.trim() ? `?text=${encodeURIComponent(text.trim())}` : ''
  return `https://wa.me/${number}${query}`
}
