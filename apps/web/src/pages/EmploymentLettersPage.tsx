import { useT } from '@/lib/i18n'
import { UploadedPdfRoster } from '@/features/documents/UploadedPdfPages'

/** Who has sent their Surat Pengesahan Tempoh Bekerja, and the letter itself. */
export function EmploymentLettersPage() {
  const { t } = useT()
  return (
    <UploadedPdfRoster kind="employment" title={t('sdoc.employment.title')} />
  )
}
