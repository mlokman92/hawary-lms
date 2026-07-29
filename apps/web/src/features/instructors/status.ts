import type { TKey } from '@/lib/i18n'
import type { InstructorStatus } from './api'

type Variant = 'default' | 'secondary' | 'outline' | 'destructive'

/** Translation keys rather than strings — see the note in `students/status`. */
export const STATUS_META: Record<
  InstructorStatus,
  { labelKey: TKey; variant: Variant }
> = {
  active: { labelKey: 'status.instructor.active', variant: 'default' },
  on_leave: { labelKey: 'status.instructor.on_leave', variant: 'secondary' },
  inactive: { labelKey: 'status.instructor.inactive', variant: 'outline' },
}

// Statuses an admin can set manually. "unassigned" is derived (no courses), so
// it is not offered as a manual choice.
export const MANUAL_STATUSES: InstructorStatus[] = [
  'active',
  'on_leave',
  'inactive',
]
