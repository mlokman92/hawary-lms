import type { ReactNode } from 'react'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'

/**
 * The chrome both route trees share: sidebar + sticky header + padded content.
 * The staff and learner shells differ in exactly three things — the sidebar,
 * whether the header carries extra controls, and the nav config — so those are
 * the props and everything else lives here once.
 *
 * Pages own their own max-width (see the `mx-auto w-full max-w-*` wrappers);
 * this component deliberately does not centre its children.
 */
export function SidebarShell({
  sidebar,
  headerSlot,
  children,
}: {
  sidebar: ReactNode
  headerSlot?: ReactNode
  children: ReactNode
}) {
  return (
    <SidebarProvider>
      {sidebar}
      <SidebarInset>
        <header className="bg-background sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          {/* The divider separates the trigger from what follows it — with an
              empty header slot it would just dangle. */}
          {headerSlot ? (
            <>
              <div className="bg-border mr-1 h-4 w-px" aria-hidden="true" />
              {headerSlot}
            </>
          ) : null}
        </header>
        {/* A div, not a <main>: SidebarInset already renders one, and nesting a
            second landmark inside it was a bug on every back-office route. */}
        <div className="flex-1 p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}
