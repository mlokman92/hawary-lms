import { Plus, Trash2 } from 'lucide-react'
import type { Json } from '@hawary/shared'
import { useT } from '@/lib/i18n'
import {
  QUESTION_TYPES,
  QUESTION_TYPE_META,
  blankQuestionConfig,
  isChoiceType,
  isTextType,
  newChoice,
  parseChoiceOptions,
  parseChoiceValue,
  parseMatchingOptions,
  parsePairsValue,
  type Choice,
  type QuestionType,
} from '@/lib/questions'
import type { QuestionDraft } from '@/features/assessments/api'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

type Patch = Partial<QuestionDraft>

export function QuestionEditor({
  question,
  disabled,
  onChange,
}: {
  question: QuestionDraft
  disabled: boolean
  onChange: (patch: Patch) => void
}) {
  const { t } = useT()
  const type = question.question_type

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={type}
          disabled={disabled}
          onValueChange={(v) => onChange(blankQuestionConfig(v as QuestionType))}
        >
          <SelectTrigger className="w-52" aria-label={t('qtype.label')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {QUESTION_TYPES.map((qt) => (
              <SelectItem key={qt} value={qt}>
                {t(QUESTION_TYPE_META[qt].labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs">
            {t('assess.question.points')}
          </span>
          <Input
            type="number"
            min="0"
            step="1"
            value={question.points}
            onChange={(e) => onChange({ points: Number(e.target.value) || 0 })}
            className="h-8 w-24"
            disabled={disabled}
          />
        </div>
      </div>

      <Textarea
        value={question.prompt}
        onChange={(e) => onChange({ prompt: e.target.value })}
        placeholder={t('assess.question.prompt_placeholder')}
        rows={2}
        disabled={disabled}
      />

      {isTextType(type) ? (
        <p className="text-muted-foreground text-xs">
          {t(QUESTION_TYPE_META[type].hintKey)}
        </p>
      ) : null}

      {type === 'true_false' ? (
        <TrueFalseConfig
          value={question.correct_answer}
          disabled={disabled}
          onChange={onChange}
        />
      ) : null}

      {isChoiceType(type) ? (
        <ChoiceConfig
          multiple={type === 'multiple_choice'}
          options={question.options}
          correct={question.correct_answer}
          disabled={disabled}
          onChange={onChange}
        />
      ) : null}

      {type === 'matching' ? (
        <MatchingConfig
          options={question.options}
          correct={question.correct_answer}
          disabled={disabled}
          onChange={onChange}
        />
      ) : null}
    </div>
  )
}

function ConfigLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
      {children}
    </p>
  )
}

function TrueFalseConfig({
  value,
  disabled,
  onChange,
}: {
  value: Json | null
  disabled: boolean
  onChange: (p: Patch) => void
}) {
  const { t } = useT()
  const correct = value === true
  return (
    <div className="space-y-2">
      <ConfigLabel>{t('qedit.correct_answer')}</ConfigLabel>
      <div className="flex gap-2">
        {[true, false].map((v) => (
          <Button
            key={String(v)}
            type="button"
            size="sm"
            variant={correct === v ? 'default' : 'outline'}
            disabled={disabled}
            onClick={() => onChange({ correct_answer: v as Json })}
          >
            {v ? t('qtype.true') : t('qtype.false')}
          </Button>
        ))}
      </div>
    </div>
  )
}

function ChoiceConfig({
  multiple,
  options,
  correct,
  disabled,
  onChange,
}: {
  multiple: boolean
  options: Json | null
  correct: Json | null
  disabled: boolean
  onChange: (p: Patch) => void
}) {
  const { t } = useT()
  const { choices } = parseChoiceOptions(options)
  const selected = parseChoiceValue(correct)

  const write = (nextChoices: Choice[], nextCorrect: string[]) =>
    onChange({
      options: { choices: nextChoices } as unknown as Json,
      // Dropping an option must drop it from the key too, or the question
      // becomes unanswerable-but-gradable: no visible choice can ever match.
      correct_answer: nextCorrect.filter((id) =>
        nextChoices.some((c) => c.id === id),
      ) as unknown as Json,
    })

  const setText = (id: string, text: string) =>
    write(
      choices.map((c) => (c.id === id ? { ...c, text } : c)),
      selected,
    )

  const toggle = (id: string) =>
    write(
      choices,
      multiple
        ? selected.includes(id)
          ? selected.filter((x) => x !== id)
          : [...selected, id]
        : [id],
    )

  return (
    <div className="space-y-2">
      <ConfigLabel>
        {multiple ? t('qedit.choices.multi') : t('qedit.choices.single')}
      </ConfigLabel>
      <ul className="space-y-2">
        {choices.map((c, i) => (
          <li key={c.id} className="flex items-center gap-2">
            {multiple ? (
              <Checkbox
                id={`c-${c.id}`}
                checked={selected.includes(c.id)}
                disabled={disabled}
                onCheckedChange={() => toggle(c.id)}
                aria-label={t('qedit.mark_correct')}
              />
            ) : (
              // A single-answer key is one id, so the "group" is this row —
              // Radix needs a RadioGroup wrapper for the item to be operable.
              <RadioGroup
                value={selected[0] === c.id ? c.id : ''}
                disabled={disabled}
                onValueChange={() => toggle(c.id)}
              >
                <RadioGroupItem
                  value={c.id}
                  id={`c-${c.id}`}
                  aria-label={t('qedit.mark_correct')}
                />
              </RadioGroup>
            )}
            <Input
              value={c.text}
              disabled={disabled}
              onChange={(e) => setText(c.id, e.target.value)}
              placeholder={t('qedit.option_placeholder', { n: i + 1 })}
              aria-label={t('qedit.option_placeholder', { n: i + 1 })}
              className="h-8"
            />
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              disabled={disabled || choices.length <= 2}
              onClick={() =>
                write(
                  choices.filter((x) => x.id !== c.id),
                  selected,
                )
              }
              aria-label={t('qedit.remove_option')}
            >
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => write([...choices, newChoice()], selected)}
        >
          <Plus /> {t('qedit.add_option')}
        </Button>
        {selected.length === 0 ? (
          <span className="text-muted-foreground text-xs">
            {t('qedit.no_key_hint')}
          </span>
        ) : null}
      </div>
    </div>
  )
}

/**
 * Matching is authored as rows of pairs — left item beside its answer — because
 * that is how a person thinks about it. The two columns are stored separately
 * and the student sees the right column shuffled by app.shuffled_matching_options,
 * so authoring order never gives the pairing away.
 */
function MatchingConfig({
  options,
  correct,
  disabled,
  onChange,
}: {
  options: Json | null
  correct: Json | null
  disabled: boolean
  onChange: (p: Patch) => void
}) {
  const { t } = useT()
  const { left, right } = parseMatchingOptions(options)
  const pairs = parsePairsValue(correct)

  // Rows are driven by the left column; each left item's partner is whatever
  // the key points at. A right item with no left partner is a distractor and
  // simply has no row.
  const rows = left.map((l) => ({
    left: l,
    right: right.find((r) => r.id === pairs[l.id]) ?? null,
  }))

  const write = (nextRows: { left: Choice; right: Choice | null }[]) => {
    const nextRight = nextRows.flatMap((r) => (r.right ? [r.right] : []))
    const nextPairs: Record<string, string> = {}
    for (const r of nextRows) if (r.right) nextPairs[r.left.id] = r.right.id
    onChange({
      options: {
        left: nextRows.map((r) => r.left),
        right: nextRight,
      } as unknown as Json,
      correct_answer: nextPairs as unknown as Json,
    })
  }

  const setSide = (i: number, side: 'left' | 'right', text: string) =>
    write(
      rows.map((r, j) =>
        j !== i
          ? r
          : side === 'left'
            ? { ...r, left: { ...r.left, text } }
            : { ...r, right: r.right ? { ...r.right, text } : newChoice(text) },
      ),
    )

  return (
    <div className="space-y-2">
      <ConfigLabel>{t('qedit.pairs')}</ConfigLabel>
      <ul className="space-y-2">
        {rows.map((r, i) => (
          <li key={r.left.id} className="flex items-center gap-2">
            <Input
              value={r.left.text}
              disabled={disabled}
              onChange={(e) => setSide(i, 'left', e.target.value)}
              placeholder={t('qedit.pair_left_placeholder', { n: i + 1 })}
              aria-label={t('qedit.pair_left_placeholder', { n: i + 1 })}
              className="h-8"
            />
            <span
              aria-hidden
              className="text-muted-foreground shrink-0 text-sm"
            >
              &rarr;
            </span>
            <Input
              value={r.right?.text ?? ''}
              disabled={disabled}
              onChange={(e) => setSide(i, 'right', e.target.value)}
              placeholder={t('qedit.pair_right_placeholder', { n: i + 1 })}
              aria-label={t('qedit.pair_right_placeholder', { n: i + 1 })}
              className="h-8"
            />
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              disabled={disabled || rows.length <= 2}
              onClick={() => write(rows.filter((_, j) => j !== i))}
              aria-label={t('qedit.remove_pair')}
            >
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={() => write([...rows, { left: newChoice(), right: newChoice() }])}
      >
        <Plus /> {t('qedit.add_pair')}
      </Button>
    </div>
  )
}
