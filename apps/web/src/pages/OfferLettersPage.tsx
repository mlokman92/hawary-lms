import { useState } from 'react'
import { Download } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { fmtDate } from '@/lib/format'
import { PageHeader } from '@/components/patterns/PageHeader'
import { Button } from '@/components/ui/button'
import { DocumentStudentList } from '@/features/documents/DocumentStudentList'
import {
  fetchOfferAcceptance,
  type DocumentStudent,
} from '@/features/documents/api'
import { downloadOfferLetter } from '@/features/offer-letter/letter'

/**
 * Every student's offer letter, for an admin to download — and who has signed
 * it and agreed to its terms, and when.
 *
 * Nothing is required of the record first: whatever is missing — the IC
 * number, the address, a course with a start date, the signature — prints as a
 * blank, to be filled in by hand. The student's own page is the one that
 * insists. A letter downloaded here carries the student's signature when they
 * have given one.
 */
export function OfferLettersPage() {
  const { t } = useT()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function download(s: DocumentStudent) {
    setBusy(s.id)
    setError(null)
    try {
      // The list carries only the date; the signature is read for this click.
      const signed = s.offerAcceptedAt
        ? await fetchOfferAcceptance(s.id)
        : null
      await downloadOfferLetter({
        fullName: s.full_name,
        icNumber: s.ic_number,
        address: s.personal_address,
        startDate: s.course?.start_date ?? null,
        signature: signed?.signature,
        agreedAt: signed?.accepted_at,
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
        statusFilter={{
          label: t('sdoc.offer.signed'),
          allLabel: t('sdoc.offer.all_statuses'),
          defaultValue: 'signed',
          options: [
            { value: 'signed', label: t('sdoc.offer.signed') },
            { value: 'unsigned', label: t('sdoc.offer.not_signed') },
          ],
          matches: (s, value) => (value === 'signed') === !!s.offerAcceptedAt,
        }}
        lastHead={t('sdoc.offer.signed')}
        lastCell={(s) => (
          <div className="flex items-center justify-end gap-3">
            <span className="text-muted-foreground text-xs">
              {s.offerAcceptedAt
                ? fmtDate(s.offerAcceptedAt)
                : t('sdoc.offer.not_signed')}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={busy === s.id}
              onClick={() => void download(s)}
            >
              <Download /> {t('common.download')}
            </Button>
          </div>
        )}
      />
    </div>
  )
}
