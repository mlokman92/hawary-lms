import type { ReactNode } from 'react'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { NotificationBell } from '@/components/NotificationBell'

/**
 * The chrome both route trees share: sidebar + sticky header + padded content.
 * The staff and learner shells differ in exactly three things — the sidebar,
 * whether the header carries extra controls, and the nav config — so those are
 * the props and everything else lives here once.
 *
 * The notification bell is NOT one of those three: a student waiting to hear
 * that their session is confirmed and a trainer waiting to hear that one was
 * booked want the same control, so it is mounted here and both shells get it.
 *
 * **Which academy it is scoped to IS one of those three, though**, and missing
 * that made the bell dead on the learner side from the day it shipped. It used
 * to read `useAcademy().activeAcademyId` for itself — the STAFF context, whose
 * reconciliation effect early-returns when there are no staff memberships. For
 * a student-only account that id is null for ever, so both queries stayed
 * `enabled: false` and the panel was permanently empty: 602 notifications
 * across 284 accounts that nobody could ever have seen, appointments included.
 * So the id is a prop now, and each shell passes the academy it is actually
 * standing in — the same reason `switcher` is a prop rather than something
 * this component picks.
 *
 * Pages own their own max-width (see the `mx-auto w-full max-w-*` wrappers);
 * this component deliberately does not centre its children.
 */
export function SidebarShell({
  sidebar,
  headerSlot,
  academyId,
  children,
}: {
  sidebar: ReactNode
  headerSlot?: ReactNode
  /** The tenant this shell is showing. Staff pass the back-office's active
   *  academy, the learner tree passes its own. */
  academyId: string | null
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
          {/* Its own `ml-auto` pins it right whether or not a headerSlot is
              there, so the learner header does not need a spacer to hold it
              in place. */}
          <NotificationBell academyId={academyId} />
        </header>
        {/* A div, not a <main>: SidebarInset already renders one, and nesting a
            second landmark inside it was a bug on every back-office route. */}
        <div className="flex-1 p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}
