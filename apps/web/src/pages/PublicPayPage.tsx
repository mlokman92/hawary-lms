import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Loader2, ShieldCheck } from 'lucide-react'
import { formatMYR } from '@hawary/shared'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  useCreateBill,
  usePublicInvoice,
  TOYYIBPAY_FPX_FEE_SEN,
} from '@/features/payments/api'
import { useT } from '@/lib/i18n'
import { useNoReferrer } from '@/lib/useNoReferrer'

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-muted flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  )
}

export function PublicPayPage() {
  // Don't leak the bearer token to ToyyibPay (or anyone) via the Referer header.
  useNoReferrer()
  const { t } = useT()
  const { token } = useParams<{ token: string }>()
  const { data: invoice, isLoading, error } = usePublicInvoice(token)
  const createBill = useCreateBill()
  const [message, setMessage] = useState<string | null>(null)

  async function pay() {
    if (!token) return
    setMessage(null)
    try {
      const res = await createBill.mutateAsync(token)
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
      setMessage(err instanceof Error ? err.message : t('common.error'))
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
              {/* Say it before they click: with the charge passed on, FPX debits
                  more than the amount above, and a surprise at the bank page is
                  how a payment gets abandoned. */}
              {invoice.charge_to_payor ? (
                <p className="text-muted-foreground rounded-md border border-dashed p-3 text-center text-xs">
                  {t('pay.charge_notice', {
                    fee: formatMYR(TOYYIBPAY_FPX_FEE_SEN),
                    total: formatMYR(invoice.due_sen + TOYYIBPAY_FPX_FEE_SEN),
                  })}
                </p>
              ) : null}
              <Button
                className="w-full"
                size="lg"
                onClick={() => void pay()}
                disabled={createBill.isPending}
              >
                {createBill.isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />{' '}
                    {t('pay.starting')}
                  </>
                ) : (
                  t('pay.pay_with_fpx', { amount: formatMYR(invoice.due_sen) })
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
