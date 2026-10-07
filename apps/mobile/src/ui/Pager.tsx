import { View } from 'react-native'
import { useT } from '@/lib/i18n'
import { Button, T, space } from './index'

/**
 * Previous / next under a server-paged list. Renders nothing when everything
 * fits on one page — the same lists are paged on the web for the same reason:
 * PostgREST silently caps a request, and an academy passes 500 rows sooner
 * than anybody expects.
 */
export function Pager({
  page,
  pageSize,
  total,
  onChange,
}: {
  /** 1-based. */
  page: number
  pageSize: number
  total: number
  onChange: (page: number) => void
}) {
  const { t } = useT()
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (pages <= 1) return null
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
      <Button
        small
        variant="outline"
        title={t('common.previous')}
        disabled={page <= 1}
        onPress={() => onChange(page - 1)}
      />
      <T v="small" muted center style={{ flex: 1 }}>
        {t('common.page_of', { page, pages })}
      </T>
      <Button
        small
        variant="outline"
        title={t('common.next')}
        disabled={page >= pages}
        onPress={() => onChange(page + 1)}
      />
    </View>
  )
}
