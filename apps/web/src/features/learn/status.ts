import type { Enums } from '@hawary/shared'
import type { TKey } from '@/lib/i18n'
import type { LearnTask } from './dashboard'

type Variant = 'default' | 'secondary' | 'outline' | 'destructive'

/**
 * One vocabulary for "where does this task stand". LearnWorkPage used to say
 * "Handed in" for the same row LearnAssignmentPage rendered as "submitted";
 * the label belongs next to the enum, not at each call site.
 *
 * The label is a translation key, not a string — these are module constants,
 * built before a language is known, and every call site has a `t`.
 */
export const TASK_STATE_META: Record<
  LearnTask['state'],
  { labelKey: TKey; variant: Variant }
> = {
  todo: { labelKey: 'status.task.todo', variant: 'outline' },
  in_progress: { labelKey: 'status.task.in_progress', variant: 'secondary' },
  awaiting: { labelKey: 'status.task.awaiting', variant: 'default' },
  marked: { labelKey: 'status.task.marked', variant: 'default' },
}

/** The raw submission_status enum, in the same words the task states use. */
export const SUBMISSION_STATUS_META: Record<
  Enums<'submission_status'>,
  { labelKey: TKey; variant: Variant }
> = {
  draft: { labelKey: 'status.submission.draft', variant: 'secondary' },
  submitted: { labelKey: 'status.submission.submitted', variant: 'default' },
  graded: { labelKey: 'status.submission.graded', variant: 'default' },
  returned: {
    labelKey: 'status.submission.returned',
    variant: 'destructive',
  },
}

/** Attempt status, for the assessment history list. */
export const ATTEMPT_STATUS_META: Record<
  Enums<'attempt_status'>,
  { labelKey: TKey; variant: Variant }
> = {
  in_progress: { labelKey: 'status.attempt.in_progress', variant: 'secondary' },
  submitted: { labelKey: 'status.attempt.submitted', variant: 'default' },
  graded: { labelKey: 'status.attempt.graded', variant: 'default' },
}
