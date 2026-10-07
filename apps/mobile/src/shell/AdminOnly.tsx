import type { ReactNode } from 'react'
import { useT } from '@/lib/i18n'
import { Empty } from '@/ui'
import { useScope } from './scope'

/**
 * The route guard for the money screens — the phone's `AdminRoute`.
 *
 * Money is admin-only, and the boundary is RLS (docs/money-is-admin-only.md).
 * This exists for the other half of that decision: a trainer who reached a
 * money screen anyway — by a link, say — would get an empty ledger that reads
 * as data loss. So the screen underneath is not mounted at all for a
 * non-admin, which also means none of its queries fire.
 *
 * `children` is a function so that the admin's academy id arrives already
 * narrowed to a string.
 */
export function AdminOnly({ children }: { children: (academyId: string) => ReactNode }) {
  const { t } = useT()
  const { academyId, isAdmin } = useScope()
  if (!isAdmin || !academyId) {
    return <Empty icon="lock" title={t('incentives.admin_only')} />
  }
  return <>{children(academyId)}</>
}
