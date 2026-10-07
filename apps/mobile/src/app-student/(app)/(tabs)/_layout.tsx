import { AppTabs } from '@/shell/nav'

/**
 * LPKC is the middle tab: it is what students open the app for most — the
 * same finding that built the feature (docs/report-checks.md). My work, which
 * the dashboard already leads into, is under More.
 */
export default function StudentTabs() {
  return (
    <AppTabs
      tabs={[
        { name: 'index', titleKey: 'nav.learn.dashboard', icon: 'home' },
        { name: 'courses', titleKey: 'nav.learn.courses', icon: 'book-open' },
        { name: 'reports', titleKey: 'nav.learn.reports', icon: 'clipboard' },
        { name: 'appointments', titleKey: 'nav.learn.appointments', icon: 'calendar' },
        { name: 'more', titleKey: 'm.tab.more', icon: 'menu' },
      ]}
    />
  )
}
