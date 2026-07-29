import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Link2, Mail, RefreshCw } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { InviteLink } from '@/features/students/InviteLink'
import { usePaymentSettings } from '@/features/settings/api'
import {
  useCheckPayment,
  useEnsurePayToken,
  useSendPayLink,
  type SendPayLinkResult,
  type VerifyResult,
} from './api'

export function PayLinkCard({
  academyId,
  invoiceId,
  initialToken,
  canPay,
}: {
  academyId: string
  invoiceId: string
  initialToken: string | null
  canPay: boolean
}) {
  const { t } = useT()
  const { data: settings } = usePaymentSettings(academyId)
  const ensureToken = useEnsurePayToken()
  const sendLink = useSendPayLink()
  const check = useCheckPayment(academyId, invoiceId)

  const [token, setToken] = useState<string | null>(initialToken)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<SendPayLinkResult | null>(null)
  const [checked, setChecked] = useState<VerifyResult | null>(null)

  const enabled = !!settings?.toyyibpay_enabled
  const payUrl = token ? `${window.location.origin}/pay/${token}` : null

  async function share() {
    setError(null)
    try {
      const t = await ensureToken.mutateAsync(invoiceId)
      setToken(t)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t('payments.pay_link.error_create'),
      )
    }
  }

  async function email() {
    setError(null)
    setSent(null)
    try {
      setSent(await sendLink.mutateAsync(invoiceId))
    } catch (err) {
      setSent({
        ok: false,
        code: 'send_failed',
        message:
          err instanceof Error ? err.message : t('payments.error.email_failed'),
      })
    }
  }

  async function checkStatus() {
    if (!token) return
    setError(null)
    setChecked(null)
    try {
      setChecked(await check.mutateAsync(token))
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t('payments.pay_link.error_check'),
      )
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="size-4" /> {t('payments.pay_link.title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!enabled ? (
          <p className="text-muted-foreground text-sm">
            {t('payments.pay_link.disabled')}{' '}
            <Link to="/settings" className="text-primary underline underline-offset-4">
              {t('payments.pay_link.connect')}
            </Link>{' '}
            {t('payments.pay_link.disabled_suffix')}
          </p>
        ) : !canPay ? (
          <p className="text-muted-foreground text-sm">
            {t('payments.pay_link.not_payable')}
          </p>
        ) : (
          <>
            <p className="text-muted-foreground text-sm">
              {t('payments.pay_link.intro')}
            </p>

            {payUrl ? (
              <div className="space-y-3">
                <InviteLink url={payUrl} />
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void email()}
                    disabled={sendLink.isPending}
                  >
                    <Mail />{' '}
                    {sendLink.isPending
                      ? t('common.sending')
                      : t('payments.pay_link.email')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void checkStatus()}
                    disabled={check.isPending}
                  >
                    <RefreshCw className={check.isPending ? 'animate-spin' : ''} />
                    {check.isPending
                      ? t('payments.pay_link.checking')
                      : t('payments.pay_link.check')}
                  </Button>
                  <Button asChild type="button" variant="ghost" size="sm">
                    <a href={payUrl} target="_blank" rel="noreferrer">
                      {t('payments.pay_link.preview')}
                    </a>
                  </Button>
                </div>
                {sent ? (
                  sent.ok ? (
                    <p className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="size-4" />
                      {sent.to
                        ? t('payments.pay_link.sent_to', { email: sent.to })
                        : t('payments.pay_link.sent')}
                    </p>
                  ) : (
                    <p className="text-muted-foreground text-sm">
                      {sent.message ?? t('payments.pay_link.send_failed')}
                    </p>
                  )
                ) : null}
                {checked ? (
                  checked.invoice_status === 'paid' ? (
                    <p className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="size-4" />{' '}
                      {t('payments.pay_link.confirmed')}
                    </p>
                  ) : (
                    <p className="text-muted-foreground text-sm">
                      {t('payments.pay_link.not_found_yet')}
                    </p>
                  )
                ) : null}
              </div>
            ) : (
              <Button onClick={() => void share()} disabled={ensureToken.isPending}>
                <Link2 />{' '}
                {ensureToken.isPending
                  ? t('common.creating')
                  : t('payments.pay_link.create')}
              </Button>
            )}

            {error ? <p className="text-destructive text-sm">{error}</p> : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}
