import { useEffect, useState, type FormEvent } from 'react'
import { CheckCircle2, KeyRound, Loader2 } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { formatMYR } from '@hawary/shared'
import { TOYYIBPAY_FPX_FEE_SEN } from '@/features/payments/api'
import {
  usePaymentSettings,
  useRemoveToyyibpay,
  useSaveToyyibpay,
  useSetChargeToPayor,
  useSetGatewayEnabled,
} from './api'
import { errorMessage } from '@/lib/errors'

export function ToyyibPaySettingsCard({ academyId }: { academyId: string }) {
  const { t } = useT()
  const { data: settings, isLoading } = usePaymentSettings(academyId)
  const save = useSaveToyyibpay(academyId)
  const setEnabled = useSetGatewayEnabled(academyId)
  const setChargeToPayor = useSetChargeToPayor(academyId)
  const remove = useRemoveToyyibpay(academyId)

  const connected = !!settings?.toyyibpay_has_secret
  const [replacing, setReplacing] = useState(false)
  const [secretKey, setSecretKey] = useState('')
  // Default to a Live key; admins flip Sandbox on only for testing.
  const [isSandbox, setIsSandbox] = useState(false)
  const [categoryCode, setCategoryCode] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [soft, setSoft] = useState<string | null>(null)

  // Only mirror the stored mode when replacing an already-connected key; a fresh
  // connection (no key, or after removal) always defaults to Live.
  useEffect(() => {
    if (settings?.toyyibpay_has_secret) setIsSandbox(settings.toyyibpay_is_sandbox)
  }, [settings])

  const showForm = !connected || replacing

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSoft(null)
    if (secretKey.trim().length < 8) {
      setError(t('settings.toyyibpay.error.key_required'))
      return
    }
    try {
      const res = await save.mutateAsync({
        secretKey: secretKey.trim(),
        isSandbox,
        categoryCode: categoryCode.trim() || undefined,
      })
      if (!res.ok) {
        setSoft(res.message ?? t('settings.toyyibpay.error.verify_failed'))
        return
      }
      setSecretKey('')
      setCategoryCode('')
      setReplacing(false)
    } catch (err) {
      setError(errorMessage(err, t('common.error')))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-4" /> {t('settings.toyyibpay.title')}
        </CardTitle>
        <CardDescription>
          {t('settings.toyyibpay.description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading ? (
          <p className="text-muted-foreground text-sm">{t('common.loading')}</p>
        ) : (
          <>
            {connected ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
                    {t('settings.toyyibpay.connected')}
                    <Badge variant="secondary">
                      {settings?.toyyibpay_is_sandbox
                        ? t('settings.toyyibpay.mode.sandbox')
                        : t('settings.toyyibpay.mode.live')}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {settings?.toyyibpay_category_code
                      ? t('settings.toyyibpay.secret_masked_category', {
                          last4: settings?.toyyibpay_secret_last4 ?? '····',
                          code: settings.toyyibpay_category_code,
                        })
                      : t('settings.toyyibpay.secret_masked', {
                          last4: settings?.toyyibpay_secret_last4 ?? '····',
                        })}
                  </p>
                </div>
                {!replacing ? (
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setReplacing(true)
                        setError(null)
                        setSoft(null)
                      }}
                    >
                      {t('settings.toyyibpay.replace_key')}
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          disabled={remove.isPending}
                        >
                          {remove.isPending
                            ? t('settings.toyyibpay.removing')
                            : t('settings.toyyibpay.remove_key')}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            {t('settings.toyyibpay.remove_confirm.title')}
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            {t('settings.toyyibpay.remove_confirm.body')}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>
                            {t('common.cancel')}
                          </AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => {
                              setError(null)
                              setSoft(null)
                              remove.mutate()
                            }}
                          >
                            {t('settings.toyyibpay.remove_key')}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                ) : null}
              </div>
            ) : null}

            {connected ? (
              <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="gateway-enabled">
                    {t('settings.toyyibpay.accept_online')}
                  </Label>
                  <p className="text-muted-foreground text-xs">
                    {t('settings.toyyibpay.accept_online.hint')}
                  </p>
                </div>
                <Switch
                  id="gateway-enabled"
                  checked={!!settings?.toyyibpay_enabled}
                  disabled={setEnabled.isPending}
                  onCheckedChange={(v) => setEnabled.mutate(v)}
                />
              </div>
            ) : null}

            {connected ? (
              <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="charge-to-payor">
                    {t('settings.toyyibpay.charge_to_payor')}
                  </Label>
                  <p className="text-muted-foreground text-xs">
                    {t('settings.toyyibpay.charge_to_payor.hint', {
                      amount: formatMYR(TOYYIBPAY_FPX_FEE_SEN),
                    })}
                  </p>
                </div>
                <Switch
                  id="charge-to-payor"
                  checked={!!settings?.toyyibpay_charge_to_payor}
                  disabled={setChargeToPayor.isPending}
                  onCheckedChange={(v) => setChargeToPayor.mutate(v)}
                />
              </div>
            ) : null}

            {showForm ? (
              <form onSubmit={onSubmit} className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="secret">
                    {t('settings.toyyibpay.secret_label')}
                  </Label>
                  <Input
                    id="secret"
                    type="password"
                    autoComplete="off"
                    value={secretKey}
                    onChange={(e) => setSecretKey(e.target.value)}
                    placeholder={t('settings.toyyibpay.secret_placeholder')}
                  />
                  <p className="text-muted-foreground text-xs">
                    {t('settings.toyyibpay.secret_hint')}
                  </p>
                </div>

                {/* Advanced settings are hidden by default so a non-technical
                    admin just pastes their (live) key and connects. */}
                {showAdvanced ? (
                  <div className="grid gap-4 rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-4">
                      <div className="space-y-0.5">
                        <Label htmlFor="sandbox">
                          {t('settings.toyyibpay.sandbox_label')}
                        </Label>
                        <p className="text-muted-foreground text-xs">
                          {t('settings.toyyibpay.sandbox_hint')}
                        </p>
                      </div>
                      <Switch
                        id="sandbox"
                        checked={isSandbox}
                        onCheckedChange={setIsSandbox}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="category">
                        {t('settings.toyyibpay.category_label')}
                      </Label>
                      <Input
                        id="category"
                        value={categoryCode}
                        onChange={(e) => setCategoryCode(e.target.value)}
                        placeholder={t('settings.toyyibpay.category_placeholder')}
                      />
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground justify-self-start text-xs underline"
                    onClick={() => setShowAdvanced(true)}
                  >
                    {t('settings.toyyibpay.advanced')}
                  </button>
                )}

                {error ? <p className="text-destructive text-sm">{error}</p> : null}
                {soft ? (
                  <p className="text-sm text-amber-600 dark:text-amber-400">{soft}</p>
                ) : null}

                <div className="flex items-center gap-2">
                  <Button type="submit" disabled={save.isPending}>
                    {save.isPending ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />{' '}
                        {t('settings.toyyibpay.verifying')}
                      </>
                    ) : connected ? (
                      t('settings.toyyibpay.save_new_key')
                    ) : (
                      t('settings.toyyibpay.connect')
                    )}
                  </Button>
                  {replacing ? (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setReplacing(false)
                        setSecretKey('')
                        setError(null)
                        setSoft(null)
                      }}
                    >
                      {t('common.cancel')}
                    </Button>
                  ) : null}
                </div>
              </form>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}
