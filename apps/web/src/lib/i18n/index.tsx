import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { DICTS, type Lang, type PluralBase, type TKey } from './dict'

export type { Lang, TKey } from './dict'

/** Offered in the user menu, in this order. */
// eslint-disable-next-line react-refresh/only-export-components
export const LANGS: { value: Lang; label: string; short: string }[] = [
  { value: 'en', label: 'English', short: 'EN' },
  { value: 'ms', label: 'Bahasa Melayu', short: 'BM' },
]

const STORAGE_KEY = 'hawary.lang'

export type TVars = Record<string, string | number>

function isLang(value: string | null): value is Lang {
  return value === 'en' || value === 'ms'
}

/**
 * A stored choice always wins. With none, follow the browser — a Malaysian
 * user whose device is set to BM should not have to find the switcher — and
 * fall back to English.
 */
function initialLang(): Lang {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (isLang(stored)) return stored
  const preferred = navigator.languages ?? [navigator.language]
  return preferred.some((l) => l.toLowerCase().startsWith('ms')) ? 'ms' : 'en'
}

/**
 * Module-level mirror of the React state, for the few call sites that format
 * copy outside a component (see `lib/format.ts`). It is written by the same
 * code paths that write the state, never independently.
 */
let current: Lang = 'en'

// eslint-disable-next-line react-refresh/only-export-components
export function getLang(): Lang {
  return current
}

/** `{name}` placeholders. An unknown name is left alone rather than blanked. */
function interpolate(template: string, vars?: TVars): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  )
}

function lookup(lang: Lang, key: TKey): string {
  // The `ms` dictionary is type-checked complete, so the fallbacks only matter
  // if a key is ever reached through a cast.
  return DICTS[lang][key] ?? DICTS.en[key] ?? key
}

/**
 * Non-reactive translation, for helpers that are plain functions. Components
 * must use `useT()` instead — this does not subscribe to language changes.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function translate(key: TKey, vars?: TVars): string {
  return interpolate(lookup(current, key), vars)
}

export type TFn = (key: TKey, vars?: TVars) => string
/** Picks `<base>_one` / `<base>_other` and injects `{count}` for you. */
export type TnFn = (base: PluralBase, count: number, vars?: TVars) => string

type I18nContextValue = {
  lang: Lang
  setLang: (lang: Lang) => void
  t: TFn
  tn: TnFn
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined)

export function LanguageProvider({
  children,
  defaultLang,
}: {
  children: ReactNode
  defaultLang?: Lang
}) {
  const [lang, setLangState] = useState<Lang>(() => {
    const initial = defaultLang ?? initialLang()
    current = initial
    return initial
  })

  useEffect(() => {
    // Screen readers and the browser's own translate prompt both key off this.
    document.documentElement.lang = lang
  }, [lang])

  const setLang = useCallback((next: Lang) => {
    current = next
    localStorage.setItem(STORAGE_KEY, next)
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

// eslint-disable-next-line react-refresh/only-export-components
export function useT(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useT must be used within <LanguageProvider>')
  return ctx
}
