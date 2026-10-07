import AsyncStorage from '@react-native-async-storage/async-storage'

/**
 * A small synchronous key-value store over AsyncStorage.
 *
 * The web app reads `localStorage` synchronously in a dozen places — the
 * language, the theme, the active academy — and the providers ported from it
 * expect an answer during the first render. AsyncStorage cannot give one, so
 * the keys are read once at launch (`hydrateKv`, awaited behind the splash
 * screen) and served from memory after that. Writes update memory first and
 * persist in the background.
 */
const KEYS = [
  'hawary.lang',
  'hawary.theme',
  'hawary.activeAcademyId',
  'hawary.learnAcademyId',
  'hawary.pushToken',
] as const

export type KvKey = (typeof KEYS)[number]

const cache = new Map<string, string>()
let hydrated = false

export async function hydrateKv(): Promise<void> {
  if (hydrated) return
  try {
    const pairs = await AsyncStorage.multiGet([...KEYS])
    for (const [k, v] of pairs) if (v !== null) cache.set(k, v)
  } catch {
    // Unreadable storage means first-run defaults, not a crash.
  }
  hydrated = true
}

export function kvGet(key: KvKey): string | null {
  return cache.get(key) ?? null
}

export function kvSet(key: KvKey, value: string): void {
  cache.set(key, value)
  void AsyncStorage.setItem(key, value).catch(() => {})
}

export function kvRemove(key: KvKey): void {
  cache.delete(key)
  void AsyncStorage.removeItem(key).catch(() => {})
}
