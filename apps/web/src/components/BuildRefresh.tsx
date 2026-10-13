import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { checkBuild, reloadIfNewerBuild } from '@/lib/build'

/**
 * Keeps an open tab on the deployed build. Nobody reloads a web app, so without
 * this a tab left open for a week runs week-old code.
 *
 * The reload happens on a route change and nowhere else: the page being left is
 * already gone, so nothing typed into it can be lost. Coming back to the tab
 * only checks — reloading there would throw away a half-written form.
 *
 * Renders nothing. Mounted once, inside the router.
 */
export function BuildRefresh() {
  const { pathname } = useLocation()

  useEffect(() => {
    reloadIfNewerBuild()
    void checkBuild()
  }, [pathname])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void checkBuild()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  return null
}
