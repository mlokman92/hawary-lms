import Constants from 'expo-constants'

export type AppVariant = 'student' | 'academy'

const extra = (Constants.expoConfig?.extra ?? {}) as {
  variant?: AppVariant
  webOrigin?: string
  eas?: { projectId?: string }
}

/** Which of the two apps this binary is. Decided at build time by APP_VARIANT. */
export const APP_VARIANT: AppVariant =
  extra.variant === 'academy' ? 'academy' : 'student'

export const IS_STUDENT_APP = APP_VARIANT === 'student'

/** Needed to mint an Expo push token; absent until `eas init` has been run. */
export const EAS_PROJECT_ID: string | undefined =
  extra.eas?.projectId ?? Constants.easConfig?.projectId ?? undefined

export const WEB_ORIGIN = extra.webOrigin ?? 'https://app.hawary.my'

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
export const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''
