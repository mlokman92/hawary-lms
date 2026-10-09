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

/**
 * Firebase's Android client file. Push on Android goes through FCM, and FCM
 * will not hand a phone a token without it. One file serves both apps — it
 * lists a client per package name. Optional on purpose: without it the app
 * still builds and runs, it just cannot be pushed to (docs/mobile-apps.md →
 * "Push credentials").
 */
const GOOGLE_SERVICES = './google-services.json'
// `require`, not an import: the app's tsconfig has no Node types, and this file
// is the one place that runs in Node. Expo evaluates it from the project root.
const { existsSync } = require('fs') as { existsSync: (path: string) => boolean }
const hasGoogleServices = existsSync(GOOGLE_SERVICES)

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
  // Each app has its own icon: the academy's shield on warm white for Student,
  // on deep green for Academy (docs/mobile-apps.md → "Icons").
  const art = `./assets/images/${variant}`
  return {
    ...config,
    name: app.name,
    slug: app.slug,
    // Also the RUNTIME VERSION (below): an over-the-air update reaches only the
    // builds that carry the same number. Raise it for every store release that
    // changes native code — a new package, a new permission, an SDK upgrade —
    // so an update written for the new binary is never sent to the old one.
    // 1.0.1 is the first build that can be updated over the air at all.
    version: '1.0.1',
    runtimeVersion: { policy: 'appVersion' },
    // EAS Update, one feed per app. `eas update` publishes to it; the build's
    // channel (eas.json) says which branch of it a binary listens to.
    updates: app.projectId
      ? { url: `https://u.expo.dev/${app.projectId}` }
      : undefined,
    orientation: 'portrait',
    icon: `${art}/icon.png`,
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
      ...(hasGoogleServices ? { googleServicesFile: GOOGLE_SERVICES } : null),
      // No monochrome layer: the two apps differ only in their ground, so a
      // themed (single-colour) icon would make them identical.
      adaptiveIcon: {
        foregroundImage: `${art}/adaptive-foreground.png`,
        backgroundImage: `${art}/adaptive-background.png`,
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
    // The web target is a preview, not a product: it is how a screen is looked
    // at in a browser without a device build (`pnpm web:student`). Camera,
    // calendar and push do nothing there. See docs/mobile-apps.md.
    web: {
      bundler: 'metro',
      output: 'single',
      favicon: './assets/images/favicon.png',
    },
    plugins: [
      ['expo-router', { root: app.root }],
      [
        'expo-splash-screen',
        {
          backgroundColor: '#ffffff',
          image: './assets/images/splash-icon.png',
          imageWidth: 132,
        },
      ],
      'expo-localization',
      'expo-sharing',
      '@react-native-community/datetimepicker',
      [
        'expo-notifications',
        // Android draws the status-bar icon from alpha alone: it must be a
        // white glyph on nothing, or it shows as a grey square.
        { icon: './assets/images/notification-icon.png', color: '#0f766e' },
      ],
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
