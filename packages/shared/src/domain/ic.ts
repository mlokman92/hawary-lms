/**
 * "010203-14-5678" -> "010203145678" (how every IC number on file is stored).
 *
 * A MyKad number is twelve digits. Anything carrying a letter is read as a
 * passport number, for the student who has no MyKad. Returns `''` for a blank
 * and `null` for something that is neither — the same rule
 * `update_my_student_details` applies again on the server.
 */
export function normalizeIcNumber(raw: string): string | null {
  const value = (raw ?? '').replace(/[\s-]/g, '').toUpperCase()
  if (!value) return ''
  if (/^\d+$/.test(value)) return value.length === 12 ? value : null
  return /^[A-Z0-9]{5,20}$/.test(value) ? value : null
}
