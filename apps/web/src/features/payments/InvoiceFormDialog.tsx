import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Check, Plus, Search, Trash2, Users, X } from 'lucide-react'
import { formatMYR, ringgitToSen } from '@hawary/shared'
import { useAuth } from '@/lib/auth'
import { useT, type TFn } from '@/lib/i18n'
import { useStudents, type StudentRow } from '@/features/students/api'
import { useCourses } from '@/features/courses/api'
import { usePaymentSettings } from '@/features/settings/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCreateInvoices, TOYYIBPAY_FPX_FEE_SEN } from './api'
import { errorMessage } from '@/lib/errors'

type ItemRow = {
  key: string
  description: string
  quantity: number
  unitPrice: string
}

const blankItem = (): ItemRow => ({
  key: crypto.randomUUID(),
  description: '',
  quantity: 1,
  unitPrice: '',
})

const studentLabel = (s: StudentRow, t: TFn) =>
  s.full_name || s.email || t('common.unnamed')

// Cap rendered rows so a very large academy doesn't paint thousands of nodes;
// search narrows past this.
const MAX_ROWS = 300

export function InvoiceFormDialog({
  academyId,
  open,
  onOpenChange,
  onCreated,
  initialStudentId,
}: {
  academyId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (id: string) => void
  initialStudentId?: string
}) {
  const { user } = useAuth()
  const { t, tn } = useT()
  const { data: students, isLoading: studentsLoading } = useStudents(
    academyId || null,
  )
  const { data: courses } = useCourses(academyId || null)
  const { data: paymentSettings } = usePaymentSettings(academyId || null)
  const createInvoices = useCreateInvoices(academyId)

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [courseFilter, setCourseFilter] = useState('all')
  const [showAllCourses, setShowAllCourses] = useState(false)
  const [search, setSearch] = useState('')
  const [items, setItems] = useState<ItemRow[]>([blankItem()])
  const [tax, setTax] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')
  const [chargeToPayor, setChargeToPayor] = useState(false)
  const [allowPartial, setAllowPartial] = useState(false)
  const [minPartial, setMinPartial] = useState('')
  const [error, setError] = useState<string | null>(null)

  const gatewayOn = !!paymentSettings?.toyyibpay_enabled
  const chargeDefault = !!paymentSettings?.toyyibpay_charge_to_payor

  useEffect(() => {
    if (!open) return
    setSelected(initialStudentId ? new Set([initialStudentId]) : new Set())
    setCourseFilter('all')
    setShowAllCourses(false)
    setSearch('')
    setItems([blankItem()])
    setTax('')
    setDueDate('')
    setNotes('')
    setAllowPartial(false)
    setMinPartial('')
    setError(null)
  }, [open, initialStudentId])

  // Seed from the academy default exactly once per opening, then let the form
  // own it. The settings query may resolve after the dialog is already open, so
  // a plain effect on `chargeDefault` would clobber a switch the admin had
  // already flipped.
  const seeded = useRef(false)
  useEffect(() => {
    if (!open) {
      seeded.current = false
      return
    }
    if (seeded.current || paymentSettings === undefined) return
    setChargeToPayor(chargeDefault)
    seeded.current = true
  }, [open, paymentSettings, chargeDefault])

  const all = useMemo(() => students ?? [], [students])
  const byId = useMemo(() => new Map(all.map((s) => [s.id, s])), [all])

  // Course filter shows PUBLISHED courses by default; "show all" reveals
  // draft/archived for the occasional remote case.
  const allCourses = useMemo(() => courses ?? [], [courses])
  const published = useMemo(
    () => allCourses.filter((c) => c.status === 'published'),
    [allCourses],
  )
  const unpublishedCount = allCourses.length - published.length
  const courseOptions = showAllCourses ? allCourses : published

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return all.filter((s) => {
      if (
        courseFilter !== 'all' &&
        !s.enrollments.some((e) => e.courses?.id === courseFilter)
      )
        return false
      if (!q) return true
      return (
        (s.full_name ?? '').toLowerCase().includes(q) ||
        (s.email ?? '').toLowerCase().includes(q) ||
        s.student_no.toLowerCase().includes(q)
      )
    })
  }, [all, courseFilter, search])
  const shown = filtered.slice(0, MAX_ROWS)

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const selectAllFiltered = () =>
    setSelected((prev) => {
      const next = new Set(prev)
      filtered.forEach((s) => next.add(s.id))
      return next
    })

  const toggleShowAllCourses = () =>
    setShowAllCourses((prev) => {
      const next = !prev
      // If we're hiding unpublished courses and one is selected, reset the filter.
      if (
        !next &&
        courseFilter !== 'all' &&
        !published.some((c) => c.id === courseFilter)
      )
        setCourseFilter('all')
      return next
    })

  const subtotalSen = useMemo(
    () => items.reduce((s, it) => s + it.quantity * ringgitToSen(it.unitPrice), 0),
    [items],
  )
  const taxSen = ringgitToSen(tax)
  const perStudentSen = subtotalSen + taxSen
  const minPartialSen = ringgitToSen(minPartial)
  const grandTotalSen = perStudentSen * selected.size

  const changeItem = (key: string, patch: Partial<ItemRow>) =>
    setItems((its) => its.map((it) => (it.key === key ? { ...it, ...patch } : it)))

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (selected.size === 0) return setError(t('payments.form.error_no_student'))
    if (perStudentSen <= 0)
      return setError(t('payments.form.error_no_amount'))
    // A minimum instalment nobody could ever meet would leave the pay page
    // offering a choice with one option, so reject it here rather than let the
    // server silently collapse it back to "pay in full".
    if (allowPartial && minPartialSen > 0) {
      if (minPartialSen < TOYYIBPAY_FPX_FEE_SEN)
        return setError(
          t('payments.partial.error_min', {
            min: formatMYR(TOYYIBPAY_FPX_FEE_SEN),
          }),
        )
      if (minPartialSen > perStudentSen)
        return setError(
          t('payments.partial.error_max', { max: formatMYR(perStudentSen) }),
        )
    }
    setError(null)
    try {
      const created = await createInvoices.mutateAsync({
        studentIds: [...selected],
        dueDate,
        taxSen,
        notes,
        courseId: courseFilter === 'all' ? null : courseFilter,
        createdBy: user?.id ?? null,
        // Only decide per invoice when the gateway is actually on; otherwise
        // leave NULL so the invoice picks up whatever default is in force if
        // the academy connects ToyyibPay later.
        chargeToPayor: gatewayOn ? chargeToPayor : null,
        allowPartialPayment: gatewayOn && allowPartial,
        // Blank means "no floor of ours" — ToyyibPay's RM1.00 applies instead.
        minPartialSen: minPartialSen > 0 ? minPartialSen : null,
        items: items
          .filter((it) => it.description.trim() || ringgitToSen(it.unitPrice) > 0)
          .map((it) => ({
            description: it.description.trim() || 'Item',
            quantity: it.quantity,
            unitPriceSen: ringgitToSen(it.unitPrice),
          })),
      })
      onOpenChange(false)
      if (created.length === 1) onCreated(created[0].id)
    } catch (err) {
      setError(errorMessage(err, t('common.error')))
    }
  }

  const selectedList = [...selected]
    .map((id) => byId.get(id))
    .filter(Boolean) as StudentRow[]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl md:h-[85vh]">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>{t('payments.new_invoice')}</DialogTitle>
          <DialogDescription>{t('payments.form.description')}</DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
          {/* LEFT — dedicated student panel */}
          <div className="flex flex-col gap-3 border-b p-4 md:min-h-0 md:w-2/5 md:border-r md:border-b-0">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <Users className="size-3.5" /> {t('payments.form.recipients')}
                {selected.size > 0 ? (
                  <span className="text-muted-foreground font-normal">
                    · {t('payments.form.selected', { count: selected.size })}
                  </span>
                ) : null}
              </span>
              {selected.size > 0 ? (
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground text-xs underline"
                  onClick={() => setSelected(new Set())}
                >
                  {t('common.clear')}
                </button>
              ) : null}
            </div>

            {/* Course: filters the list to enrolled students AND tags the
                invoices so payments can be tracked per course. */}
            <div className="grid gap-1.5">
              <Select value={courseFilter} onValueChange={setCourseFilter}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t('payments.form.all_students')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {t('payments.form.all_students')}
                  </SelectItem>
                  {courseOptions.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.title}
                      {c.status !== 'published'
                        ? ` · ${t(
                            c.status === 'draft'
                              ? 'common.draft'
                              : 'payments.course_status.archived',
                          )}`
                        : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">
                {courseFilter === 'all'
                  ? t('payments.form.course_hint_none')
                  : t('payments.form.course_hint_selected')}
              </p>
              {unpublishedCount > 0 ? (
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground justify-self-start text-xs underline"
                  onClick={toggleShowAllCourses}
                >
                  {showAllCourses
                    ? t('payments.form.show_published_only')
                    : t('payments.form.show_all_courses', {
                        count: unpublishedCount,
                      })}
                </button>
              ) : null}
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('payments.form.search_placeholder')}
                className="pl-8"
              />
            </div>

            {/* Selected chips (compact) */}
            {selectedList.length > 0 ? (
              <div className="flex max-h-16 flex-wrap gap-1.5 overflow-y-auto">
                {selectedList.map((s) => (
                  <Badge key={s.id} variant="secondary" className="gap-1 pr-1">
                    <span className="max-w-[9rem] truncate">
                      {studentLabel(s, t)}
                    </span>
                    <button
                      type="button"
                      aria-label={t('payments.form.remove_recipient', {
                        name: studentLabel(s, t),
                      })}
                      onClick={() => toggle(s.id)}
                      className="hover:bg-muted-foreground/20 rounded-sm"
                    >
                      <X className="size-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            ) : null}

            {/* The list */}
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border">
              <div className="text-muted-foreground flex items-center justify-between border-b px-3 py-1.5 text-xs">
                <span>{tn('payments.form.matches', filtered.length)}</span>
                {filtered.length > 0 ? (
                  <button
                    type="button"
                    className="hover:text-foreground underline"
                    onClick={selectAllFiltered}
                  >
                    {t('payments.form.select_all')}
                  </button>
                ) : null}
              </div>
              <div className="max-h-64 flex-1 overflow-y-auto md:max-h-none">
                {studentsLoading ? (
                  <p className="text-muted-foreground p-3 text-sm">
                    {t('common.loading')}
                  </p>
                ) : filtered.length === 0 ? (
                  <p className="text-muted-foreground p-3 text-sm">
                    {t('payments.form.no_matches')}
                  </p>
                ) : (
                  <>
                    {shown.map((s) => {
                      const on = selected.has(s.id)
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => toggle(s.id)}
                          className="hover:bg-accent flex w-full items-center gap-3 px-3 py-2 text-left text-sm"
                        >
                          <span
                            className={`flex size-4 shrink-0 items-center justify-center rounded border ${
                              on
                                ? 'bg-primary border-primary text-primary-foreground'
                                : 'border-input'
                            }`}
                          >
                            {on ? <Check className="size-3" /> : null}
                          </span>
                          <span className="min-w-0 flex-1 truncate">
                            {studentLabel(s, t)}
                          </span>
                          <span className="text-muted-foreground shrink-0 text-xs">
                            {s.student_no}
                          </span>
                        </button>
                      )
                    })}
                    {filtered.length > shown.length ? (
                      <p className="text-muted-foreground px-3 py-2 text-xs">
                        {t('payments.form.truncated', { count: shown.length })}
                      </p>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT — invoice details */}
          <form
            id="invoice-form"
            onSubmit={onSubmit}
            className="flex flex-col gap-4 p-4 md:min-h-0 md:flex-1 md:overflow-y-auto"
          >
            <div className="grid gap-2">
              <Label>{t('payments.form.line_items')}</Label>
              <div className="grid gap-2">
                {items.map((it) => (
                  <div key={it.key} className="flex items-center gap-2">
                    <Input
                      value={it.description}
                      onChange={(e) =>
                        changeItem(it.key, { description: e.target.value })
                      }
                      placeholder={t('common.description')}
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      min="1"
                      value={it.quantity}
                      onChange={(e) =>
                        changeItem(it.key, {
                          quantity: Math.max(1, Number(e.target.value) || 1),
                        })
                      }
                      className="w-16"
                      aria-label={t('payments.form.quantity')}
                    />
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={it.unitPrice}
                      onChange={(e) =>
                        changeItem(it.key, { unitPrice: e.target.value })
                      }
                      placeholder={t('payments.form.unit_placeholder')}
                      className="w-28"
                      aria-label={t('payments.form.unit_price')}
                    />
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      onClick={() =>
                        setItems((its) =>
                          its.length > 1 ? its.filter((x) => x.key !== it.key) : its,
                        )
                      }
                      aria-label={t('payments.form.remove_item')}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="justify-self-start"
                onClick={() => setItems((its) => [...its, blankItem()])}
              >
                <Plus /> {t('payments.form.add_item')}
              </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="due">{t('payments.form.due_date')}</Label>
                <Input
                  id="due"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="tax">{t('payments.form.tax')}</Label>
                <Input
                  id="tax"
                  type="number"
                  min="0"
                  step="0.01"
                  value={tax}
                  onChange={(e) => setTax(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="notes">{t('payments.form.notes')}</Label>
              <Textarea
                id="notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            {/* Only meaningful once ToyyibPay is connected and switched on —
                there is no online charge to pass on, and nothing to part-pay,
                otherwise. */}
            {gatewayOn ? (
              <>
                <div className="flex items-center justify-between gap-4 rounded-md border p-3">
                  <div className="space-y-0.5">
                    <Label htmlFor="charge-to-payor-invoice">
                      {t('payments.form.charge_to_payor')}
                    </Label>
                    <p className="text-muted-foreground text-xs">
                      {t('payments.form.charge_to_payor.hint', {
                        amount: formatMYR(TOYYIBPAY_FPX_FEE_SEN),
                      })}
                    </p>
                  </div>
                  <Switch
                    id="charge-to-payor-invoice"
                    checked={chargeToPayor}
                    onCheckedChange={setChargeToPayor}
                  />
                </div>

                <div className="grid gap-3 rounded-md border p-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-0.5">
                      <Label htmlFor="allow-partial-invoice">
                        {t('payments.partial.allow')}
                      </Label>
                      <p className="text-muted-foreground text-xs">
                        {t('payments.partial.allow_hint', {
                          fee: formatMYR(TOYYIBPAY_FPX_FEE_SEN),
                        })}
                      </p>
                    </div>
                    <Switch
                      id="allow-partial-invoice"
                      checked={allowPartial}
                      onCheckedChange={setAllowPartial}
                    />
                  </div>
                  {allowPartial ? (
                    <div className="grid gap-1.5">
                      <Label htmlFor="min-partial-invoice">
                        {t('payments.partial.minimum')}
                      </Label>
                      <Input
                        id="min-partial-invoice"
                        type="number"
                        min="1"
                        step="0.01"
                        value={minPartial}
                        onChange={(e) => setMinPartial(e.target.value)}
                        placeholder={t('payments.partial.minimum_placeholder')}
                        className="max-w-40"
                      />
                      <p className="text-muted-foreground text-xs">
                        {t('payments.partial.minimum_hint', {
                          min: formatMYR(TOYYIBPAY_FPX_FEE_SEN),
                        })}
                      </p>
                    </div>
                  ) : null}
                </div>
              </>
            ) : null}

            <div className="bg-muted mt-auto flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
              <span className="text-muted-foreground">
                {tn('payments.form.per_student', selected.size, {
                  amount: formatMYR(perStudentSen),
                })}
              </span>
              <span className="font-semibold">
                {t('payments.form.grand_total', {
                  amount: formatMYR(grandTotalSen),
                })}
              </span>
            </div>

            {error ? <p className="text-destructive text-sm">{error}</p> : null}
          </form>
        </div>

        <DialogFooter className="border-t px-6 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={createInvoices.isPending}
          >
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            form="invoice-form"
            disabled={createInvoices.isPending || selected.size === 0}
          >
            {createInvoices.isPending
              ? t('common.creating')
              : selected.size > 1
                ? t('payments.form.submit_many', { count: selected.size })
                : t('payments.form.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
