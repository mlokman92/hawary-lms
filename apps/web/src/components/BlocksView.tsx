import { parseBlocks, youtubeId } from '@/lib/blocks'
import { useT } from '@/lib/i18n'

/**
 * Read-only counterpart to BlocksEditor, for the instructions jsonb on
 * assessments and assignments. Text blocks render as plain text (React escapes
 * them), so nothing author-supplied is ever interpreted as markup.
 */
export function BlocksView({ body }: { body: unknown }) {
  // Before the early return: hooks cannot be called conditionally.
  const { t } = useT()
  const blocks = parseBlocks(body)
  if (blocks.length === 0) return null

  return (
    <div className="space-y-4">
      {blocks.map((b) => {
        if (b.type === 'text') {
          return (
            <p key={b.id} className="text-sm leading-7 whitespace-pre-line">
              {b.text}
            </p>
          )
        }
        if (b.type === 'image') {
          return (
            <figure key={b.id} className="space-y-1">
              <img
                src={b.url}
                alt={b.caption || ''}
                className="max-h-96 rounded-md border object-contain"
              />
              {b.caption ? (
                <figcaption className="text-muted-foreground text-xs">
                  {b.caption}
                </figcaption>
              ) : null}
            </figure>
          )
        }
        const id = youtubeId(b.url)
        if (!id) return null
        return (
          <div
            key={b.id}
            className="aspect-video w-full overflow-hidden rounded-md border"
          >
            <iframe
              className="size-full"
              src={`https://www.youtube-nocookie.com/embed/${id}`}
              title={t('notes.blocks.video_title')}
              allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        )
      })}
    </div>
  )
}
