import { useState } from 'react'
import { useT } from '@/lib/i18n'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import cpcUrl from './cpc-p851-002-4-2025.pdf?url'

/**
 * The PDF, with something in its place until it has drawn. Lives inside the
 * sheet's content, which unmounts on close, so each opening starts over.
 */
function CpcPreview() {
  const { t } = useT()
  const [loaded, setLoaded] = useState(false)
  return (
    <div className="bg-muted/40 relative min-h-64 flex-1 overflow-hidden rounded-lg border">
      {loaded ? null : (
        <div className="absolute inset-0 flex flex-col gap-3 p-4">
          <Skeleton className="h-5 w-2/5 rounded-md" />
          <Skeleton className="min-h-0 flex-1 rounded-md" />
          <span className="sr-only">{t('common.loading')}</span>
        </div>
      )}
      <iframe
        src={cpcUrl}
        title={t('report.cpc')}
        onLoad={() => setLoaded(true)}
        className="h-full w-full"
      />
    </div>
  )
}

/**
 * The programme's Competency Profile Chart (NOSS P851-002-4:2025), beside the
 * thread a checker is reading — the units and work activities an LPKC is
 * written against. Shipped with the app rather than stored: it is the published
 * standard, the same for every student and course, and changes only with a new
 * NOSS.
 */
export function CpcSheet({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useT()
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-3xl">
        <SheetHeader className="pr-14">
          <SheetTitle>{t('report.cpc')}</SheetTitle>
          <SheetDescription>NOSS P851-002-4:2025</SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col px-6 pb-6">
          <CpcPreview />
        </div>
      </SheetContent>
    </Sheet>
  )
}
