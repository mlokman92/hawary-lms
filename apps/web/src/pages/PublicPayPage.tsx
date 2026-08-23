import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Loader2, ShieldCheck } from 'lucide-react'
import { formatMYR, ringgitToSen } from '@hawary/shared'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  useCreateBill,
  usePublicInvoice,
  TOYYIBPAY_FPX_FEE_SEN,
  type PublicInvoice,
} from '@/features/payments/api'
import { useT, type TFn } from '@/lib/i18n'
import { useNoReferrer } from '@/lib/useNoReferrer'
import { errorMessage } from '@/lib/errors'

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-muted flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  )
}

/** Sen → the string the amount input shows, e.g. 250000 → "2500.00". */
const senToInput = (sen: number) => (sen / 100).toFixed(2)

export function PublicPayPage() {
  // Don't leak the bearer token to ToyyibPay (or anyone) via the Referer header.
  useNoReferrer()
  const { t } = useT()
  const { token } = useParams<{ token: string }>()
  const { data: invoice, isLoading, error } = usePublicInvoice(token)
  const createBill = useCreateBill()
  const [message, setMessage] = useState<string | null>(null)

  // "Pay in full" vs "pay part of it". Full is the default on every visit: an
  // instalment is the exception even where it is allowed.
  const [partial, setPartial] = useState(false)
  const [amount, setAmount] = useState('')

  const dueSen = invoice?.due_sen ?? 0
  const minSen = invoice?.min_pay_sen ?? 0
  const typedSen = ringgitToSen(amount)
  // What we will actually ask to be billed. Anything at or above the balance is
  // a payment in full, so it is sent as one.
  const payingSen = partial && typedSen > 0 && typedSen < dueSen ? typedSen : dueSen
  const amountError = partial ? validateAmount(typedSen, minSen, dueSen, t) : null

  const feeSen = invoice?.charge_to_payor ? TOYYIBPAY_FPX_FEE_SEN : 0
  const debitedSen = payingSen + feeSen

  async function pay() {
    if (!token || amountError) return
    setMessage(null)
    try {
      // Send the amount only for a genuine instalment; a payment in full omits
      // it so the server bills whatever the balance is at that moment — which
      // may have moved since this page loaded.
      const res = await createBill.mutateAsync(
        partial && payingSen < dueSen ? { token, amountSen: payingSen } : { token },
      )
      if (res.ok && res.url) {
        window.location.href = res.url
        return
      }
      setMessage(
        res.message ??
          (res.code === 'not_configured'
            ? t('pay.error.not_configured')
            : t('pay.error.start_failed')),
      )
    } catch (err) {
      setMessage(errorMessage(err, t('common.error')))
    }
  }

  if (isLoading) {
    return (
      <Shell>
        <div className="text-muted-foreground grid place-items-center py-16 text-sm">
          {t('common.loading')}
        </div>
      </Shell>
    )
  }

  if (error || !invoice) {
    return (
      <Shell>
        <Card>
          <CardHeader>
            <CardTitle>{t('pay.unavailable.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              {t('pay.unavailable.body')}
            </p>
          </CardContent>
        </Card>
      </Shell>
    )
  }

  const paid = invoice.status === 'paid'
  const canPay = invoice.gateway_enabled && invoice.due_sen > 0 && !paid
  // Nothing to choose when the minimum has met the balance — an RM30 remainder
  // under an RM50 minimum instalment is payable, but only in full.
  const canSplit = canPay && invoice.allow_partial && invoice.min_pay_sen < invoice.due_sen

  return (
    <Shell>
      <div className="mb-6 text-center">
        <div className="text-lg font-semibold tracking-tight">
          {invoice.academy_name}
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t('pay.invoice_no', { no: invoice.invoice_no })}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-lg border p-4 text-center">
            <p className="text-muted-foreground text-xs">{t('pay.amount_due')}</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums">
              {formatMYR(invoice.due_sen)}
            </p>
            {invoice.amount_paid_sen > 0 && !paid ? (
              <p className="text-muted-foreground mt-1 text-xs">
                {t('pay.partially_paid', {
                  paid: formatMYR(invoice.amount_paid_sen),
                  total: formatMYR(invoice.total_sen),
                })}
              </p>
            ) : null}
          </div>

          {paid ? (
            <p className="rounded-md bg-emerald-50 p-3 text-center text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
              {t('pay.fully_paid')}
            </p>
          ) : canPay ? (
            <>
              {canSplit ? (
                <AmountChoice
                  invoice={invoice}
                  partial={partial}
                  amount={amount}
                  payingSen={payingSen}
                  error={amountError}
                  onModeChange={(next) => {
                    setPartial(next)
                    setMessage(null)
                    // Seed the field with the minimum so the first keystroke
                    // edits a valid figure rather than clearing an empty one.
                    if (next && !amount) setAmount(senToInput(invoice.min_pay_sen))
                  }}
                  onAmountChange={(v) => {
                    setAmount(v)
                    setMessage(null)
                  }}
                />
              ) : null}

              {/* Say it before they click: with the charge passed on, FPX debits
                  more than the amount above, and a surprise at the bank page is
                  how a payment gets abandoned. The charge is per transaction, so
                  paying in instalments incurs it each time. */}
              {invoice.charge_to_payor ? (
                <p className="text-muted-foreground rounded-md border border-dashed p-3 text-center text-xs">
                  {t(
                    canSplit ? 'pay.charge_notice_each' : 'pay.charge_notice',
                    {
                      fee: formatMYR(TOYYIBPAY_FPX_FEE_SEN),
                      total: formatMYR(debitedSen),
                    },
                  )}
                </p>
              ) : null}
              <Button
                className="w-full"
                size="lg"
                onClick={() => void pay()}
                disabled={createBill.isPending || !!amountError}
              >
                {createBill.isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />{' '}
                    {t('pay.starting')}
                  </>
                ) : (
                  t('pay.pay_with_fpx', { amount: formatMYR(payingSen) })
                )}
              </Button>
              <p className="text-muted-foreground flex items-center justify-center gap-1.5 text-xs">
                <ShieldCheck className="size-3.5" /> {t('pay.secured_by')}
              </p>
            </>
          ) : (
            <p className="text-muted-foreground text-center text-sm">
              {t('pay.offline_only', { academy: invoice.academy_name })}
            </p>
          )}

          {message ? (
            <p className="text-destructive text-center text-sm">{message}</p>
          ) : null}
        </CardContent>
      </Card>
    </Shell>
  )
}

/**
 * Full-or-part choice plus the amount field.
 *
 * The two options are plain buttons rather than a Select: there are exactly two
 * and both need to be readable at a glance on a phone, which is where an FPX
 * payment is nearly always made.
 */
function AmountChoice({
  invoice,
  partial,
  amount,
  payingSen,
  error,
  onModeChange,
  onAmountChange,
}: {
  invoice: PublicInvoice
  partial: boolean
  amount: string
  payingSen: number
  error: string | null
  onModeChange: (partial: boolean) => void
  onAmountChange: (value: string) => void
}) {
  const { t } = useT()
  const remaining = Math.max(0, invoice.due_sen - payingSen)

  const options = useMemo(
    () => [
      { value: false, label: t('pay.amount.full'), hint: formatMYR(invoice.due_sen) },
      { value: true, label: t('pay.amount.part'), hint: t('pay.amount.part_hint') },
    ],
    [invoice.due_sen, t],
  )

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {options.map((opt) => (
          <button
            key={String(opt.value)}
            type="button"
            aria-pressed={partial === opt.value}
            onClick={() => onModeChange(opt.value)}
            className={`rounded-lg border p-3 text-left transition-colors ${
              partial === opt.value
                ? 'border-primary bg-primary/5'
                : 'hover:bg-accent'
            }`}
          >
            <span className="block text-sm font-medium">{opt.label}</span>
            <span className="text-muted-foreground block text-xs tabular-nums">
              {opt.hint}
            </span>
          </button>
        ))}
      </div>

      {partial ? (
        <div className="grid gap-1.5">
          <Label htmlFor="pay-amount">{t('pay.amount.label')}</Label>
          <Input
            id="pay-amount"
            type="number"
            inputMode="decimal"
            min={invoice.min_pay_sen / 100}
            max={invoice.due_sen / 100}
            step="0.01"
            value={amount}
            onChange={(e) => onAmountChange(e.target.value)}
            aria-invalid={!!error}
            aria-describedby="pay-amount-hint"
          />
          <p
            id="pay-amount-hint"
            className={error ? 'text-destructive text-xs' : 'text-muted-foreground text-xs'}
          >
            {error ??
              t('pay.amount.remaining', {
                min: formatMYR(invoice.min_pay_sen),
                remaining: formatMYR(remaining),
              })}
          </p>
        </div>
      ) : null}
    </div>
  )
}

/**
 * Client-side echo of the bounds `create-bill` enforces, so a bad figure is
 * caught before a round trip. The server is still the authority — this only
 * decides whether the button is worth pressing.
 */
function validateAmount(
  typedSen: number,
  minSen: number,
  dueSen: number,
  t: TFn,
): string | null {
  if (typedSen <= 0) return t('pay.amount.error_required')
  if (typedSen < minSen)
    return t('pay.amount.error_min', { min: formatMYR(minSen) })
  if (typedSen > dueSen)
    return t('pay.amount.error_max', { max: formatMYR(dueSen) })
  return null
}
