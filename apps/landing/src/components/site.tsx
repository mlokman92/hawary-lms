import type { ReactNode } from 'react'

/** The academy's support line — the same number the apps open (apps/web/src/lib/support.ts). */
export const SUPPORT_WHATSAPP_URL = 'https://wa.me/60127967065'
export const SUPPORT_PHONE_DISPLAY = '+60 12-796 7065'

export function SiteHeader() {
  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <a href="/" className="text-lg font-bold tracking-tight">
          Hawary <span className="text-primary">LMS</span>
        </a>
        <nav className="text-muted-foreground flex gap-5 text-sm font-medium">
          <a href="/apps" className="hover:text-foreground">
            Apps
          </a>
          <a href="/support" className="hover:text-foreground">
            Support
          </a>
          <a href="https://app.hawary.my/signin" className="hover:text-foreground">
            Log in
          </a>
        </nav>
      </div>
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="text-muted-foreground mx-auto flex max-w-4xl flex-wrap justify-between gap-3 px-4 py-6 text-sm sm:px-6">
        <span>© {new Date().getFullYear()} Hawary Academy</span>
        <span className="flex gap-5">
          <a href="/apps" className="hover:text-foreground">
            Apps
          </a>
          <a href="/support" className="hover:text-foreground">
            Support
          </a>
        </span>
      </div>
    </footer>
  )
}

export function Page({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6 sm:py-14">{children}</main>
      <SiteFooter />
    </div>
  )
}
