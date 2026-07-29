import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Archive,
  ClipboardList,
  FileCheck2,
  FileText,
  Layers,
  MoreHorizontal,
  Plus,
  Users,
} from 'lucide-react'
import { formatMYR } from '@hawary/shared'
import { useAcademy } from '@/lib/academy'
import { useT } from '@/lib/i18n'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { CourseFormDialog } from '@/features/courses/CourseFormDialog'
import {
  countOf,
  useActiveStudentCounts,
  useCourses,
  useUpdateCourse,
  COURSE_STATUS_LABEL,
  type Course,
  type CourseRow,
  type CourseStatus,
} from '@/features/courses/api'

const STATUS_VARIANT: Record<CourseStatus, 'default' | 'secondary' | 'outline'> =
  {
    published: 'default',
    draft: 'secondary',
    archived: 'outline',
  }

function Stat({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof FileText
  value: number
  label: string
}) {
  return (
    <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span className="text-foreground font-medium tabular-nums">{value}</span>
      <span>{label}</span>
    </div>
  )
}

export function CoursesPage() {
  const { activeAcademyId, active } = useAcademy()
  const { t } = useT()
  const isStaff = active?.role === 'admin' || active?.role === 'trainer'
  const { data: courses, isLoading, error } = useCourses(activeAcademyId)
  const { data: studentCounts } = useActiveStudentCounts(activeAcademyId)
  const updateCourse = useUpdateCourse(activeAcademyId ?? '')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [archivedOpen, setArchivedOpen] = useState(false)
  const [editing, setEditing] = useState<Course | null>(null)

  // Archived courses are kept out of the grid entirely; they stay reachable
  // through the "Archived" dialog, which is the only place they render.
  const [live, archived] = useMemo(() => {
    const all = courses ?? []
    return [
      all.filter((c) => c.status !== 'archived'),
      all.filter((c) => c.status === 'archived'),
    ]
  }, [courses])

  const openNew = () => {
    setEditing(null)
    setDialogOpen(true)
  }
  const openEdit = (c: Course) => {
    setEditing(c)
    setDialogOpen(true)
  }
  const setStatus = (c: CourseRow, status: CourseStatus) =>
    updateCourse.mutate({ id: c.id, patch: { status } })

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t('common.courses')}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {t('courses.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {archived.length > 0 ? (
            <Button variant="outline" onClick={() => setArchivedOpen(true)}>
              <Archive />{' '}
              {t('courses.archived_count', { count: archived.length })}
            </Button>
          ) : null}
          {isStaff ? (
            <Button onClick={openNew}>
              <Plus /> {t('courses.new')}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-6">
        {isLoading ? (
          <div className="text-muted-foreground rounded-xl border p-8 text-center text-sm">
            {t('common.loading')}
          </div>
        ) : error ? (
          <div className="text-destructive rounded-xl border p-8 text-center text-sm">
            {error.message}
          </div>
        ) : live.length === 0 ? (
          <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 text-center">
            {/* Distinguish "nothing exists" from "everything is archived" —
                otherwise archiving the last course looks like data loss. */}
            {archived.length > 0 ? (
              <>
                <p className="text-muted-foreground text-sm">
                  {t('courses.empty.all_archived')}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button variant="outline" onClick={() => setArchivedOpen(true)}>
                    <Archive />{' '}
                    {t('courses.view_archived', { count: archived.length })}
                  </Button>
                  {isStaff ? (
                    <Button onClick={openNew}>
                      <Plus /> {t('courses.new')}
                    </Button>
                  ) : null}
                </div>
              </>
            ) : (
              <>
                <p className="text-muted-foreground text-sm">
                  {t('courses.empty.none')}
                </p>
                {isStaff ? (
                  <Button onClick={openNew} variant="outline">
                    <Plus /> {t('courses.empty.create_first')}
                  </Button>
                ) : null}
              </>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {live.map((c) => (
              <Card
                key={c.id}
                className="hover:border-foreground/20 relative gap-0 transition-colors"
              >
                <CardHeader className="gap-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      {/* Stretched link: the whole card is the hit target, but
                          the menu below sits above it via z-index. */}
                      <Link
                        to={`/courses/${c.id}`}
                        className="after:absolute after:inset-0 focus-visible:outline-none"
                      >
                        <h2 className="truncate font-medium">{c.title}</h2>
                      </Link>
                      {c.code ? (
                        <p className="text-muted-foreground mt-0.5 truncate text-xs">
                          {c.code}
                        </p>
                      ) : null}
                      {c.description ? (
                        <p className="text-muted-foreground mt-2 line-clamp-2 text-sm">
                          {c.description}
                        </p>
                      ) : null}
                    </div>
                    {isStaff ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="relative z-10 -mt-1 -mr-1 shrink-0"
                          >
                            <MoreHorizontal />
                            <span className="sr-only">
                              {t('common.actions')}
                            </span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(c)}>
                            {t('courses.menu.edit_details')}
                          </DropdownMenuItem>
                          {c.status === 'draft' ? (
                            <DropdownMenuItem
                              onClick={() => setStatus(c, 'published')}
                            >
                              {t('common.publish')}
                            </DropdownMenuItem>
                          ) : null}
                          {c.status === 'published' ? (
                            <DropdownMenuItem
                              onClick={() => setStatus(c, 'draft')}
                            >
                              {t('common.unpublish')}
                            </DropdownMenuItem>
                          ) : null}
                          <DropdownMenuSeparator />
                          {/* Only non-archived courses reach the grid, so there
                              is no Restore case here — that lives in the
                              Archived dialog. */}
                          <DropdownMenuItem
                            onClick={() => setStatus(c, 'archived')}
                          >
                            <Archive /> {t('courses.menu.archive')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </div>
                </CardHeader>

                {/* mt-auto: cards in a row stretch to the tallest, so pin the
                    stats to the bottom rather than letting a long description
                    push them out of line with the neighbouring cards. */}
                <CardContent className="mt-auto space-y-3 pt-4">
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                    <Stat
                      icon={Users}
                      value={studentCounts?.get(c.id) ?? 0}
                      label={t('common.students')}
                    />
                    <Stat
                      icon={Layers}
                      value={countOf(c.modules)}
                      label={t('common.modules')}
                    />
                    <Stat
                      icon={FileText}
                      value={countOf(c.notes)}
                      label={t('common.notes')}
                    />
                    <Stat
                      icon={ClipboardList}
                      value={countOf(c.assessments)}
                      label={t('courses.assessments')}
                    />
                    <Stat
                      icon={FileCheck2}
                      value={countOf(c.assignments)}
                      label={t('courses.assignments')}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2 border-t pt-3">
                    <Badge
                      variant={STATUS_VARIANT[c.status]}
                      className="capitalize"
                    >
                      {t(COURSE_STATUS_LABEL[c.status])}
                    </Badge>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {formatMYR(c.price_sen)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
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

      <Dialog open={archivedOpen} onOpenChange={setArchivedOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('courses.archived.title')}</DialogTitle>
            <DialogDescription>
              {t('courses.archived.description')}
            </DialogDescription>
          </DialogHeader>

          {archived.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              {t('courses.archived.empty')}
            </p>
          ) : (
            <ul className="-mx-1 max-h-[60vh] divide-y overflow-y-auto">
              {archived.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center gap-3 px-1 py-3 first:pt-0"
                >
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/courses/${c.id}`}
                      onClick={() => setArchivedOpen(false)}
                      className="block truncate text-sm font-medium hover:underline"
                    >
                      {c.title}
                    </Link>
                    <p className="text-muted-foreground mt-0.5 truncate text-xs">
                      {[c.code, formatMYR(c.price_sen)]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  {isStaff ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      disabled={updateCourse.isPending}
                      onClick={() => setStatus(c, 'draft')}
                    >
                      {t('courses.archived.restore')}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
