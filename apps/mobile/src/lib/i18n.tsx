import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { getLocales } from 'expo-localization'
import { DICTS, type Lang, type PluralBase, type TKey } from '@hawary/shared/i18n'
import { kvGet, kvSet } from './kv'

export type { Lang, TKey } from '@hawary/shared/i18n'

/**
 * The same contract as the web app's `lib/i18n` — `useT()`, `translate()`,
 * `getLang()` — over the same dictionaries (`packages/shared/src/i18n`), so the
 * synced data hooks and the screens here read exactly as they do on the web.
 * Only the storage and the device-language probe differ. See docs/i18n.md.
 */
export const LANGS: { value: Lang; label: string; short: string }[] = [
  { value: 'en', label: 'English', short: 'EN' },
  { value: 'ms', label: 'Bahasa Melayu', short: 'BM' },
]

export type TVars = Record<string, string | number>

function isLang(value: string | null): value is Lang {
  return value === 'en' || value === 'ms'
}

/** A stored choice wins; otherwise follow the phone, falling back to English. */
function initialLang(): Lang {
  const stored = kvGet('hawary.lang')
  if (isLang(stored)) return stored
  try {
    const device = getLocales().map((l) => (l.languageCode ?? '').toLowerCase())
    return device.some((l) => l === 'ms') ? 'ms' : 'en'
  } catch {
    return 'en'
  }
}

let current: Lang = 'en'

export function getLang(): Lang {
  return current
}

function interpolate(template: string, vars?: TVars): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  )
}

function lookup(lang: Lang, key: TKey): string {
  return DICTS[lang][key] ?? DICTS.en[key] ?? key
}

/** Non-reactive translation for plain functions. Components use `useT()`. */
export function translate(key: TKey, vars?: TVars): string {
  return interpolate(lookup(current, key), vars)
}

export type TFn = (key: TKey, vars?: TVars) => string
export type TnFn = (base: PluralBase, count: number, vars?: TVars) => string

type I18nContextValue = {
  lang: Lang
  setLang: (lang: Lang) => void
  t: TFn
  tn: TnFn
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined)

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const initial = initialLang()
    current = initial
    return initial
  })

  const setLang = useCallback((next: Lang) => {
    current = next
    kvSet('hawary.lang', next)
    setLangState(next)
  }, [])

  const value = useMemo<I18nContextValue>(() => {
    const t: TFn = (key, vars) => interpolate(lookup(lang, key), vars)
    const tn: TnFn = (base, count, vars) =>
      t((count === 1 ? `${base}_one` : `${base}_other`) as TKey, {
        count,
        ...vars,
      })
    return { lang, setLang, t, tn }
  }, [lang, setLang])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useT(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useT must be used within <LanguageProvider>')
  return ctx
}
