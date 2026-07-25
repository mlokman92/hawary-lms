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
import {
  useAssignments,
  useCreateAssignment,
} from '@/features/assignments/api'

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-MY', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function AssignmentsPage() {
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

  const { data: assignments, isLoading } = useAssignments(
    activeAcademyId,
    courseId || null,
  )
  const createAssignment = useCreateAssignment(academyId, courseId)

  async function newAssignment() {
    const a = await createAssignment.mutateAsync({
      title: 'Untitled assignment',
      created_by: user?.id ?? null,
    })
    navigate(`/assignments/${a.id}`)
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Assignments</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Briefs students submit against, per course.
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
            <Button onClick={newAssignment} disabled={createAssignment.isPending}>
              <Plus /> New assignment
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
        ) : !assignments || assignments.length === 0 ? (
          <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 rounded-xl border border-dashed text-center">
            <p className="text-muted-foreground text-sm">
              No assignments in this course yet.
            </p>
            {isStaff ? (
              <Button onClick={newAssignment} variant="outline">
                <Plus /> New assignment
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead className="text-right">Points</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map((a) => (
                  <TableRow
                    key={a.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/assignments/${a.id}`)}
                  >
                    <TableCell className="font-medium">{a.title}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {a.due_at ? fmtDate(a.due_at) : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {a.total_points}
                    </TableCell>
                    <TableCell>
                      <Badge variant={a.is_published ? 'default' : 'secondary'}>
                        {a.is_published ? 'Published' : 'Draft'}
                      </Badge>
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
