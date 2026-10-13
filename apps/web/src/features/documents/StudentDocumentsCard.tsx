import { useState, type ReactNode } from 'react'
import { Download, ExternalLink, MoreHorizontal, Plus } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { errorMessage } from '@/lib/errors'
import { fmtDate } from '@/lib/format'
import { ErrorBlock } from '@/components/patterns/QueryState'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  downloadStudentKwspLetters,
  downloadStudentOfferLetter,
  useCreateKwspLetters,
  useOpenPdf,
  useRemoveKwspLetters,
  useStudentDocuments,
  type DocumentStudent,
  type UploadedPdf,
} from './api'

function Row({
  title,
  status,
  action,
}: {
  title: string
  status: string
  action?: ReactNode
}) {
  return (
    <li className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-muted-foreground text-xs">{status}</div>
      </div>
      {action}
    </li>
  )
}

/**
 * One student's documents on `/students/:id` — their row of each Documents
 * roster, with the same download and the same view, and the one place a KWSP
 * letter is prepared for a single student. Admin only, as those pages are: a
 * trainer may read neither the copies nor the signature. See docs/documents.md.
 */
export function StudentDocumentsCard({ studentId }: { studentId: string }) {
  const { t } = useT()
  const docs = useStudentDocuments(studentId)
  const openIc = useOpenPdf('ic')
  const openEmployment = useOpenPdf('employment')
  const createKwsp = useCreateKwspLetters()
  const removeKwsp = useRemoveKwspLetters()
  const [drawing, setDrawing] = useState<'offer' | 'kwsp' | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function download(
    letter: 'offer' | 'kwsp',
    draw: (student: DocumentStudent) => Promise<void>,
  ) {
    setDrawing(letter)
    setErr(null)
    try {
      // Read again for the click: the profile and the course are edited on
      // this same page, and the letter prints what the record says now.
      const { data } = await docs.refetch()
      if (!data) throw new Error()
      await draw(data)
    } catch {
      setErr(t('sdoc.download_failed'))
    } finally {
      setDrawing(null)
    }
  }

  const failed = (e: unknown) => setErr(errorMessage(e, t('common.error')))

  function uploaded(
    title: string,
    file: UploadedPdf | null,
    open: ReturnType<typeof useOpenPdf>,
  ) {
    return (
      <Row
        title={title}
        status={
          file
            ? t('sdoc.file.uploaded_on', { date: fmtDate(file.created_at) })
            : t('sdoc.file.not_uploaded')
        }
        action={
          file ? (
            <Button
              variant="outline"
              size="sm"
              disabled={open.isPending}
              onClick={() => {
                setErr(null)
                open.mutate(studentId, { onError: failed })
              }}
            >
              <ExternalLink /> {t('common.view')}
            </Button>
          ) : null
        }
      />
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('nav.documents')}</CardTitle>
      </CardHeader>
      <CardContent>
        {docs.isLoading ? (
          <p className="text-muted-foreground text-sm">{t('common.loading')}</p>
        ) : docs.error || !docs.data ? (
          <ErrorBlock error={docs.error} />
        ) : (
          <>
            <ul className="divide-y">
              <Row
                title={t('sdoc.offer.title')}
                status={
                  docs.data.offerAcceptedAt
                    ? t('sdoc.offer.signed_on', {
                        date: fmtDate(docs.data.offerAcceptedAt),
                      })
                    : t('sdoc.offer.not_signed')
                }
                action={
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={drawing === 'offer'}
                    onClick={() =>
                      void download('offer', downloadStudentOfferLetter)
                    }
                  >
                    <Download /> {t('common.download')}
                  </Button>
                }
              />
              {uploaded(t('sdoc.ic.title'), docs.data.icCopy, openIc)}
              {uploaded(
                t('sdoc.employment.title'),
                docs.data.employmentLetter,
                openEmployment,
              )}
              {/* Not every student has one: it is created here, or for many
                  at once on /documents/kwsp-letters. */}
              <Row
                title={t('sdoc.kwsp.title')}
                status={
                  docs.data.kwspCreatedAt
                    ? t('sdoc.kwsp.created_on', {
                        date: fmtDate(docs.data.kwspCreatedAt),
                      })
                    : t('sdoc.kwsp.not_created')
                }
                action={
                  docs.data.kwspCreatedAt ? (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={drawing === 'kwsp'}
                        onClick={() =>
                          void download('kwsp', (student) =>
                            downloadStudentKwspLetters([student]),
                          )
                        }
                      >
                        <Download /> {t('common.download')}
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={t('common.actions')}
                          >
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            variant="destructive"
                            disabled={removeKwsp.isPending}
                            onClick={() => {
                              setErr(null)
                              removeKwsp.mutate([studentId], { onError: failed })
                            }}
                          >
                            {t('common.remove')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={createKwsp.isPending}
                      onClick={() => {
                        setErr(null)
                        createKwsp.mutate([studentId], { onError: failed })
                      }}
                    >
                      <Plus /> {t('common.create')}
                    </Button>
                  )
                }
              />
            </ul>
            {err ? <p className="text-destructive mt-3 text-sm">{err}</p> : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}
