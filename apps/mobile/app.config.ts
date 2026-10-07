import type { ConfigContext, ExpoConfig } from 'expo/config'

/**
 * One Expo project, two store apps.
 *
 * `APP_VARIANT` picks which one this evaluation describes — it is set by the
 * build profile in eas.json and by the `dev:*` scripts in package.json. Each
 * variant has its own name, bundle id, URL scheme, EAS project and **route
 * tree** (`src/app-student` / `src/app-academy`), so neither binary ships the
 * other app's screens. Everything outside those two folders is shared.
 *
 * See docs/mobile-apps.md.
 */
type Variant = 'student' | 'academy'

const variant: Variant =
  process.env.APP_VARIANT === 'academy' ? 'academy' : 'student'

/** The web app. Emails link here, so these are the hosts the apps claim. */
const WEB_HOST = 'app.hawary.my'

const APPS: Record<
  Variant,
  {
    name: string
    slug: string
    scheme: string
    id: string
    root: string
    /**
     * The EAS project. `eas init` prints it (it cannot write a dynamic config):
     * paste it here. See docs/mobile-apps.md → "First build".
     */
    projectId: string | undefined
    /** Web paths this app opens instead of the browser. */
    linkPrefixes: string[]
  }
> = {
  student: {
    name: 'Hawary Student LMS',
    slug: 'hawary-student-lms',
    scheme: 'hawarystudent',
    id: 'my.hawary.student',
    root: './src/app-student',
    projectId: '78ef3b72-fe35-4fb8-821a-6f45099b1aa1',
    linkPrefixes: ['/learn'],
  },
  academy: {
    name: 'Hawary Academy LMS',
    slug: 'hawary-academy-lms',
    scheme: 'hawaryacademy',
    id: 'my.hawary.academy',
    root: './src/app-academy',
    projectId: 'cd2ef49c-2de1-4fd0-9af4-a1782fc906f2',
    // Not `/`: the dashboard root would swallow every link on the host,
    // including /pay/<token>, which has to stay a web page.
    linkPrefixes: [
      '/lpkc',
      '/reports',
      '/appointments',
      '/students',
      '/instructors',
      '/courses',
      '/assessments',
      '/assignments',
      '/grading',
      '/enrollments',
      '/payments',
      '/incentives',
    ],
  },
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const app = APPS[variant]
  return {
    ...config,
    name: app.name,
    slug: app.slug,
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: app.scheme,
    userInterfaceStyle: 'automatic',
    ios: {
      bundleIdentifier: app.id,
      supportsTablet: true,
      associatedDomains: [`applinks:${WEB_HOST}`],
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        // `tel:` and WhatsApp are opened from the session and student screens.
        LSApplicationQueriesSchemes: ['whatsapp', 'tel'],
      },
    },
    android: {
      package: app.id,
      adaptiveIcon: {
        backgroundColor: '#E6F4FE',
        foregroundImage: './assets/images/android-icon-foreground.png',
        backgroundImage: './assets/images/android-icon-background.png',
        monochromeImage: './assets/images/android-icon-monochrome.png',
      },
      intentFilters: [
        {
          action: 'VIEW',
          autoVerify: true,
          data: app.linkPrefixes.map((pathPrefix) => ({
            scheme: 'https',
            host: WEB_HOST,
            pathPrefix,
          })),
          category: ['BROWSABLE', 'DEFAULT'],
        },
      ],
    },
    plugins: [
      ['expo-router', { root: app.root }],
      [
        'expo-splash-screen',
        {
          backgroundColor: '#ffffff',
          image: './assets/images/splash-icon.png',
          imageWidth: 76,
        },
      ],
      'expo-localization',
      'expo-sharing',
      '@react-native-community/datetimepicker',
      ['expo-notifications', { color: '#171717' }],
      [
        'expo-image-picker',
        {
          photosPermission:
            'Allow $(PRODUCT_NAME) to attach photos to your work.',
          cameraPermission:
            'Allow $(PRODUCT_NAME) to take a photo to attach to your work.',
        },
      ],
      [
        'expo-calendar',
        {
          calendarPermission:
            'Allow $(PRODUCT_NAME) to add your sessions to your calendar.',
        },
      ],
    ],
    experiments: {
      // Off on purpose: generated route types describe one route tree, and
      // this project has two.
      typedRoutes: false,
    },
    extra: {
      variant,
      webOrigin: `https://${WEB_HOST}`,
      eas: app.projectId ? { projectId: app.projectId } : undefined,
    },
  }
}
