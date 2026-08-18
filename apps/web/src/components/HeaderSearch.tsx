import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { GraduationCap, Search, Users, X } from 'lucide-react'
import { useAcademy } from '@/lib/academy'
import { useT } from '@/lib/i18n'
import { DEBOUNCE_MS, useDebounced } from '@/lib/useDebounced'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import {
  MIN_QUERY,
  useGlobalSearch,
  type SearchHit,
} from '@/features/search/api'

/**
 * The back-office header search.
 *
 * It answers one question — "where is this person?" — so it returns students
 * and instructors and nothing else, and selecting a result navigates straight
 * to that record rather than to a results page. Keyboard first: ⌘/Ctrl-K to
 * focus, arrows to move, Enter to open, Escape to dismiss.
 */
export function HeaderSearch() {
  const { t } = useT()
  const navigate = useNavigate()
  const { activeAcademyId } = useAcademy()

  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const debounced = useDebounced(query, DEBOUNCE_MS)
  const { data, isFetching, error } = useGlobalSearch(activeAcademyId, debounced)
  const hits = useMemo(() => data ?? [], [data])

  // A fresh result set invalidates wherever the cursor was pointing.
  useEffect(() => setCursor(0), [hits])

  // Click-anywhere-else closes. Pointerdown rather than click so the panel is
  // gone before the click lands on whatever is underneath it.
  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  function choose(hit: SearchHit) {
    setOpen(false)
    setQuery('')
    navigate(hit.to)
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setOpen(false)
      inputRef.current?.blur()
      return
    }
    if (!open || hits.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor((c) => (c + 1) % hits.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor((c) => (c - 1 + hits.length) % hits.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose(hits[cursor])
    }
  }

  const tooShort = debounced.trim().length < MIN_QUERY
  const students = hits.filter((h) => h.kind === 'student')
  const instructors = hits.filter((h) => h.kind === 'instructor')

  return (
    <div ref={rootRef} className="relative w-full max-w-sm">
      <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 z-10 size-4 -translate-y-1/2" />
      <Input
        ref={inputRef}
        // Not type="search": the browser's own clear button sits where the
        // panel opens and swallows the first click.
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls="header-search-results"
        autoComplete="off"
        value={query}
        placeholder={t('nav.search_placeholder')}
        aria-label={t('nav.search_label')}
        className="pl-8"
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {query ? (
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2"
          aria-label={t('search.clear')}
          onClick={() => {
            setQuery('')
            inputRef.current?.focus()
          }}
        >
          <X className="size-4" />
        </button>
      ) : null}

      {open && query ? (
        <div
          id="header-search-results"
          role="listbox"
          className="bg-popover text-popover-foreground absolute top-full right-0 left-0 z-50 mt-1 max-h-96 overflow-y-auto rounded-md border shadow-md"
        >
          {tooShort ? (
            <p className="text-muted-foreground p-3 text-sm">
              {t('search.hint')}
            </p>
          ) : error ? (
            <p className="text-destructive p-3 text-sm">
              {error.message || t('search.failed')}
            </p>
          ) : hits.length === 0 ? (
            <p className="text-muted-foreground p-3 text-sm">
              {isFetching
                ? t('search.searching')
                : t('search.no_results', { query: debounced })}
            </p>
          ) : (
            <>
              <Group
                label={t('search.group.students')}
                icon={Users}
                hits={students}
                all={hits}
                cursor={cursor}
                onHover={setCursor}
                onChoose={choose}
              />
              <Group
                label={t('search.group.instructors')}
                icon={GraduationCap}
                hits={instructors}
                all={hits}
                cursor={cursor}
                onHover={setCursor}
                onChoose={choose}
              />
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}

/**
 * `all` is the flat list the cursor indexes into: the groups are a visual
 * split, but arrow keys have to walk students straight into instructors.
 */
function Group({
  label,
  icon: Icon,
  hits,
  all,
  cursor,
  onHover,
  onChoose,
}: {
  label: string
  icon: typeof Users
  hits: SearchHit[]
  all: SearchHit[]
  cursor: number
  onHover: (index: number) => void
  onChoose: (hit: SearchHit) => void
}) {
  const { t } = useT()
  if (hits.length === 0) return null
  return (
    <div className="border-t first:border-t-0">
      <p className="text-muted-foreground flex items-center gap-1.5 px-3 pt-2 pb-1 text-xs font-medium">
        <Icon className="size-3" />
        {label}
      </p>
      <ul>
        {hits.map((hit) => {
          const index = all.indexOf(hit)
          return (
            <li key={`${hit.kind}-${hit.id}`}>
              <button
                type="button"
                role="option"
                aria-selected={index === cursor}
                className={cn(
                  'w-full px-3 py-2 text-left',
                  index === cursor && 'bg-accent text-accent-foreground',
                )}
                onMouseEnter={() => onHover(index)}
                onClick={() => onChoose(hit)}
              >
                <span className="block truncate text-sm font-medium">
                  {hit.name || t('common.unnamed')}
                </span>
                <span className="text-muted-foreground block truncate text-xs">
                  {[hit.no, hit.email, hit.phone].filter(Boolean).join(' · ')}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
