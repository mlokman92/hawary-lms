import { lazy, Suspense } from 'react'
import { useParams } from 'react-router-dom'
import { fmtDate } from '@/lib/format'
import { useT } from '@/lib/i18n'
import { useLearnNote } from '@/features/learn/api'
import { BackLink } from '@/components/patterns/BackLink'
import { EmptyState } from '@/components/patterns/EmptyState'
import { NotFoundBlock, RouteLoading } from '@/components/patterns/QueryState'

// Tiptap is heavy; keep it out of the main bundle.
const RichTextView = lazy(() =>
  import('@/components/RichTextView').then((m) => ({ default: m.RichTextView })),
)

export function LearnNotePage() {
  const { id } = useParams<{ id: string }>()
  const { t } = useT()
  const { data: note, isLoading, error } = useLearnNote(id)

  if (isLoading) return <RouteLoading />

  if (error || !note) {
    return (
      <NotFoundBlock
        message={t('learn.note.not_available')}
        backTo="/learn/courses"
        backLabel={t('learn.back_to_courses')}
      />
    )
  }

  return (
    <div className="mx-auto w-full max-w-4xl">
      <BackLink to={`/learn/courses/${note.course_id}`}>
        {t('common.course')}
      </BackLink>

      <div className="mt-4">
        <h1 className="text-2xl font-semibold tracking-tight">
          {note.title || t('common.untitled')}
        </h1>
        {note.updated_at ? (
          <p className="text-muted-foreground mt-1 text-sm">
            {t('learn.note.last_updated', { date: fmtDate(note.updated_at) })}
          </p>
        ) : null}
      </div>

      <div className="mt-6">
        {note.content ? (
          <Suspense
            fallback={
              <p className="text-muted-foreground text-sm">
                {t('learn.note.loading_content')}
              </p>
            }
          >
            <RichTextView html={note.content} />
          </Suspense>
        ) : (
          <EmptyState title={t('learn.note.empty')} />
        )}
      </div>
    </div>
  )
}
