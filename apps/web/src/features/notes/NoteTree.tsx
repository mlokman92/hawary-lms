import { useState } from 'react'
import { ChevronRight, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { NoteNode } from './api'

type NodeProps = {
  node: NoteNode
  depth: number
  selectedId: string | null
  onSelect: (id: string) => void
  onAddChild: (parentId: string) => void
  onDelete: (node: NoteNode) => void
}

function TreeNode({
  node,
  depth,
  selectedId,
  onSelect,
  onAddChild,
  onDelete,
}: NodeProps) {
  const [open, setOpen] = useState(true)
  const hasChildren = node.children.length > 0

  return (
    <div>
      <div
        className={cn(
          'group flex items-center gap-1 rounded-md py-1 pr-1 text-sm',
          selectedId === node.id ? 'bg-accent' : 'hover:bg-accent/50',
        )}
        style={{ paddingLeft: depth * 12 + 4 }}
      >
        {hasChildren ? (
          <button
            type="button"
            className="text-muted-foreground shrink-0"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? 'Collapse' : 'Expand'}
          >
            <ChevronRight
              className={cn('size-4 transition-transform', open && 'rotate-90')}
            />
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <button
          type="button"
          className="min-w-0 flex-1 truncate text-left"
          onClick={() => onSelect(node.id)}
        >
          {node.title || 'Untitled'}
          {!node.is_published ? (
            <span className="text-muted-foreground ml-1.5 text-xs">draft</span>
          ) : null}
        </button>
        <div className="flex shrink-0 items-center opacity-0 group-hover:opacity-100">
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground p-1"
            onClick={() => onAddChild(node.id)}
            title="Add subnote"
          >
            <Plus className="size-3.5" />
          </button>
          <button
            type="button"
            className="text-muted-foreground hover:text-destructive p-1"
            onClick={() => onDelete(node)}
            title="Delete"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>
      {open && hasChildren ? (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              onAddChild={onAddChild}
              onDelete={onDelete}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function NoteTree({
  tree,
  selectedId,
  onSelect,
  onAddChild,
  onDelete,
}: {
  tree: NoteNode[]
  selectedId: string | null
  onSelect: (id: string) => void
  onAddChild: (parentId: string) => void
  onDelete: (node: NoteNode) => void
}) {
  if (tree.length === 0) {
    return (
      <p className="text-muted-foreground px-2 py-4 text-center text-xs">
        No notes yet.
      </p>
    )
  }
  return (
    <div className="space-y-0.5">
      {tree.map((node) => (
        <TreeNode
          key={node.id}
          node={node}
          depth={0}
          selectedId={selectedId}
          onSelect={onSelect}
          onAddChild={onAddChild}
          onDelete={onDelete}
        />
      ))}
    </div>
  )
}
