import { useT } from '@/lib/i18n'
import { OwnPdfUpload } from '@/features/documents/UploadedPdfPages'

/** The student's Surat Pengesahan Tempoh Bekerja: send it, look at it, replace it. */
export function LearnEmploymentLetterPage() {
  const { t } = useT()
  return (
    <OwnPdfUpload
      kind="employment"
      title={t('sdoc.employment.title')}
      pdfOnly={t('sdoc.employment.pdf_only')}
    />
  )
}
