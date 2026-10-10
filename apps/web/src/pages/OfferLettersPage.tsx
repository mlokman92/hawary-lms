import { useState } from 'react'
import { Download } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { PageHeader } from '@/components/patterns/PageHeader'
import { Button } from '@/components/ui/button'
import { DocumentStudentList } from '@/features/documents/DocumentStudentList'
import type { DocumentStudent } from '@/features/documents/api'
import { downloadOfferLetter } from '@/features/offer-letter/letter'

/**
 * Every student's offer letter, for an admin to download.
 *
 * Nothing is required of the record first: whatever is missing — the IC
 * number, the address, a course with a start date — prints as a blank, to be
 * filled in by hand. The student's own page is the one that insists.
 */
export function OfferLettersPage() {
  const { t } = useT()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function download(s: DocumentStudent) {
    setBusy(s.id)
    setError(null)
    try {
      await downloadOfferLetter({
        fullName: s.full_name,
        icNumber: s.ic_number,
        address: s.personal_address,
        startDate: s.course?.start_date ?? null,
      })
    } catch {
      setError(t('sdoc.download_failed'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader title={t('sdoc.offer.title')} />
      {error ? <p className="text-destructive mt-4 text-sm">{error}</p> : null}
      <DocumentStudentList
        lastHead={<span className="sr-only">{t('common.download')}</span>}
        lastCell={(s) => (
          <Button
            variant="outline"
            size="sm"
            disabled={busy === s.id}
            onClick={() => void download(s)}
          >
            <Download /> {t('common.download')}
          </Button>
        )}
      />
    </div>
  )
}
