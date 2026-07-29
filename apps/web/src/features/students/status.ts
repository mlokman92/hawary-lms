import type { TKey } from '@/lib/i18n'
import type { StudentStatus } from './api'

type Variant = 'default' | 'secondary' | 'outline' | 'destructive'

/**
 * The label is a translation key, not a string: this map is a module constant,
 * so it is built once — before any language is known — while the four surfaces
 * that render it (list, detail, dashboard, learner profile) all have a `t`.
 */
export const STATUS_META: Record<
  StudentStatus,
  { labelKey: TKey; variant: Variant }
> = {
  active: { labelKey: 'status.student.active', variant: 'default' },
  trial: { labelKey: 'status.student.trial', variant: 'secondary' },
  inactive: { labelKey: 'status.student.inactive', variant: 'outline' },
  withdrawn: { labelKey: 'status.student.withdrawn', variant: 'destructive' },
  unenrolled: { labelKey: 'status.student.unenrolled', variant: 'outline' },
}

// Statuses an admin can set manually. "unenrolled" is derived (no courses), so
// it is not offered as a manual choice.
export const MANUAL_STATUSES: StudentStatus[] = [
  'active',
  'trial',
  'inactive',
  'withdrawn',
]
