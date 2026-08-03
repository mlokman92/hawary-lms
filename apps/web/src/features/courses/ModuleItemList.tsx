import { Link } from 'react-router-dom'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type ScreenReaderInstructions,
} from '@dnd-kit/core'
import {
  restrictToParentElement,
  restrictToVerticalAxis,
} from '@dnd-kit/modifiers'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  MoreHorizontal,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useT, type TFn } from '@/lib/i18n'
import type { CourseModule, ItemKind } from '@/features/modules/api'
import { PublishSwitch } from '@/components/patterns/PublishSwitch'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/** One content row, normalised across the four tables so the list, the
 *  reorder/move menus and the delete dialog stay generic. */
export type ModuleItem = {
  id: string
  kind: ItemKind
  moduleId: string
  title: string
  isPublished: boolean
  meta: string | null
  /** null for a material: it has no editor page, it opens as a signed URL. */
  href: string | null
}

type Handlers = {
  onOpen: (item: ModuleItem) => void
  onDownload: (item: ModuleItem) => void
  onTogglePublish: (item: ModuleItem, next: boolean) => void
  onMoveToModule: (item: ModuleItem, moduleId: string) => void
  onDelete: (item: ModuleItem) => void
}

/**
 * The items of one kind inside one module, reorderable by dragging.
 *
 * Scope is deliberately one section: `reorder_module_items` takes a single
 * (module, kind) and its full ordered list, and dropping a note into an
 * "Assessments" heading would mean moving it between tables. Crossing modules
 * stays on the ⋯ menu, which also works when the target module is collapsed and
 * therefore has nothing to drop onto.
 *
 * Dragging is by handle, not by the row: the row already holds a link, a
 * publish switch and a menu button, and a whole-row drag would fight all three.
 */
export function ModuleItemList({
  items,
  icon,
  isStaff,
  moduleId,
  otherModules,
  onReorder,
  ...handlers
}: {
  items: ModuleItem[]
  icon: LucideIcon
  isStaff: boolean
  moduleId: string
  /** Targets for "Move to module" — the current module already excluded. */
  otherModules: CourseModule[]
  onReorder: (orderedIds: string[]) => void
} & Handlers) {
  const { t } = useT()

  const sensors = useSensors(
    // A few pixels of travel before a drag starts, so a click on the handle is
    // still a click and a slightly shaky pointer does not reorder the course.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const ids = items.map((i) => i.id)

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    if (from < 0 || to < 0) return
    onReorder(arrayMove(ids, from, to))
  }

  // The context is mounted even for a read-only viewer: `useSortable` inside the
  // rows would otherwise run outside any provider and fall back to dnd-kit's
  // internal defaults. `disabled` makes it inert instead, and no handle is
  // rendered, so there is nothing to grab.
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      // Vertical only, and never outside the list — the accordion panel this
      // sits in is `overflow-hidden`, so an unrestricted drag would clip.
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      accessibility={{
        announcements: announcementsFor(items, t),
        screenReaderInstructions: instructionsFor(t),
      }}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul className="mt-1 divide-y rounded-lg border">
          {items.map((item, i) => (
            <Row
              key={item.id}
              item={item}
              index={i}
              total={items.length}
              icon={icon}
              isStaff={isStaff}
              moduleId={moduleId}
              otherModules={otherModules}
              onReorder={onReorder}
              ids={ids}
              {...handlers}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  )
}

function Row({
  item,
  index,
  total,
  icon: Icon,
  isStaff,
  ids,
  otherModules,
  onReorder,
  onOpen,
  onDownload,
  onTogglePublish,
  onMoveToModule,
  onDelete,
}: {
  item: ModuleItem
  index: number
  total: number
  icon: LucideIcon
  isStaff: boolean
  ids: string[]
  moduleId: string
  otherModules: CourseModule[]
  onReorder: (orderedIds: string[]) => void
} & Handlers) {
  const { t } = useT()
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled: !isStaff })

  const move = (dir: -1 | 1) => {
    const to = index + dir
    if (to < 0 || to >= total) return
    onReorder(arrayMove(ids, index, to))
  }

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'hover:bg-muted/50 flex items-center gap-2 px-3 py-2 transition-colors',
        // Lift the dragged row above its neighbours; without the z-index it
        // slides underneath the next row's background.
        isDragging && 'bg-background relative z-10 opacity-90 shadow-sm',
      )}
    >
      {isStaff ? (
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={t('courses.item.drag', { title: item.title })}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring -ml-1 shrink-0 cursor-grab touch-none rounded-sm p-0.5 focus-visible:ring-2 focus-visible:outline-none active:cursor-grabbing"
        >
          <GripVertical className="size-4" />
        </button>
      ) : null}

      <Icon className="text-muted-foreground size-4 shrink-0" aria-hidden />

      {item.href ? (
        <Link
          to={item.href}
          className="min-w-0 flex-1 truncate text-sm hover:underline"
        >
          {item.title}
        </Link>
      ) : (
        // A material has no page of its own: clicking it fetches a 60-second
        // signed URL and opens the file.
        <button
          type="button"
          className="min-w-0 flex-1 truncate text-left text-sm hover:underline"
          onClick={() => onOpen(item)}
        >
          {item.title}
        </button>
      )}

      {item.meta ? (
        <span className="text-muted-foreground hidden shrink-0 text-xs sm:inline">
          {item.meta}
        </span>
      ) : null}

      {isStaff ? (
        <PublishSwitch
          checked={item.isPublished}
          title={item.title}
          onChange={(next) => onTogglePublish(item, next)}
        />
      ) : (
        <Badge
          variant={item.isPublished ? 'default' : 'secondary'}
          className="shrink-0"
        >
          {item.isPublished ? t('common.published') : t('common.draft')}
        </Badge>
      )}

      {isStaff ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="shrink-0">
              <MoreHorizontal />
              <span className="sr-only">
                {t('courses.item.actions', { title: item.title })}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onOpen(item)}>
              {t('common.open')}
            </DropdownMenuItem>
            {!item.href ? (
              <DropdownMenuItem onClick={() => onDownload(item)}>
                {t('common.download')}
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            {/* Kept alongside the drag handle: it is the discoverable way to
                nudge one row, and it works on a touch device where a long
                press is competing with the page scroll. */}
            <DropdownMenuItem disabled={index === 0} onClick={() => move(-1)}>
              <ChevronUp /> {t('courses.move_up')}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={index === total - 1}
              onClick={() => move(1)}
            >
              <ChevronDown /> {t('courses.move_down')}
            </DropdownMenuItem>
            {otherModules.length > 0 ? (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  {t('courses.item.move_to_module')}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {otherModules.map((target) => (
                    <DropdownMenuItem
                      key={target.id}
                      onClick={() => onMoveToModule(item, target.id)}
                    >
                      {target.title}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => onDelete(item)}
            >
              {t('common.delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </li>
  )
}

// ---------------------------------------------------------------------------
// Screen-reader support. dnd-kit ships English defaults; these replace them so
// a Malay user is not narrated to in English mid-drag.
// ---------------------------------------------------------------------------

function instructionsFor(t: TFn): ScreenReaderInstructions {
  return { draggable: t('dnd.instructions') }
}

function announcementsFor(items: ModuleItem[], t: TFn): Announcements {
  const at = (id: string | number | undefined) =>
    id == null ? -1 : items.findIndex((i) => i.id === String(id))
  const name = (id: string | number | undefined) =>
    items[at(id)]?.title ?? t('common.untitled')
  const total = items.length

  return {
    onDragStart: ({ active }) =>
      t('dnd.picked_up', {
        item: name(active.id),
        position: at(active.id) + 1,
        total,
      }),
    onDragOver: ({ active, over }) =>
      over
        ? t('dnd.moved_over', {
            item: name(active.id),
            position: at(over.id) + 1,
            total,
          })
        : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? t('dnd.dropped', {
            item: name(active.id),
            position: at(over.id) + 1,
            total,
          })
        : t('dnd.cancelled', { item: name(active.id) }),
    onDragCancel: ({ active }) =>
      t('dnd.cancelled', { item: name(active.id) }),
  }
}
