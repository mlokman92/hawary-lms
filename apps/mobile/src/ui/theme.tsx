import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { Appearance, useColorScheme, type ViewStyle } from 'react-native'
import { kvGet, kvSet } from '@/lib/kv'
import type { Tone } from '@/lib/tone'

/**
 * The look of both apps, as plain values.
 *
 * It is the web app's theme (`apps/web/src/index.css`) carried to a phone:
 * the same zinc neutrals, the same **teal** as the one brand colour, and the
 * same typeface, **Figtree**. The values below are the hex equivalents of the
 * web's oklch tokens, so the two surfaces read as one product.
 *
 * What a phone adds is shape and depth: a tinted canvas with white cards on it,
 * large radii, soft shadows in light mode (a hairline in dark, where a shadow
 * is invisible), and tinted fills in place of outlines.
 */
export type Palette = {
  /** The canvas behind everything. */
  background: string
  /** Cards, sheets, the tab bar. */
  card: string
  foreground: string
  /** A quiet fill inside a card: pressed rows, a time box, a neutral badge. */
  muted: string
  mutedForeground: string
  border: string
  /** The brand as a FILL: the primary button, a selected chip. */
  primary: string
  primaryForeground: string
  /** The brand as INK on a surface: links, icons, the active tab. */
  brand: string
  /** The brand as a tint behind an icon or a secondary button. */
  brandSoft: string
  destructive: string
  tone: Record<Tone, string>
}

const light: Palette = {
  background: '#f4f4f6',
  card: '#ffffff',
  foreground: '#09090b',
  muted: '#f1f1f4',
  mutedForeground: '#71717a',
  border: '#e4e4e7',
  primary: '#0f766e',
  primaryForeground: '#ffffff',
  brand: '#0f766e',
  brandSoft: '#def5f1',
  destructive: '#dc2626',
  tone: {
    info: '#2563eb',
    positive: '#059669',
    warning: '#d97706',
    danger: '#dc2626',
    accent: '#7c3aed',
    muted: '#71717a',
  },
}

const dark: Palette = {
  background: '#09090b',
  card: '#18181b',
  foreground: '#fafafa',
  muted: '#27272a',
  mutedForeground: '#a1a1aa',
  border: '#2c2c31',
  primary: '#0d9488',
  primaryForeground: '#ffffff',
  brand: '#2dd4bf',
  brandSoft: '#12332f',
  destructive: '#f87171',
  tone: {
    info: '#60a5fa',
    positive: '#34d399',
    warning: '#fbbf24',
    danger: '#f87171',
    accent: '#a78bfa',
    muted: '#a1a1aa',
  },
}

// ---------------------------------------------------------------------------
// Type
// ---------------------------------------------------------------------------

export type Weight = 400 | 500 | 600 | 700 | 800

/**
 * Figtree, one file per weight (`assets/fonts`, loaded in `shell/AppRoot`).
 *
 * A weight is chosen by FAMILY, never by `fontWeight`: Android has no way to
 * find the bold cut of a custom font from a weight number, and would smear a
 * fake bold over the regular one instead. Everything that draws text goes
 * through `font()` for that reason.
 */
export const FONT_FILES = {
  'Figtree-Regular': require('../../assets/fonts/Figtree_400Regular.ttf'),
  'Figtree-Medium': require('../../assets/fonts/Figtree_500Medium.ttf'),
  'Figtree-SemiBold': require('../../assets/fonts/Figtree_600SemiBold.ttf'),
  'Figtree-Bold': require('../../assets/fonts/Figtree_700Bold.ttf'),
  'Figtree-ExtraBold': require('../../assets/fonts/Figtree_800ExtraBold.ttf'),
} as const

const FAMILY: Record<Weight, keyof typeof FONT_FILES> = {
  400: 'Figtree-Regular',
  500: 'Figtree-Medium',
  600: 'Figtree-SemiBold',
  700: 'Figtree-Bold',
  800: 'Figtree-ExtraBold',
}

export function font(weight: Weight = 400): string {
  return FAMILY[weight]
}

/** A `fontWeight` as written in a style ('600', 600, 'bold') as one of ours. */
export function toWeight(value: unknown): Weight {
  if (value === 'bold') return 700
  const n = typeof value === 'string' ? parseInt(value, 10) : Number(value)
  if (!Number.isFinite(n) || n < 450) return 400
  if (n < 550) return 500
  if (n < 650) return 600
  if (n < 750) return 700
  return 800
}

// ---------------------------------------------------------------------------
// Shape and depth
// ---------------------------------------------------------------------------

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const
export const radius = { sm: 10, md: 14, lg: 20, pill: 999 } as const

/** A colour at reduced strength, for a tint behind its own ink. */
export function soft(hex: string, dark: boolean): string {
  return `${hex}${dark ? '2e' : '1f'}`
}

/**
 * How a raised surface separates from the canvas: a soft shadow in light mode,
 * a hairline in dark mode, where a shadow cannot be seen.
 */
export function elevation(c: Palette, isDark: boolean): ViewStyle {
  if (isDark) return { borderWidth: 1, borderColor: c.border }
  return {
    boxShadow: '0 1px 2px rgba(24,24,27,0.04), 0 6px 20px rgba(24,24,27,0.05)',
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

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
