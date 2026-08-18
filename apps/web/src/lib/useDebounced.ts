import { useEffect, useState } from 'react'

/** Typing settles before a round trip; 200ms is under the "did it hear me" line. */
export const DEBOUNCE_MS = 200

/**
 * The value, but only once the user stops changing it.
 *
 * Lives here rather than beside the header search because every server-side
 * filter now needs it: a search box wired straight to a query key fires one
 * request per keystroke, and on a paged list that is a request per keystroke
 * *per page*.
 */
export function useDebounced<T>(value: T, ms: number = DEBOUNCE_MS): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return debounced
}
