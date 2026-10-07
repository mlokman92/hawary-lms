import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { Appearance, useColorScheme } from 'react-native'
import { kvGet, kvSet } from '@/lib/kv'
import type { Tone } from '@/lib/tone'

/**
 * The web app's neutral shadcn theme (`apps/web/src/index.css`) as plain
 * values, so the two surfaces read as one product. Nothing decorative: a
 * background, a card, a border, one accent for the primary action.
 */
export type Palette = {
  background: string
  card: string
  foreground: string
  muted: string
  mutedForeground: string
  border: string
  primary: string
  primaryForeground: string
  destructive: string
  tone: Record<Tone, string>
}

const light: Palette = {
  background: '#f5f5f5',
  card: '#ffffff',
  foreground: '#0a0a0a',
  muted: '#f0f0f0',
  mutedForeground: '#737373',
  border: '#e5e5e5',
  primary: '#171717',
  primaryForeground: '#fafafa',
  destructive: '#dc2626',
  tone: {
    info: '#2563eb',
    positive: '#059669',
    warning: '#d97706',
    danger: '#dc2626',
    accent: '#7c3aed',
    muted: '#737373',
  },
}

const dark: Palette = {
  background: '#0a0a0a',
  card: '#171717',
  foreground: '#fafafa',
  muted: '#262626',
  mutedForeground: '#a1a1a1',
  border: '#2e2e2e',
  primary: '#e5e5e5',
  primaryForeground: '#171717',
  destructive: '#f87171',
  tone: {
    info: '#60a5fa',
    positive: '#34d399',
    warning: '#fbbf24',
    danger: '#f87171',
    accent: '#a78bfa',
    muted: '#a1a1a1',
  },
}

export type ThemePref = 'system' | 'light' | 'dark'

type ThemeValue = {
  c: Palette
  dark: boolean
  pref: ThemePref
  setPref: (p: ThemePref) => void
}

const Ctx = createContext<ThemeValue | undefined>(undefined)

/**
 * Tell the platform, so the surfaces the app does not draw — alerts, pickers,
 * the keyboard — match. Absent on the web target, which is only ever used to
 * look at a screen during development.
 */
function applyToPlatform(p: ThemePref) {
  Appearance.setColorScheme?.(p === 'system' ? 'unspecified' : p)
}

function storedPref(): ThemePref {
  const v = kvGet('hawary.theme')
  return v === 'light' || v === 'dark' ? v : 'system'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme()
  const [pref, setPrefState] = useState<ThemePref>(() => {
    const p = storedPref()
    applyToPlatform(p)
    return p
  })

  const setPref = useCallback((p: ThemePref) => {
    kvSet('hawary.theme', p)
    applyToPlatform(p)
    setPrefState(p)
  }, [])

  const value = useMemo<ThemeValue>(() => {
    const isDark = pref === 'system' ? system === 'dark' : pref === 'dark'
    return { c: isDark ? dark : light, dark: isDark, pref, setPref }
  }, [pref, system, setPref])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useTheme(): ThemeValue {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useTheme must be used within <ThemeProvider>')
  return ctx
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const
export const radius = { sm: 6, md: 10, lg: 14 } as const
