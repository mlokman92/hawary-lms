// Where things are, for every script in this folder.

import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const HERE = path.dirname(fileURLToPath(import.meta.url))
export const CAPTURE_DIR = path.resolve(HERE, '..')
export const VIDEO_DIR = path.resolve(CAPTURE_DIR, '../..')
export const REPO_DIR = path.resolve(VIDEO_DIR, '..')
export const MOBILE_ROOT = path.join(REPO_DIR, 'apps/mobile')

export const VARIANTS = ['student', 'academy']
export const distOf = (variant) => path.join(HERE, `dist-${variant}`)
export const outOf = (variant) => path.join(VIDEO_DIR, 'public/shots', variant)

/** Ports that belong to other things on this machine. Never ours. */
export const FORBIDDEN_PORTS = [5173, 5199, 8081, 8191, 8192]
export const DEFAULT_PORT = { student: 5341, academy: 5342 }

export const HARNESS_NAME = 'hawary-capture-mobile'
export const DUMMY_SUPABASE_URL = 'http://127.0.0.1:9'
export const DUMMY_SUPABASE_KEY = 'sb_publishable_capture_harness_not_a_key'
/** The real project's ref. It must never appear in an exported bundle. */
export const REAL_PROJECT_REF = 'vpklztxqkvqmmzsxfqgp'

/** The phone the film frames: CSS px, at 3x. The film adds its own status bar and home indicator. */
export const PHONE = { w: 390, h: 763, dpr: 3 }
