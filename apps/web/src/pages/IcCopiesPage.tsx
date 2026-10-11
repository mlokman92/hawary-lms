import { useT } from '@/lib/i18n'
import { UploadedPdfRoster } from '@/features/documents/UploadedPdfPages'

/** Who has sent their IC copy, and the copy itself. */
export function IcCopiesPage() {
  const { t } = useT()
  return <UploadedPdfRoster kind="ic" title={t('sdoc.ic.title')} />
}
