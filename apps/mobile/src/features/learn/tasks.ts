import type { TFn } from '@/lib/i18n'
import type { LearnTask } from './dashboard'

/** "Due tomorrow", "Overdue by 3d" — one wording for every list of work. */
export function dueLabel(task: LearnTask, t: TFn): string {
  if (!task.due_at) return t('learn.due.none')
  const diff = new Date(task.due_at).getTime() - Date.now()
  const days = Math.round(diff / 86_400_000)
  if (diff < 0) return t('learn.due.overdue_by', { days: Math.abs(days) || 1 })
  if (days === 0) return t('learn.due.today')
  if (days === 1) return t('learn.due.tomorrow')
  return t('learn.due.in_days', { days })
}

export const taskHref = (task: Pick<LearnTask, 'kind' | 'id'>) =>
  task.kind === 'assignment'
    ? `/assignments/${task.id}`
    : `/assessments/${task.id}`
