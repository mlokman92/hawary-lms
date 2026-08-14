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
import { usePaymentSettings, useRemoveBillplz, useSaveBillplz } from './api'

export function BillplzSettingsCard({ academyId }: { academyId: string }) {
  const { t } = useT()
  const { data: settings, isLoading } = usePaymentSettings(academyId)
  const save = useSaveBillplz(academyId)
  const remove = useRemoveBillplz(academyId)

  const connected = !!settings?.billplz_has_secret
  const [replacing, setReplacing] = useState(false)
  const [secretKey, setSecretKey] = useState('')
  const [xSignatureKey, setXSignatureKey] = useState('')
  // Default to Live keys; admins flip Sandbox on only for testing.
  const [isSandbox, setIsSandbox] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [soft, setSoft] = useState<string | null>(null)
  // The Payment Order Limit is the prefunded balance a disbursement draws down,
  // and Billplz only reports it on a verified call — `billplz-connect` returns
  // it and nothing else does, so hold on to what the last connect reported.
  const [limitSen, setLimitSen] = useState<number | null>(null)

  // Only mirror the stored mode when replacing already-connected keys; a fresh
  // connection (no keys, or after removal) always defaults to Live.
  useEffect(() => {
    if (settings?.billplz_has_secret) setIsSandbox(settings.billplz_is_sandbox)
  }, [settings])

  const showForm = !connected || replacing

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSoft(null)
    if (secretKey.trim().length < 8) {
      setError(t('settings.billplz.error.secret_required'))
      return
    }
    if (xSignatureKey.trim().length < 8) {
      setError(t('settings.billplz.error.xsign_required'))
      return
    }
    try {
      const res = await save.mutateAsync({
        secretKey: secretKey.trim(),
        xSignatureKey: xSignatureKey.trim(),
        isSandbox,
      })
      if (!res.ok) {
        setSoft(res.message ?? t('settings.billplz.error.verify_failed'))
        return
      }
      setSecretKey('')
      setXSignatureKey('')
      setReplacing(false)
      setLimitSen(typeof res.limit_sen === 'number' ? res.limit_sen : null)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-4" /> {t('settings.billplz.title')}
        </CardTitle>
        <CardDescription>{t('settings.billplz.description')}</CardDescription>
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
                    {t('settings.billplz.connected')}
                    <Badge variant="secondary">
                      {settings?.billplz_is_sandbox
                        ? t('settings.billplz.mode.sandbox')
                        : t('settings.billplz.mode.live')}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {t('settings.billplz.secret_masked', {
                      last4: settings?.billplz_secret_last4 ?? '····',
                    })}
                  </p>
                  {limitSen !== null ? (
                    <p className="text-muted-foreground text-xs">
                      {t('settings.billplz.limit', {
                        amount: formatMYR(limitSen),
                      })}
                    </p>
                  ) : null}
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
                      {t('settings.billplz.replace_key')}
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
                            ? t('settings.billplz.removing')
                            : t('settings.billplz.remove_key')}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            {t('settings.billplz.remove_confirm.title')}
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            {t('settings.billplz.remove_confirm.body')}
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
                              setLimitSen(null)
                              remove.mutate()
                            }}
                          >
                            {t('settings.billplz.remove_key')}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                ) : null}
              </div>
            ) : null}

            {showForm ? (
              <form onSubmit={onSubmit} className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="billplz-secret">
                    {t('settings.billplz.secret_label')}
                  </Label>
                  <Input
                    id="billplz-secret"
                    type="password"
                    autoComplete="off"
                    value={secretKey}
                    onChange={(e) => setSecretKey(e.target.value)}
                    placeholder={t('settings.billplz.secret_placeholder')}
                  />
                  <p className="text-muted-foreground text-xs">
                    {t('settings.billplz.secret_hint')}
                  </p>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="billplz-xsign">
                    {t('settings.billplz.xsign_label')}
                  </Label>
                  <Input
                    id="billplz-xsign"
                    type="password"
                    autoComplete="off"
                    value={xSignatureKey}
                    onChange={(e) => setXSignatureKey(e.target.value)}
                    placeholder={t('settings.billplz.xsign_placeholder')}
                  />
                  {/* The X Signature Key lives on a different Billplz dashboard
                      page from the secret key, and nothing on screen says why a
                      second key is wanted — hence one line that does. */}
                  <p className="text-muted-foreground text-xs">
                    {t('settings.billplz.xsign_hint')}
                  </p>
                </div>

                {/* Advanced settings are hidden by default so a non-technical
                    admin just pastes their (live) keys and connects. */}
                {showAdvanced ? (
                  <div className="grid gap-4 rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-4">
                      <div className="space-y-0.5">
                        <Label htmlFor="billplz-sandbox">
                          {t('settings.billplz.sandbox_label')}
                        </Label>
                        <p className="text-muted-foreground text-xs">
                          {t('settings.billplz.sandbox_hint')}
                        </p>
                      </div>
                      <Switch
                        id="billplz-sandbox"
                        checked={isSandbox}
                        onCheckedChange={setIsSandbox}
                      />
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground justify-self-start text-xs underline"
                    onClick={() => setShowAdvanced(true)}
                  >
                    {t('settings.billplz.advanced')}
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
                        {t('settings.billplz.verifying')}
                      </>
                    ) : connected ? (
                      t('settings.billplz.save_new_key')
                    ) : (
                      t('settings.billplz.connect')
                    )}
                  </Button>
                  {replacing ? (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setReplacing(false)
                        setSecretKey('')
                        setXSignatureKey('')
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
