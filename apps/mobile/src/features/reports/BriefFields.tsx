import { useT } from '@/lib/i18n'
import { Field, Input } from '@/ui'

/**
 * The three things a report says besides its title: introduction, objectives,
 * problem statement. Used by both send sheets and by the thread screen, where a
 * student fills in the ones a report was sent without — `only` narrows it to
 * those (docs/report-checks.md → "What a report says").
 */
export type Brief = {
  introduction: string
  objectives: string
  problem: string
}

export const EMPTY_BRIEF: Brief = { introduction: '', objectives: '', problem: '' }

export function briefComplete(b: Brief): boolean {
  return (
    b.introduction.trim() !== '' &&
    b.objectives.trim() !== '' &&
    b.problem.trim() !== ''
  )
}

const FIELDS = [
  { key: 'introduction', labelKey: 'report.submit.introduction' },
  { key: 'objectives', labelKey: 'report.submit.objectives' },
  { key: 'problem', labelKey: 'report.submit.problem' },
] as const

export function BriefFields({
  value,
  onChange,
  disabled,
  only,
}: {
  value: Brief
  onChange: (next: Brief) => void
  disabled?: boolean
  only?: (keyof Brief)[]
}) {
  const { t } = useT()
  return (
    <>
      {FIELDS.filter((f) => !only || only.includes(f.key)).map((f) => (
        <Field key={f.key} label={t(f.labelKey)}>
          <Input
            value={value[f.key]}
            onChangeText={(text) => onChange({ ...value, [f.key]: text })}
            multiline
            maxLength={5000}
            editable={!disabled}
          />
        </Field>
      ))}
    </>
  )
}
