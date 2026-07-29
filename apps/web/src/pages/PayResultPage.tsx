import { Link, useParams } from 'react-router-dom'
import { CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useVerifyPayment } from '@/features/payments/api'
import { useT } from '@/lib/i18n'
import { useNoReferrer } from '@/lib/useNoReferrer'

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-muted flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  )
}

export function PayResultPage() {
  useNoReferrer()
  const { t } = useT()
  const { token } = useParams<{ token: string }>()

  // Actively reconcile against ToyyibPay until settled — the gateway's redirect
  // params are only a hint, and the callback may never arrive.
  const { data, isLoading } = useVerifyPayment(token)
  const settledPaid =
    data?.invoice_status === 'paid' || data?.intent_status === 'succeeded'
  const failed = data?.intent_status === 'failed'
  const confirming = !settledPaid && !failed

  return (
    <Shell>
      <Card>
        <CardHeader>
          <CardTitle>{t('pay.result.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          {isLoading || confirming ? (
            <>
              <Clock className="text-muted-foreground mx-auto size-10" />
              <div>
                <p className="font-medium">{t('pay.result.confirming')}</p>
                <p className="text-muted-foreground mt-1 flex items-center justify-center gap-1.5 text-sm">
                  <Loader2 className="size-3.5 animate-spin" />{' '}
                  {t('pay.result.confirming_hint')}
                </p>
              </div>
            </>
          ) : settledPaid ? (
            <>
              <CheckCircle2 className="mx-auto size-10 text-emerald-600 dark:text-emerald-400" />
              <div>
                <p className="font-medium">{t('pay.result.paid')}</p>
                <p className="text-muted-foreground mt-1 text-sm">
                  {t('pay.result.paid_body')}
                </p>
              </div>
            </>
          ) : (
            <>
              <XCircle className="text-destructive mx-auto size-10" />
              <div>
                <p className="font-medium">{t('pay.result.failed')}</p>
                <p className="text-muted-foreground mt-1 text-sm">
                  {t('pay.result.failed_body')}
                </p>
              </div>
              {token ? (
                <Button asChild variant="outline" className="w-full">
                  <Link to={`/pay/${token}`}>
                    {t('pay.result.back_to_invoice')}
                  </Link>
                </Button>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </Shell>
  )
}
