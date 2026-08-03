import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Copy,
  FileCheck2,
  FileText,
  GraduationCap,
  Layers,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Plus,
  type LucideIcon,
} from 'lucide-react'
import { formatMYR } from '@hawary/shared'
import { useAcademy } from '@/lib/academy'
import { useAuth } from '@/lib/auth'
import { fmtDate } from '@/lib/format'
import { useT, type TKey } from '@/lib/i18n'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { CourseFormDialog } from '@/features/courses/CourseFormDialog'
import {
  ModuleItemList,
  type ModuleItem,
} from '@/features/courses/ModuleItemList'
import { DuplicateCourseDialog } from '@/features/courses/DuplicateCourseDialog'
import { ModuleFormDialog } from '@/features/modules/ModuleFormDialog'
import { useCourse, COURSE_STATUS_LABEL } from '@/features/courses/api'
import {
  useDeleteModule,
  useModules,
  useReorderModules,
  useReorderModuleItems,
  useTogglePublished,
  useUpdateModule,
  type CourseModule,
  type ItemKind,
} from '@/features/modules/api'
import { useCreateNote, useDeleteNote, useNotes } from '@/features/notes/api'
import { MaterialUploadDialog } from '@/features/materials/MaterialUploadDialog'
import {
  formatBytes,
  useDeleteMaterial,
  useMaterials,
  useOpenMaterial,
} from '@/features/materials/api'
import {
  useAssessments,
  useCreateAssessment,
  useDeleteAssessment,
} from '@/features/assessments/api'
import {
  useAssignments,
  useCreateAssignment,
  useDeleteAssignment,
} from '@/features/assignments/api'

const KIND_ICON: Record<ItemKind, LucideIcon> = {
  note: FileText,
  material: Paperclip,
  assessment: ClipboardList,
  assignment: FileCheck2,
}

// Copy is held as keys, not strings: a module constant is read before the
// language is known, so the labels are resolved at render with `t()`.
const SECTIONS: { kind: ItemKind; labelKey: TKey; addKey: TKey }[] = [
  { kind: 'note', labelKey: 'common.notes', addKey: 'courses.item.note' },
  {
    kind: 'material',
    labelKey: 'courses.materials',
    addKey: 'courses.item.material',
  },
  {
    kind: 'assessment',
    labelKey: 'courses.assessments',
    addKey: 'courses.item.assessment',
  },
  {
    kind: 'assignment',
    labelKey: 'courses.assignments',
    addKey: 'courses.item.assignment',
  },
]

const KIND_DELETE_TITLE: Record<ItemKind, TKey> = {
  note: 'courses.delete.note.title',
  material: 'courses.delete.material.title',
  assessment: 'courses.delete.assessment.title',
  assignment: 'courses.delete.assignment.title',
}

/**
 * Which modules are expanded, remembered per course.
 *
 * Authoring a course is a return trip — you open a module, edit a note, come
 * back. Collapsing everything on the way back would undo the reader's place
 * each time, so the open set outlives the navigation. Sessions only: this is
 * view state, not tenant data.
 */
function useOpenModules(courseId: string, firstModuleId: string | undefined) {
  const storageKey = `hawary.course.${courseId}.open`
  const [open, setOpen] = useState<string[] | null>(null)

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey)
      const parsed: unknown = raw ? JSON.parse(raw) : null
      if (Array.isArray(parsed)) {
        setOpen(parsed.filter((x): x is string => typeof x === 'string'))
        return
      }
    } catch {
      // A corrupt entry is not worth a broken page.
    }
    setOpen(null)
  }, [storageKey])

  // Nothing stored yet: open the first module, so the page never lands as a
  // wall of closed bars with no sign of what is inside.
  const value = open ?? (firstModuleId ? [firstModuleId] : [])

  const onChange = (next: string[]) => {
    setOpen(next)
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(next))
    } catch {
      // Private mode / quota. The accordion still works for this visit.
    }
  }

  return [value, onChange] as const
}

export function CourseDetailPage() {
  const { id: courseId = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { activeAcademyId, active } = useAcademy()
  const { user } = useAuth()
  const { t, tn } = useT()
  const academyId = activeAcademyId ?? ''
  const isStaff = active?.role === 'admin' || active?.role === 'trainer'

  const { data: course, isLoading, error } = useCourse(courseId)
  const { data: modules, isLoading: modulesLoading } = useModules(
    activeAcademyId,
    courseId,
  )
  const { data: notes } = useNotes(activeAcademyId, courseId)
  const { data: materials } = useMaterials(activeAcademyId, courseId)
  const { data: assessments } = useAssessments(activeAcademyId, courseId)
  const { data: assignments } = useAssignments(activeAcademyId, courseId)

  const updateModule = useUpdateModule(academyId, courseId)
  const deleteModule = useDeleteModule(academyId, courseId)
  const reorderModules = useReorderModules(academyId, courseId)
  const reorderItems = useReorderModuleItems(academyId, courseId)

  const createNote = useCreateNote(academyId, courseId)
  const createAssessment = useCreateAssessment(academyId, courseId)
  const createAssignment = useCreateAssignment(academyId, courseId)
  const deleteNote = useDeleteNote(academyId, courseId)
  const deleteMaterial = useDeleteMaterial(academyId, courseId)
  const deleteAssessment = useDeleteAssessment(academyId, courseId)
  const deleteAssignment = useDeleteAssignment(academyId, courseId)
  const openMaterial = useOpenMaterial()

  const togglePublished = useTogglePublished(activeAcademyId)

  const [courseDialogOpen, setCourseDialogOpen] = useState(false)
  const [duplicateOpen, setDuplicateOpen] = useState(false)
  const [moduleDialogOpen, setModuleDialogOpen] = useState(false)
  const [editingModule, setEditingModule] = useState<CourseModule | null>(null)
  const [deleteModuleTarget, setDeleteModuleTarget] =
    useState<CourseModule | null>(null)
  const [deleteItemTarget, setDeleteItemTarget] = useState<ModuleItem | null>(null)
  const [uploadTarget, setUploadTarget] = useState<{
    moduleId: string
    sortOrder: number
  } | null>(null)

  // Items keyed by module, already in sort order within each kind.
  const itemsByModule = useMemo(() => {
    const map = new Map<string, ModuleItem[]>()
    const push = (it: ModuleItem) => {
      const list = map.get(it.moduleId)
      if (list) list.push(it)
      else map.set(it.moduleId, [it])
    }
    ;(notes ?? []).forEach((n) =>
      push({
        id: n.id,
        kind: 'note',
        moduleId: n.module_id,
        title: n.title || t('common.untitled'),
        isPublished: n.is_published,
        meta: null,
        href: `/notes/${n.id}`,
      }),
    )
    ;(materials ?? []).forEach((m) =>
      push({
        id: m.id,
        kind: 'material',
        moduleId: m.module_id,
        title: m.title || m.file_name,
        isPublished: m.is_published,
        meta: formatBytes(m.size_bytes) || null,
        href: null,
      }),
    )
    ;(assessments ?? []).forEach((a) =>
      push({
        id: a.id,
        kind: 'assessment',
        moduleId: a.module_id,
        title: a.title || t('common.untitled'),
        isPublished: a.is_published,
        meta: tn('courses.item.questions', a.questions[0]?.count ?? 0),
        href: `/assessments/${a.id}`,
      }),
    )
    ;(assignments ?? []).forEach((a) =>
      push({
        id: a.id,
        kind: 'assignment',
        moduleId: a.module_id,
        title: a.title || t('common.untitled'),
        isPublished: a.is_published,
        meta: a.due_at
          ? t('courses.item.due', { date: fmtDate(a.due_at) })
          : t('courses.item.points', { points: a.total_points }),
        href: `/assignments/${a.id}`,
      }),
    )
    return map
  }, [notes, materials, assessments, assignments, t, tn])

  const kindItems = (moduleId: string, kind: ItemKind) =>
    (itemsByModule.get(moduleId) ?? []).filter((i) => i.kind === kind)

  async function addItem(kind: ItemKind, moduleId: string) {
    const sortOrder = kindItems(moduleId, kind).length
    const common = { module_id: moduleId, created_by: user?.id ?? null, sort_order: sortOrder }
    // A material starts with a file, not an empty record — there is nothing to
    // edit until one is chosen, so it goes through a dialog instead of the
    // create-then-navigate the other three use.
    if (kind === 'material') {
      setUploadTarget({ moduleId, sortOrder })
      return
    }
    if (kind === 'note') {
      const row = await createNote.mutateAsync({
        title: t('common.untitled'),
        ...common,
      })
      navigate(`/notes/${row.id}`)
    } else if (kind === 'assessment') {
      const row = await createAssessment.mutateAsync({
        title: t('courses.new_item.assessment'),
        ...common,
      })
      navigate(`/assessments/${row.id}`)
    } else {
      const row = await createAssignment.mutateAsync({
        title: t('courses.new_item.assignment'),
        ...common,
      })
      navigate(`/assignments/${row.id}`)
    }
  }

  /** An editor page for the three authored kinds; a signed URL for a material. */
  function openItem(item: ModuleItem) {
    if (item.href) navigate(item.href)
    else openMaterial.mutate({ id: item.id })
  }

  /** Append the item to the end of the target module's list for its kind. */
  function moveItemToModule(item: ModuleItem, targetModuleId: string) {
    const target = kindItems(targetModuleId, item.kind).map((s) => s.id)
    reorderItems.mutate({
      moduleId: targetModuleId,
      kind: item.kind,
      orderedIds: [...target, item.id],
    })
  }

  function moveModule(index: number, dir: -1 | 1) {
    if (!modules) return
    const j = index + dir
    if (j < 0 || j >= modules.length) return
    const next = [...modules]
    ;[next[index], next[j]] = [next[j], next[index]]
    reorderModules.mutate(next.map((m) => m.id))
  }

  async function confirmDeleteItem() {
    if (!deleteItemTarget) return
    const { kind, id } = deleteItemTarget
    if (kind === 'note') await deleteNote.mutateAsync(id)
    else if (kind === 'material') await deleteMaterial.mutateAsync(id)
    else if (kind === 'assessment') await deleteAssessment.mutateAsync(id)
    else await deleteAssignment.mutateAsync(id)
    setDeleteItemTarget(null)
  }

  async function confirmDeleteModule() {
    if (!deleteModuleTarget) return
    await deleteModule.mutateAsync(deleteModuleTarget.id)
    setDeleteModuleTarget(null)
  }

  const [openModules, setOpenModules] = useOpenModules(
    courseId,
    modules?.[0]?.id,
  )

  const openNewModule = () => {
    setEditingModule(null)
    setModuleDialogOpen(true)
  }
  const openEditModule = (m: CourseModule) => {
    setEditingModule(m)
    setModuleDialogOpen(true)
  }

  if (isLoading) {
    return (
      <div className="text-muted-foreground py-16 text-center text-sm">
        {t('common.loading')}
      </div>
    )
  }
  if (error || !course) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <p className="text-muted-foreground text-sm">{t('courses.not_found')}</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/courses">{t('courses.back_to_courses')}</Link>
        </Button>
      </div>
    )
  }

  const moduleCount = modules?.length ?? 0

  return (
    <div className="mx-auto w-full max-w-4xl">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/courses">
          <ArrowLeft /> {t('common.courses')}
        </Link>
      </Button>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              {course.title}
            </h1>
            <Badge variant="secondary" className="capitalize">
              {t(COURSE_STATUS_LABEL[course.status])}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            {[
              course.code,
              formatMYR(course.price_sen),
              tn('courses.module_count', moduleCount),
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {course.description ? (
            <p className="mt-3 max-w-2xl text-sm whitespace-pre-line">
              {course.description}
            </p>
          ) : null}
        </div>
        {isStaff ? (
          <div className="flex items-center gap-2">
            {/* The academy-wide queue, pre-filtered to this course, rather than
                /courses/:id/grading — one grading surface, reached two ways.
                That route still resolves, for older links. */}
            <Button asChild variant="outline">
              <Link to={`/assessments?course=${courseId}`}>
                <GraduationCap /> {t('courses.grading')}
              </Link>
            </Button>
            <Button variant="outline" onClick={() => setCourseDialogOpen(true)}>
              <Pencil /> {t('courses.edit')}
            </Button>
            <Button variant="outline" onClick={() => setDuplicateOpen(true)}>
              <Copy /> {t('courses.duplicate')}
            </Button>
            <Button onClick={openNewModule}>
              <Plus /> {t('courses.module.new')}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="mt-6 space-y-4">
        {modulesLoading ? (
          <div className="text-muted-foreground rounded-xl border p-8 text-center text-sm">
            {t('common.loading')}
          </div>
        ) : moduleCount === 0 ? (
          <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 text-center">
            <Layers className="text-muted-foreground size-6" aria-hidden />
            <div>
              <p className="text-sm font-medium">
                {t('courses.modules.empty.title')}
              </p>
              <p className="text-muted-foreground mt-1 text-sm">
                {t('courses.modules.empty.body')}
              </p>
            </div>
            {isStaff ? (
              <Button onClick={openNewModule} variant="outline">
                <Plus /> {t('courses.modules.empty.create_first')}
              </Button>
            ) : null}
          </div>
        ) : (
          <Accordion
            type="multiple"
            value={openModules}
            onValueChange={setOpenModules}
          >
            {modules!.map((m, index) => {
              const count = (itemsByModule.get(m.id) ?? []).length
              return (
                <AccordionItem key={m.id} value={m.id}>
                  {/* The trigger is only the title block. The module's own menu
                      sits beside it, outside the button — a control nested in a
                      button is neither operable by keyboard nor valid HTML. */}
                  <div className="flex items-start gap-2 pr-4">
                    <AccordionTrigger className="min-w-0 flex-1 items-center">
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-muted-foreground text-xs font-medium tabular-nums">
                            {index + 1}
                          </span>
                          <span className="font-semibold">{m.title}</span>
                          {!m.is_published ? (
                            <Badge variant="outline">
                              {t('courses.module.hidden')}
                            </Badge>
                          ) : null}
                          {/* Closed modules are opaque without this. */}
                          <span className="text-muted-foreground text-xs font-normal">
                            {tn('courses.module.item_count', count)}
                          </span>
                        </span>
                        {m.description ? (
                          <span className="text-muted-foreground text-sm font-normal">
                            {m.description}
                          </span>
                        ) : null}
                      </span>
                    </AccordionTrigger>
                    {isStaff ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="mt-3 shrink-0"
                          >
                            <MoreHorizontal />
                            <span className="sr-only">
                              {t('courses.module.actions')}
                            </span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEditModule(m)}>
                            {t('courses.module.edit')}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              updateModule.mutate({
                                id: m.id,
                                patch: { is_published: !m.is_published },
                              })
                            }
                          >
                            {m.is_published
                              ? t('courses.module.hide')
                              : t('courses.module.show')}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            disabled={index === 0}
                            onClick={() => moveModule(index, -1)}
                          >
                            <ChevronUp /> {t('courses.move_up')}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={index === moduleCount - 1}
                            onClick={() => moveModule(index, 1)}
                          >
                            <ChevronDown /> {t('courses.move_down')}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => setDeleteModuleTarget(m)}
                          >
                            {t('courses.module.delete')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </div>

                  {/* h-auto overrides the primitive's fixed content height: this
                      list grows and shrinks while open (adding an item, deleting
                      one), and the measured height would clip it. */}
                  <AccordionContent className="h-auto space-y-4">
                {SECTIONS.map(({ kind, labelKey, addKey }) => {
                  const items = kindItems(m.id, kind)
                  const Icon = KIND_ICON[kind]
                  return (
                    <div key={kind}>
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                          {t(labelKey)}
                        </h3>
                        {isStaff ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground h-7"
                            onClick={() => addItem(kind, m.id)}
                          >
                            <Plus /> {t(addKey)}
                          </Button>
                        ) : null}
                      </div>

                      {items.length === 0 ? (
                        <p className="text-muted-foreground mt-1 text-sm">
                          {t('courses.section.empty')}
                        </p>
                      ) : (
                        <ModuleItemList
                          items={items}
                          icon={Icon}
                          isStaff={isStaff}
                          moduleId={m.id}
                          otherModules={(modules ?? []).filter(
                            (x) => x.id !== m.id,
                          )}
                          onReorder={(orderedIds) =>
                            reorderItems.mutate({
                              moduleId: m.id,
                              kind,
                              orderedIds,
                            })
                          }
                          onOpen={openItem}
                          onDownload={(item) =>
                            openMaterial.mutate({ id: item.id, download: true })
                          }
                          onTogglePublish={(item, next) =>
                            togglePublished.mutate({
                              kind: item.kind,
                              id: item.id,
                              next,
                            })
                          }
                          onMoveToModule={moveItemToModule}
                          onDelete={setDeleteItemTarget}
                        />
                      )}
                    </div>
                  )
                })}
                  </AccordionContent>
                </AccordionItem>
              )
            })}
          </Accordion>
        )}
      </div>

      {activeAcademyId ? (
        <>
          <CourseFormDialog
            academyId={activeAcademyId}
            course={course}
            open={courseDialogOpen}
            onOpenChange={setCourseDialogOpen}
          />
          <DuplicateCourseDialog
            academyId={activeAcademyId}
            course={course}
            open={duplicateOpen}
            onOpenChange={setDuplicateOpen}
          />
          <ModuleFormDialog
            academyId={activeAcademyId}
            courseId={courseId}
            module={editingModule}
            nextSortOrder={moduleCount}
            open={moduleDialogOpen}
            onOpenChange={setModuleDialogOpen}
          />
          <MaterialUploadDialog
            academyId={activeAcademyId}
            courseId={courseId}
            moduleId={uploadTarget?.moduleId ?? null}
            sortOrder={uploadTarget?.sortOrder ?? 0}
            open={!!uploadTarget}
            onOpenChange={(o) => {
              if (!o) setUploadTarget(null)
            }}
          />
        </>
      ) : null}

      <AlertDialog
        open={!!deleteItemTarget}
        onOpenChange={(o) => {
          if (!o) setDeleteItemTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteItemTarget
                ? t(KIND_DELETE_TITLE[deleteItemTarget.kind])
                : null}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('courses.delete.body', {
                title: deleteItemTarget?.title ?? '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteItem}>
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!deleteModuleTarget}
        onOpenChange={(o) => {
          if (!o) setDeleteModuleTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('courses.delete.module.title')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const title = deleteModuleTarget?.title ?? ''
                const n = deleteModuleTarget
                  ? (itemsByModule.get(deleteModuleTarget.id) ?? []).length
                  : 0
                // Whole sentences, not fragments: the count clause sits in a
                // different place in Malay.
                return n > 0
                  ? tn('courses.delete.module.body', n, { title })
                  : t('courses.delete.body', { title })
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteModule}>
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
