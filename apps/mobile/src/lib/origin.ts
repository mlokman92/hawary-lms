import { WEB_ORIGIN } from './env'

/**
 * The web app's address. The synced data hooks send it to the mail functions
 * as `origin`, where the web app sends `window.location.origin`: the links in
 * those emails open web pages (or, through universal links, the right app), so
 * they must point at the site either way.
 */
export const APP_ORIGIN = WEB_ORIGIN
