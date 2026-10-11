import { useT } from '@/lib/i18n'
import { OwnPdfUpload } from '@/features/documents/UploadedPdfPages'

/** The student's IC copy: send it, look at it, send a better one. */
export function LearnIcCopyPage() {
  const { t } = useT()
  return (
    <OwnPdfUpload
      kind="ic"
      title={t('sdoc.ic.title')}
      pdfOnly={t('sdoc.ic.pdf_only')}
    />
  )
}
