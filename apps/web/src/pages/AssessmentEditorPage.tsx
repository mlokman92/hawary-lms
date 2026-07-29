import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowDown, ArrowLeft, ArrowUp, Plus, Trash2 } from 'lucide-react'
import type { Json } from '@hawary/shared'
import { parseBlocks, type Block } from '@/lib/blocks'
import { useAcademy } from '@/lib/academy'
import { useT } from '@/lib/i18n'
import { BlocksEditor } from '@/components/BlocksEditor'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  useAssessment,
  useDeleteAssessment,
  useQuestions,
  useSaveAssessment,
  type QuestionDraft,
} from '@/features/assessments/api'

export function AssessmentEditorPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t, tn } = useT()
  const { activeAcademyId, active } = useAcademy()
  const academyId = activeAcademyId ?? ''
  const isStaff = active?.role === 'admin' || active?.role === 'trainer'

  const { data: assessment, isLoading, error } = useAssessment(id)
  const { data: serverQuestions } = useQuestions(id)
  const courseId = assessment?.course_id ?? ''
  const save = useSaveAssessment(academyId, courseId, id ?? '')
  const del = useDeleteAssessment(academyId, courseId)

  const [title, setTitle] = useState('')
  const [published, setPublished] = useState(false)
  const [blocks, setBlocks] = useState<Block[]>([])
  const [questions, setQuestions] = useState<QuestionDraft[]>([])
  const [deletedIds, setDeletedIds] = useState<string[]>([])
  const [dirty, setDirty] = useState(false)
  const [seeded, setSeeded] = useState(false)

  useEffect(() => {
    if (seeded || !assessment || !serverQuestions) return
    setTitle(assessment.title)
    setPublished(assessment.is_published)
    setBlocks(parseBlocks(assessment.instructions))
    setQuestions(
      serverQuestions.map((q) => ({
        key: q.id,
        id: q.id,
        prompt: q.prompt,
        points: Number(q.points),
      })),
    )
    setSeeded(true)
  }, [seeded, assessment, serverQuestions])

  const addQuestion = () => {
    setQuestions((qs) => [
      ...qs,
      { key: crypto.randomUUID(), id: null, prompt: '', points: 1 },
    ])
    setDirty(true)
  }
  const changeQuestion = (key: string, patch: Partial<QuestionDraft>) => {
    setQuestions((qs) => qs.map((q) => (q.key === key ? { ...q, ...patch } : q)))
    setDirty(true)
  }
  const removeQuestion = (q: QuestionDraft) => {
    if (q.id) setDeletedIds((d) => [...d, q.id!])
    setQuestions((qs) => qs.filter((x) => x.key !== q.key))
    setDirty(true)
  }
  const moveQuestion = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= questions.length) return
    const next = [...questions]
    ;[next[i], next[j]] = [next[j], next[i]]
    setQuestions(next)
    setDirty(true)
  }

  async function onSave() {
    const res = await save.mutateAsync({
      patch: {
        title: title.trim() || t('assess.title_placeholder'),
        is_published: published,
        instructions: blocks as unknown as Json,
      },
      questions,
      deletedIds,
    })
    setQuestions((prev) =>
      prev.map((q) => {
        const m = res.inserted.find((x) => x.key === q.key)
        return m ? { ...q, id: m.id } : q
      }),
    )
    setDeletedIds([])
    setDirty(false)
  }

  if (isLoading) {
    return (
      <div className="text-muted-foreground py-16 text-center text-sm">
        {t('common.loading')}
      </div>
    )
  }
  if (error || !assessment) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <p className="text-muted-foreground text-sm">{t('assess.not_found')}</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/courses">{t('assess.not_found.back')}</Link>
        </Button>
      </div>
    )
  }

  const totalPoints = questions.reduce((sum, q) => sum + (q.points || 0), 0)

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div className="flex items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to={`/courses/${courseId}`}>
            <ArrowLeft /> {t('common.course')}
          </Link>
        </Button>
        {isStaff ? (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={published ? 'default' : 'outline'}
              onClick={() => {
                setPublished((p) => !p)
                setDirty(true)
              }}
            >
              {published ? t('common.published') : t('common.draft')}
            </Button>
            <Button onClick={onSave} disabled={save.isPending || !dirty}>
              {save.isPending
                ? t('common.saving')
                : dirty
                  ? t('common.save')
                  : t('common.saved')}
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={t('assess.delete.aria')}
                >
                  <Trash2 />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('assess.delete.title')}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('assess.delete.body', {
                      title: title || t('common.untitled'),
                    })}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={async () => {
                      await del.mutateAsync(assessment.id)
                      navigate(`/courses/${courseId}`)
                    }}
                  >
                    {t('common.delete')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ) : null}
      </div>

      <Input
        value={title}
        onChange={(e) => {
          setTitle(e.target.value)
          setDirty(true)
        }}
        placeholder={t('assess.title_placeholder')}
        className="h-11 text-lg font-semibold md:text-lg"
        disabled={!isStaff}
      />

      <Card>
        <CardHeader>
          <CardTitle>{t('assess.instructions.title')}</CardTitle>
          <CardDescription>{t('assess.instructions.desc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <BlocksEditor
            // The row's own tenant, not the ambient active academy: storage RLS
            // checks this path segment, and staff access to this row proves it.
            academyId={assessment.academy_id}
            bucket="note-media"
            blocks={blocks}
            onChange={(b) => {
              setBlocks(b)
              setDirty(true)
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('assess.questions.title')}</CardTitle>
          <CardDescription>
            {t('assess.questions.meta', {
              questions: tn('assess.questions.count', questions.length),
              points: tn('assess.points.count', totalPoints),
            })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {questions.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {t('assess.questions.empty')}
            </p>
          ) : (
            questions.map((q, i) => (
              <div key={q.key} className="rounded-lg border p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-muted-foreground text-xs font-medium">
                    {t('assess.question.n', { n: i + 1 })}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      disabled={i === 0}
                      onClick={() => moveQuestion(i, -1)}
                      aria-label={t('assess.question.move_up')}
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      disabled={i === questions.length - 1}
                      onClick={() => moveQuestion(i, 1)}
                      aria-label={t('assess.question.move_down')}
                    >
                      <ArrowDown />
                    </Button>
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      onClick={() => removeQuestion(q)}
                      aria-label={t('assess.question.remove')}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
                <Textarea
                  value={q.prompt}
                  onChange={(e) =>
                    changeQuestion(q.key, { prompt: e.target.value })
                  }
                  placeholder={t('assess.question.prompt_placeholder')}
                  rows={2}
                  disabled={!isStaff}
                />
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-muted-foreground text-xs">
                    {t('assess.question.points')}
                  </span>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={q.points}
                    onChange={(e) =>
                      changeQuestion(q.key, {
                        points: Number(e.target.value) || 0,
                      })
                    }
                    className="h-8 w-24"
                    disabled={!isStaff}
                  />
                </div>
              </div>
            ))
          )}
          {isStaff ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addQuestion}
            >
              <Plus /> {t('assess.question.add')}
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
