import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Download, FileUp, Upload } from 'lucide-react'
import { useT, type TKey } from '@/lib/i18n'
import { downloadCsv } from '@/lib/csv'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  parseImport,
  templateRows,
  type ImportSpec,
  type ParsedRow,
} from './spec'

/** Rows shown in the preview. The rest are imported, just not rendered. */
const PREVIEW_ROWS = 8

/**
 * Bulk creation from a spreadsheet, driven by an `ImportSpec`.
 *
 * The flow is deliberately "show me what you understood before you write
 * anything": the file is parsed and validated entirely in the browser, the user
 * sees a per-row verdict, and only then does a single batched insert run. A row
 * with a problem is never silently dropped — it is listed, with its line number,
 * and excluded from the count on the button.
 *
 * Duplicates are a warning rather than an error, because the database has no
 * unique constraint on email or IC and an academy can legitimately have two
 * people with the same name. They are excluded by default and can be included
 * with a checkbox.
 */
export function ImportDialog({
  open,
  onOpenChange,
  spec,
  existing,
  onImport,
  titleKey,
  descriptionKey,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  spec: ImportSpec
  /** Current records, for duplicate detection — the list query's rows as-is. */
  existing: Record<string, unknown>[]
  onImport: (rows: Record<string, string | null>[]) => Promise<unknown>
  titleKey: TKey
  descriptionKey: TKey
}) {
  const { t, tn } = useT()
  const fileRef = useRef<HTMLInputElement>(null)

  const [text, setText] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [showPaste, setShowPaste] = useState(false)
  const [includeDuplicates, setIncludeDuplicates] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [imported, setImported] = useState<number | null>(null)

  useEffect(() => {
    if (open) return
    setText('')
    setFileName(null)
    setShowPaste(false)
    setIncludeDuplicates(false)
    setError(null)
    setImported(null)
  }, [open])

  const result = useMemo(
    () => (text.trim() ? parseImport(spec, text, existing) : null),
    [spec, text, existing],
  )

  const importable = useMemo(() => {
    if (!result) return []
    return result.rows.filter(
      (r) =>
        r.issues.length === 0 &&
        result.missingColumns.length === 0 &&
        (includeDuplicates || !r.duplicate),
    )
  }, [result, includeDuplicates])

  const problemRows = result?.rows.filter((r) => r.issues.length > 0) ?? []
  const duplicateRows = result?.rows.filter((r) => r.duplicate) ?? []

  async function onFile(file: File) {
    setError(null)
    setImported(null)
    setFileName(file.name)
    setText(await file.text())
  }

  async function run() {
    setBusy(true)
    setError(null)
    try {
      await onImport(importable.map((r) => r.values))
      setImported(importable.length)
      setText('')
      setFileName(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('import.failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t(titleKey)}</DialogTitle>
          <DialogDescription>{t(descriptionKey)}</DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto">
          {/* 1. Get the file in */}
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv,text/plain"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void onFile(file)
                // Let the same file be chosen again after a fix.
                e.target.value = ''
              }}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => fileRef.current?.click()}
            >
              <FileUp />
              {fileName ?? t('import.choose_file')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                downloadCsv(spec.templateName, templateRows(spec))
              }
            >
              <Download />
              {t('import.download_template')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowPaste((v) => !v)}
            >
              {t('import.paste_instead')}
            </Button>
          </div>

          {showPaste ? (
            <div className="grid gap-2">
              <Label htmlFor="import-paste">{t('import.paste_label')}</Label>
              <Textarea
                id="import-paste"
                rows={5}
                value={text}
                onChange={(e) => {
                  setText(e.target.value)
                  setFileName(null)
                  setImported(null)
                }}
                placeholder={spec.fields
                  .filter((f) => f.required || f.sample)
                  .map((f) => f.column)
                  .join(',')}
              />
            </div>
          ) : null}

          <p className="text-muted-foreground text-xs">
            {t('import.columns_hint', {
              columns: spec.fields.map((f) => f.column).join(', '),
            })}
          </p>

          {/* 2. What we understood */}
          {result ? (
            result.missingColumns.length > 0 ? (
              <p className="text-destructive text-sm">
                {t('import.missing_columns', {
                  columns: result.missingColumns
                    .map((f) => f.column)
                    .join(', '),
                })}
              </p>
            ) : result.empty ? (
              <p className="text-muted-foreground text-sm">
                {t('import.no_rows')}
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge variant="secondary">
                    {tn('import.ready', importable.length)}
                  </Badge>
                  {problemRows.length > 0 ? (
                    <Badge variant="destructive">
                      {tn('import.problems', problemRows.length)}
                    </Badge>
                  ) : null}
                  {duplicateRows.length > 0 ? (
                    <Badge variant="outline">
                      {tn('import.duplicates', duplicateRows.length)}
                    </Badge>
                  ) : null}
                </div>

                {result.unknownColumns.length > 0 ? (
                  <p className="text-muted-foreground text-xs">
                    {t('import.unknown_columns', {
                      columns: result.unknownColumns.join(', '),
                    })}
                  </p>
                ) : null}

                <PreviewTable spec={spec} rows={result.rows} />

                {problemRows.length > 0 ? (
                  <div className="rounded-lg border p-3">
                    <p className="flex items-center gap-1.5 text-sm font-medium">
                      <AlertTriangle className="text-destructive size-4" />
                      {t('import.problems_title')}
                    </p>
                    <ul className="mt-2 space-y-1">
                      {problemRows.slice(0, 20).map((row) => (
                        <li
                          key={row.line}
                          className="text-muted-foreground text-xs"
                        >
                          {t('import.line', { line: row.line })} —{' '}
                          {row.issues
                            .map(
                              (issue) =>
                                `${issue.column}: ${t(issue.messageKey)}`,
                            )
                            .join('; ')}
                        </li>
                      ))}
                    </ul>
                    {problemRows.length > 20 ? (
                      <p className="text-muted-foreground mt-1 text-xs">
                        {t('import.and_more', {
                          count: problemRows.length - 20,
                        })}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {duplicateRows.length > 0 ? (
                  <div className="flex items-start gap-2">
                    <Checkbox
                      id="include-duplicates"
                      checked={includeDuplicates}
                      onCheckedChange={(v) => setIncludeDuplicates(v === true)}
                    />
                    <div className="grid gap-0.5">
                      <Label
                        htmlFor="include-duplicates"
                        className="text-sm font-normal"
                      >
                        {t('import.include_duplicates')}
                      </Label>
                      <p className="text-muted-foreground text-xs">
                        {t('import.duplicates_hint', {
                          columns: spec.dedupeKeys.join(', '),
                        })}
                      </p>
                    </div>
                  </div>
                ) : null}
              </>
            )
          ) : null}

          {imported !== null ? (
            <p className="text-sm">{tn('import.done', imported)}</p>
          ) : null}
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            {imported !== null ? t('common.close') : t('common.cancel')}
          </Button>
          <Button
            type="button"
            onClick={() => void run()}
            disabled={busy || importable.length === 0}
          >
            <Upload />
            {busy ? t('import.importing') : tn('import.action', importable.length)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * The first few rows as the app read them — parsed values, not raw text, so a
 * date that was reformatted or a gender that was normalised is visible before
 * anything is written.
 */
function PreviewTable({
  spec,
  rows,
}: {
  spec: ImportSpec
  rows: ParsedRow[]
}) {
  const { t } = useT()
  // Columns worth showing: the required ones plus whatever the file filled in.
  const columns = spec.fields.filter(
    (f) => f.required || rows.some((r) => r.values[f.key]),
  )

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">{t('import.col.line')}</TableHead>
            {columns.map((f) => (
              <TableHead key={f.key}>{t(f.labelKey)}</TableHead>
            ))}
            <TableHead>{t('common.status')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.slice(0, PREVIEW_ROWS).map((row) => (
            <TableRow key={row.line}>
              <TableCell className="text-muted-foreground text-xs">
                {row.line}
              </TableCell>
              {columns.map((f) => (
                <TableCell key={f.key} className="text-sm whitespace-nowrap">
                  {row.values[f.key] ?? (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
              ))}
              <TableCell>
                {row.issues.length > 0 ? (
                  <Badge variant="destructive">{t('import.row.problem')}</Badge>
                ) : row.duplicate ? (
                  <Badge variant="outline">
                    {t(
                      row.duplicate === 'existing'
                        ? 'import.row.duplicate_existing'
                        : 'import.row.duplicate_file',
                    )}
                  </Badge>
                ) : (
                  <Badge variant="secondary">{t('import.row.ready')}</Badge>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {rows.length > PREVIEW_ROWS ? (
        <p className="text-muted-foreground border-t px-3 py-2 text-xs">
          {t('import.preview_more', { count: rows.length - PREVIEW_ROWS })}
        </p>
      ) : null}
    </div>
  )
}
