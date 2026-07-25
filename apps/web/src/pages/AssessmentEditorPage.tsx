import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowDown, ArrowLeft, ArrowUp, Plus, Trash2 } from 'lucide-react'
import type { Json } from '@hawary/shared'
import { parseBlocks, type Block } from '@/lib/blocks'
import { useAcademy } from '@/lib/academy'
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
        title: title.trim() || 'Untitled assessment',
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
        Loading…
      </div>
    )
  }
  if (error || !assessment) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <p className="text-muted-foreground text-sm">Assessment not found.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/assessments">Back to assessments</Link>
        </Button>
      </div>
    )
  }

  const totalPoints = questions.reduce((sum, q) => sum + (q.points || 0), 0)

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div className="flex items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to={`/assessments?course=${courseId}`}>
            <ArrowLeft /> Assessments
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
              {published ? 'Published' : 'Draft'}
            </Button>
            <Button onClick={onSave} disabled={save.isPending || !dirty}>
              {save.isPending ? 'Saving…' : dirty ? 'Save' : 'Saved'}
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="icon" aria-label="Delete assessment">
                  <Trash2 />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this assessment?</AlertDialogTitle>
                  <AlertDialogDescription>
                    “{title || 'Untitled'}” and its questions will be permanently
                    deleted.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={async () => {
                      await del.mutateAsync(assessment.id)
                      navigate(`/assessments?course=${courseId}`)
                    }}
                  >
                    Delete
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
        placeholder="Untitled assessment"
        className="h-11 text-lg font-semibold md:text-lg"
        disabled={!isStaff}
      />

      <Card>
        <CardHeader>
          <CardTitle>Instructions</CardTitle>
          <CardDescription>
            Explanation, directives and any reference material.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BlocksEditor
            academyId={academyId}
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
          <CardTitle>Questions</CardTitle>
          <CardDescription>
            Open-ended questions · {questions.length} question(s) ·{' '}
            {totalPoints} point(s)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {questions.length === 0 ? (
            <p className="text-muted-foreground text-sm">No questions yet.</p>
          ) : (
            questions.map((q, i) => (
              <div key={q.key} className="rounded-lg border p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-muted-foreground text-xs font-medium">
                    Question {i + 1}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      disabled={i === 0}
                      onClick={() => moveQuestion(i, -1)}
                      aria-label="Move up"
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      disabled={i === questions.length - 1}
                      onClick={() => moveQuestion(i, 1)}
                      aria-label="Move down"
                    >
                      <ArrowDown />
                    </Button>
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      onClick={() => removeQuestion(q)}
                      aria-label="Remove question"
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
                  placeholder="Question prompt…"
                  rows={2}
                  disabled={!isStaff}
                />
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-muted-foreground text-xs">Points</span>
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
            <Button type="button" variant="outline" size="sm" onClick={addQuestion}>
              <Plus /> Add question
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
