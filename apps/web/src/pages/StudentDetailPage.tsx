import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Pencil, Plus, X } from 'lucide-react'
import { useAcademy } from '@/lib/academy'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { StudentFormDialog } from '@/features/students/StudentFormDialog'
import { EnrollCourseDialog } from '@/features/students/EnrollCourseDialog'
import { STATUS_META } from '@/features/students/status'
import {
  useArchiveStudent,
  useStudent,
  useStudentEnrollments,
  useUnenroll,
  useUpdateStudent,
  type StudentStatus,
} from '@/features/students/api'

function initials(name?: string | null, email?: string | null) {
  const src = (name || email || '').trim()
  if (!src) return 'S'
  const parts = src.split(/\s+/).filter(Boolean)
  if (parts.length >= 2)
    return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase()
  return src.slice(0, 2).toUpperCase()
}

function fmtDate(iso: string | null, opts: Intl.DateTimeFormatOptions) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-MY', opts)
}

function Field({
  label,
  value,
  className,
}: {
  label: string
  value: ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-0.5 text-sm">
        {value || <span className="text-muted-foreground">—</span>}
      </dd>
    </div>
  )
}

export function StudentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { activeAcademyId, active } = useAcademy()
  const academyId = activeAcademyId ?? ''
  const isStaff = active?.role === 'admin' || active?.role === 'trainer'

  const { data: student, isLoading, error } = useStudent(id)
  const { data: enrollments } = useStudentEnrollments(id)
  const updateStudent = useUpdateStudent(academyId)
  const archiveStudent = useArchiveStudent(academyId)
  const unenroll = useUnenroll(academyId, id ?? '')

  const [editOpen, setEditOpen] = useState(false)
  const [enrollOpen, setEnrollOpen] = useState(false)

  if (isLoading) {
    return (
      <div className="text-muted-foreground py-16 text-center text-sm">
        Loading…
      </div>
    )
  }
  if (error || !student) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <p className="text-muted-foreground text-sm">Student not found.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/students">Back to students</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/students">
          <ArrowLeft /> Students
        </Link>
      </Button>

      {/* 1. Header */}
      <Card>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <Avatar className="size-16">
            <AvatarImage src={student.avatar_url ?? undefined} />
            <AvatarFallback className="text-lg">
              {initials(student.full_name, student.email)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <h1 className="text-xl font-semibold tracking-tight">
              {student.full_name ?? 'Unnamed student'}
            </h1>
            <p className="text-muted-foreground text-sm">
              Member since{' '}
              {fmtDate(student.created_at, { month: 'long', year: 'numeric' })} ·
              ID {student.student_no}
            </p>
          </div>
          {isStaff ? (
            <div className="flex items-center gap-2">
              <Select
                value={student.status}
                onValueChange={(v) =>
                  updateStudent.mutate({
                    id: student.id,
                    patch: { status: v as StudentStatus },
                  })
                }
              >
                <SelectTrigger size="sm" className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(STATUS_META) as StudentStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_META[s].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={() => setEditOpen(true)}>
                <Pencil /> Edit profile
              </Button>
            </div>
          ) : (
            <Badge variant={STATUS_META[student.status].variant}>
              {STATUS_META[student.status].label}
            </Badge>
          )}
        </CardContent>
      </Card>

      {/* 2. Personal details */}
      <Card>
        <CardHeader>
          <CardTitle>Personal details</CardTitle>
          <CardDescription>
            View only — use “Edit profile” to make changes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Field label="Student ID" value={student.student_no} />
            <Field label="IC Number" value={student.ic_number} />
            <Field
              label="Gender"
              value={
                student.gender ? (
                  <span className="capitalize">{student.gender}</span>
                ) : null
              }
            />
            <Field
              label="Date of birth"
              value={fmtDate(student.date_of_birth, {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            />
            <Field label="Phone" value={student.phone} />
            <Field label="Email" value={student.email} />
            <Field
              label="Address"
              value={student.address}
              className="sm:col-span-2"
            />
          </dl>
        </CardContent>
      </Card>

      {/* 3. Enrolled courses */}
      <Card>
        <CardHeader>
          <CardTitle>Enrolled courses</CardTitle>
          {isStaff ? (
            <CardAction>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEnrollOpen(true)}
              >
                <Plus /> Add course
              </Button>
            </CardAction>
          ) : null}
        </CardHeader>
        <CardContent>
          {!enrollments || enrollments.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Not enrolled in any courses yet.
            </p>
          ) : (
            <ul className="divide-y">
              {enrollments.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div>
                    <div className="text-sm font-medium">
                      {e.courses?.title ?? 'Course'}
                    </div>
                    <div className="text-muted-foreground text-xs capitalize">
                      {e.status}
                    </div>
                  </div>
                  {isStaff ? (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => unenroll.mutate(e.id)}
                      aria-label="Remove enrollment"
                    >
                      <X />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* 4. Danger zone */}
      {isStaff ? (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-destructive">Danger zone</CardTitle>
            <CardDescription>
              Archiving removes this student from your lists.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">Archive student</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Archive this student?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {student.full_name ?? 'This student'} will be hidden from
                    your students list.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={async () => {
                      await archiveStudent.mutateAsync(student.id)
                      navigate('/students')
                    }}
                  >
                    Archive
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      ) : null}

      <StudentFormDialog
        academyId={academyId}
        student={student}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <EnrollCourseDialog
        academyId={academyId}
        studentId={student.id}
        enrolledCourseIds={(enrollments ?? []).map((e) => e.course_id)}
        open={enrollOpen}
        onOpenChange={setEnrollOpen}
      />
    </div>
  )
}
