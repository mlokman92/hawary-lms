import { useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useAcademy } from '@/lib/academy'
import { useAuth } from '@/lib/auth'
import { useCourses } from '@/features/courses/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useAssessments, useCreateAssessment } from '@/features/assessments/api'

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-MY', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function AssessmentsPage() {
  const navigate = useNavigate()
  const { activeAcademyId, active } = useAcademy()
  const { user } = useAuth()
  const academyId = activeAcademyId ?? ''
  const isStaff = active?.role === 'admin' || active?.role === 'trainer'
  const { data: courses } = useCourses(activeAcademyId)

  const [params, setParams] = useSearchParams()
  const courseId = params.get('course') ?? ''

  useEffect(() => {
    if (!courseId && courses && courses.length > 0) {
      setParams({ course: courses[0].id }, { replace: true })
    }
  }, [courseId, courses, setParams])

  const { data: assessments, isLoading } = useAssessments(
    activeAcademyId,
    courseId || null,
  )
  const createAssessment = useCreateAssessment(academyId, courseId)

  async function newAssessment() {
    const a = await createAssessment.mutateAsync({
      title: 'Untitled assessment',
      created_by: user?.id ?? null,
    })
    navigate(`/assessments/${a.id}`)
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Assessments</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Instructions and open-ended questions per course.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {courses && courses.length > 0 ? (
            <Select
              value={courseId}
              onValueChange={(v) => setParams({ course: v }, { replace: true })}
            >
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Select a course" />
              </SelectTrigger>
              <SelectContent>
                {courses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          {isStaff && courseId ? (
            <Button onClick={newAssessment} disabled={createAssessment.isPending}>
              <Plus /> New assessment
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-6">
        {!courses || courses.length === 0 ? (
          <div className="text-muted-foreground rounded-xl border border-dashed p-10 text-center text-sm">
            Create a course first.{' '}
            <Link
              to="/courses"
              className="text-primary underline-offset-4 hover:underline"
            >
              Go to courses
            </Link>
          </div>
        ) : isLoading ? (
          <div className="text-muted-foreground rounded-xl border p-8 text-center text-sm">
            Loading…
          </div>
        ) : !assessments || assessments.length === 0 ? (
          <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 rounded-xl border border-dashed text-center">
            <p className="text-muted-foreground text-sm">
              No assessments in this course yet.
            </p>
            {isStaff ? (
              <Button onClick={newAssessment} variant="outline">
                <Plus /> New assessment
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Questions</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assessments.map((a) => (
                  <TableRow
                    key={a.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/assessments/${a.id}`)}
                  >
                    <TableCell className="font-medium">{a.title}</TableCell>
                    <TableCell className="tabular-nums">
                      {a.questions[0]?.count ?? 0}
                    </TableCell>
                    <TableCell>
                      <Badge variant={a.is_published ? 'default' : 'secondary'}>
                        {a.is_published ? 'Published' : 'Draft'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {fmtDate(a.updated_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  )
}
