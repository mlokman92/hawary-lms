import { AppTabs } from '@/shell/nav'

export default function StudentTabs() {
  return (
    <AppTabs
      tabs={[
        { name: 'index', titleKey: 'nav.learn.dashboard', icon: 'home' },
        { name: 'courses', titleKey: 'nav.learn.courses', icon: 'book-open' },
        { name: 'work', titleKey: 'nav.learn.work', icon: 'check-square' },
        { name: 'appointments', titleKey: 'nav.learn.appointments', icon: 'calendar' },
        { name: 'more', titleKey: 'm.tab.more', icon: 'menu' },
      ]}
    />
  )
}
