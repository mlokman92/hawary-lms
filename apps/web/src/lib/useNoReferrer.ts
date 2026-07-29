import { useEffect } from 'react'

/**
 * Suppress the Referer header while a public pay page is mounted so the
 * bearer `pay_token` in the URL never leaks to ToyyibPay (or any third party)
 * on redirect/asset requests. Adds a `<meta name="referrer" content="no-referrer">`
 * and removes it on unmount.
 */
export function useNoReferrer() {
  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'referrer'
    meta.content = 'no-referrer'
    document.head.appendChild(meta)
    return () => {
      document.head.removeChild(meta)
    }
  }, [])
}
