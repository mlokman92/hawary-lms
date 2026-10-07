import { AppLayout } from '@/shell/nav'

// A deep link straight to a detail screen still gets the tabs underneath it,
// so Back has somewhere to go.
export const unstable_settings = { anchor: '(tabs)' }

export default AppLayout
