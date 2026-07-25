import type { StudentStatus } from './api'

type Variant = 'default' | 'secondary' | 'outline' | 'destructive'

export const STATUS_META: Record<
  StudentStatus,
  { label: string; variant: Variant }
> = {
  active: { label: 'Active', variant: 'default' },
  trial: { label: 'Trial', variant: 'secondary' },
  inactive: { label: 'Inactive', variant: 'outline' },
  withdrawn: { label: 'Withdrawn', variant: 'destructive' },
  unenrolled: { label: 'Unenrolled', variant: 'outline' },
}

// Statuses an admin can set manually. "unenrolled" is derived (no courses), so
// it is not offered as a manual choice.
export const MANUAL_STATUSES: StudentStatus[] = [
  'active',
  'trial',
  'inactive',
  'withdrawn',
]
