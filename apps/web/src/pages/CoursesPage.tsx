import { useState } from 'react'
import { MoreHorizontal, Plus } from 'lucide-react'
import { formatMYR } from '@hawary/shared'
import { useAcademy } from '@/lib/academy'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { CourseFormDialog } from '@/features/courses/CourseFormDialog'
import {
  useCourses,
  useUpdateCourse,
  type Course,
  type CourseStatus,
} from '@/features/courses/api'

const STATUS_VARIANT: Record<CourseStatus, 'default' | 'secondary' | 'outline'> =
  {
    published: 'default',
    draft: 'secondary',
    archived: 'outline',
  }

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-MY', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function CoursesPage() {
  const { activeAcademyId, active } = useAcademy()
  const isStaff = active?.role === 'admin' || active?.role === 'trainer'
  const { data: courses, isLoading, error } = useCourses(activeAcademyId)
  const updateCourse = useUpdateCourse(activeAcademyId ?? '')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Course | null>(null)

  const openNew = () => {
    setEditing(null)
    setDialogOpen(true)
  }
  const openEdit = (c: Course) => {
    setEditing(c)
    setDialogOpen(true)
  }
  const setStatus = (c: Course, status: CourseStatus) =>
    updateCourse.mutate({ id: c.id, patch: { status } })

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Courses</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Create and manage your academy’s courses.
          </p>
        </div>
        {isStaff ? (
          <Button onClick={openNew}>
            <Plus /> New course
          </Button>
        ) : null}
      </div>

      <div className="mt-6">
        {isLoading ? (
          <div className="text-muted-foreground rounded-xl border p-8 text-center text-sm">
            Loading courses…
          </div>
        ) : error ? (
          <div className="text-destructive rounded-xl border p-8 text-center text-sm">
            {error.message}
          </div>
        ) : !courses || courses.length === 0 ? (
          <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 rounded-xl border border-dashed text-center">
            <p className="text-muted-foreground text-sm">No courses yet.</p>
            {isStaff ? (
              <Button onClick={openNew} variant="outline">
                <Plus /> Create your first course
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead>Created</TableHead>
                  {isStaff ? <TableHead className="w-10" /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {courses.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="font-medium">{c.title}</div>
                      {c.code ? (
                        <div className="text-muted-foreground text-xs">
                          {c.code}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={STATUS_VARIANT[c.status]}
                        className="capitalize"
                      >
                        {c.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMYR(c.price_sen)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(c.created_at)}
                    </TableCell>
                    {isStaff ? (
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm">
                              <MoreHorizontal />
                              <span className="sr-only">Actions</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(c)}>
                              Edit
                            </DropdownMenuItem>
                            {c.status === 'draft' ? (
                              <DropdownMenuItem
                                onClick={() => setStatus(c, 'published')}
                              >
                                Publish
                              </DropdownMenuItem>
                            ) : null}
                            {c.status === 'published' ? (
                              <DropdownMenuItem
                                onClick={() => setStatus(c, 'draft')}
                              >
                                Unpublish
                              </DropdownMenuItem>
                            ) : null}
                            <DropdownMenuSeparator />
                            {c.status !== 'archived' ? (
                              <DropdownMenuItem
                                onClick={() => setStatus(c, 'archived')}
                              >
                                Archive
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                onClick={() => setStatus(c, 'draft')}
                              >
                                Restore
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {activeAcademyId ? (
        <CourseFormDialog
          academyId={activeAcademyId}
          course={editing}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
        />
      ) : null}
    </div>
  )
}
