/**
 * A half-filled enrollment form, kept across the sign-up hop.
 *
 * Applying requires an account, so a signed-out prospect who has just typed
 * their name, IC and address gets bounced to /signup and comes back to the same
 * page. Without this they come back to an EMPTY form, which is the single most
 * likely place to lose them.
 *
 * Same shape and same reasoning as lib/invite.ts: localStorage, same device,
 * every access wrapped because storage throws in private mode.
 */
const DRAFT_KEY = 'hawary.enrollDraft'

type Draft = { courseId: string; values: Record<string, string> }

export function setEnrollDraft(courseId: string, values: Record<string, string>): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ courseId, values }))
  } catch {
    // ignore (private mode / storage disabled)
  }
}

/**
 * Read the draft back, but only for the course it was written on: a stale draft
 * must never leak one course's answers into another course's form.
 *
 * Deliberately non-destructive. Clearing on read would work exactly once and
 * then lose the draft on React's second render in development — the caller
 * clears it after the application is actually sent.
 */
export function readEnrollDraft(courseId: string): Record<string, string> | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const draft = JSON.parse(raw) as Draft
    if (draft?.courseId !== courseId) return null
    return draft.values ?? null
  } catch {
    return null
  }
}

/**
 * The draft without caring which course it belongs to.
 *
 * Only for the auth pages: /signup and /signin ask for a name, an email and a
 * phone number that the applicant has just typed into the enrollment form, and
 * which course it was for makes no difference to those three answers. Callers
 * must check that they are actually mid-enrollment (`next` points at /enroll/)
 * before using it.
 */
export function readEnrollDraftValues(): Record<string, string> | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    return (JSON.parse(raw) as Draft)?.values ?? null
  } catch {
    return null
  }
}

export function clearEnrollDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY)
  } catch {
    // ignore
  }
}

export const enrollPath = (slug: string, courseId: string) =>
  `/enroll/${encodeURIComponent(slug)}/${courseId}`

export const enrollDirectoryPath = (slug: string) =>
  `/enroll/${encodeURIComponent(slug)}`
